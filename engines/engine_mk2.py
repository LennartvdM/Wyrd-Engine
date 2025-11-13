"""Engine MK2 implementation for workforce calendar generation."""

from __future__ import annotations

import logging
import random
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import (
    Any,
    Callable,
    Dict,
    Iterable,
    List,
    Mapping,
    MutableMapping,
    Optional,
    Sequence,
    Set,
    Tuple,
)

from archetypes import (
    DEFAULT_TEMPLATES,
    NIGHT_OWL_TEMPLATES,
    create_exhausted_parent,
    create_night_owl_freelancer,
    create_office_worker,
)
from modules.calendar_provider import CalendarProvider, default_calendar_provider
from modules.friction_model import generate_daily_friction
from models import Activity, ActivityTemplate, Event, PersonProfile, DAY_NAMES
from modules.unique_events import UniqueDay, generate_unique_day_schedule
from yearly_budget import YearlyBudget
from modules.validation import validate_week

logger = logging.getLogger(__name__)

__all__ = [
    "EngineMK2",
    "DayPlan",
    "apply_micro_jitter",
    "apply_seasonal_modifiers",
    "apply_special_period_effects",
    "normalize_mk2_events",
]


@dataclass
class DayPlan:
    """Holds generated activities and context for a single calendar day."""

    date: date
    day_name: str
    day_type: str
    activities: List[Activity]


OUTDOOR_ACTIVITIES = {"outdoor_run", "bike_ride", "park_visit", "hiking", "outdoor_walk"}


def apply_seasonal_modifiers(activities: List[Activity], seasonal: Dict[str, object]) -> None:
    EngineMK2.apply_seasonal_modifiers(activities, seasonal)


def apply_special_period_effects(
    activities: List[Activity], special: Optional[Dict[str, object]]
) -> List[Activity]:
    return EngineMK2.apply_special_period_effects(activities, special)


def apply_micro_jitter(
    events: List[Event], max_shift: int = 5, locked_activities: Optional[Set[str]] = None
) -> List[Event]:
    return EngineMK2.apply_micro_jitter(events, max_shift=max_shift, locked_activities=locked_activities)


class EngineMK2:
    """Synthetic workforce calendar engine."""

    def __init__(
        self,
        calendar_provider: Optional[CalendarProvider] = None,
        *,
        friction_generator: Optional[Callable[[int, float, float], float]] = None,
        unique_schedule_generator: Optional[
            Callable[[PersonProfile, date, "UniqueDay"], Optional[List[Activity]]]
        ] = None,
        validator: Optional[Callable[[Dict[str, List[Activity]]], List[object]]] = None,
    ) -> None:
        self._profile_factory = {
            "office": (create_office_worker, DEFAULT_TEMPLATES),
            "parent": (create_exhausted_parent, DEFAULT_TEMPLATES),
            "freelancer": (create_night_owl_freelancer, NIGHT_OWL_TEMPLATES),
        }
        self._calendar_provider: CalendarProvider = (
            calendar_provider or default_calendar_provider
        )
        self._friction_generator: Callable[[int, float, float], float]
        self._unique_schedule_generator: Callable[
            [PersonProfile, date, "UniqueDay"], Optional[List[Activity]]
        ]
        self._validator: Callable[[Dict[str, List[Activity]]], List[object]]
        self.set_friction_generator(friction_generator or generate_daily_friction)
        self.set_unique_schedule_generator(
            unique_schedule_generator or generate_unique_day_schedule
        )
        self.set_validator(validator or validate_week)

    def set_calendar_provider(self, provider: CalendarProvider) -> None:
        """Replace the calendar provider used by the engine."""

        self._calendar_provider = provider

    def set_friction_generator(
        self, generator: Optional[Callable[[int, float, float], float]]
    ) -> None:
        self._friction_generator = generator or generate_daily_friction

    def set_unique_schedule_generator(
        self,
        generator: Optional[Callable[
            [PersonProfile, date, "UniqueDay"], Optional[List[Activity]]
        ]],
    ) -> None:
        self._unique_schedule_generator = (
            generator or generate_unique_day_schedule
        )

    def set_validator(
        self, validator: Optional[Callable[[Dict[str, List[Activity]]], List[object]]]
    ) -> None:
        self._validator = validator or validate_week

    # ------------------------------------------------------------------
    # Workforce allocation helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _apply_friction(activity: Activity, friction: float) -> None:
        activity.actual_duration = max(
            1, int(activity.base_duration_minutes * activity.waste_multiplier * friction)
        )

    @staticmethod
    def _allocate_minutes(hours: float, days: int) -> int:
        """Convert weekly hours into per-day minutes for a fixed number of days."""

        if hours <= 0 or days <= 0:
            return 0

        weekly_minutes = hours * 60.0
        occurrences = max(1, days)
        per_day_minutes = weekly_minutes / occurrences

        # Guard against mis-scaled inputs (e.g. dividing by 7 twice) that would
        # otherwise collapse sleep to ~1h per day despite a healthy weekly budget.
        if weekly_minutes >= 7 * 180 and per_day_minutes < 180:
            per_day_minutes = weekly_minutes / 7.0

        return max(1, int(round(per_day_minutes)))

    def _generate_standard_day_schedule(
        self,
        weekday_index: int,
        day_type: str,
        sleep_minutes: int,
        work_minutes: int,
        social_minutes: int,
        chores_minutes: int,
        gym_minutes: int,
    ) -> List[Activity]:
        activities: List[Activity] = []

        def add_activity(
            name: str,
            base_minutes: int,
            waste_multiplier: float,
            optional: bool,
            priority: int,
        ) -> None:
            if base_minutes <= 0:
                return
            activities.append(Activity(name, base_minutes, waste_multiplier, optional, priority))

        add_activity("sleep", sleep_minutes, 1.0, optional=False, priority=1)
        for meal_name in ("breakfast", "lunch", "dinner"):
            add_activity(meal_name, 30, 1.2, optional=False, priority=2)

        effective_work_minutes = work_minutes if weekday_index < 5 else 0
        if day_type == "bridge_day":
            effective_work_minutes = int(effective_work_minutes * 0.6)
        if effective_work_minutes > 0 and weekday_index < 5:
            add_activity("work", effective_work_minutes, 1.1, optional=False, priority=2)

        if gym_minutes > 0 and weekday_index in (0, 2, 4) and random.random() < 0.85:
            add_activity("gym", gym_minutes, 1.4, optional=True, priority=4)

        if social_minutes > 0 and weekday_index >= 5 and random.random() < 0.7:
            add_activity("social", social_minutes, 1.3, optional=True, priority=4)

        if chores_minutes > 0 and weekday_index in (5, 6) and random.random() < 0.6:
            add_activity("chores", chores_minutes, 1.2, optional=True, priority=3)

        return activities

    # ------------------------------------------------------------------
    # Activity modifiers
    # ------------------------------------------------------------------
    @staticmethod
    def apply_seasonal_modifiers(activities: List[Activity], seasonal: Dict[str, object]) -> None:
        if not seasonal:
            return

        multiplier = seasonal.get("outdoor_activity_multiplier")
        if multiplier and isinstance(multiplier, (int, float)):
            for activity in activities:
                if activity.name in OUTDOOR_ACTIVITIES:
                    activity.base_duration_minutes = int(activity.base_duration_minutes * multiplier)
                    activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)

        energy_level = seasonal.get("energy_level")
        if isinstance(energy_level, (int, float)):
            if energy_level < 1.0:
                for activity in activities:
                    if activity.name == "gym":
                        activity.base_duration_minutes = int(activity.base_duration_minutes * energy_level)
                        activity.actual_duration = int(
                            activity.base_duration_minutes * activity.waste_multiplier
                        )
            elif energy_level > 1.05:
                for activity in activities:
                    if activity.name == "social":
                        activity.base_duration_minutes = int(
                            activity.base_duration_minutes * min(1.5, energy_level)
                        )
                        activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)

    @staticmethod
    def apply_special_period_effects(
        activities: List[Activity],
        special: Optional[Dict[str, object]],
    ) -> List[Activity]:
        if not special:
            return activities

        updated: List[Activity] = list(activities)

        if special.get("work_minimal"):
            updated = [activity for activity in updated if activity.name != "work"]
        elif special.get("work_reduced"):
            for activity in updated:
                if activity.name == "work":
                    activity.base_duration_minutes = int(activity.base_duration_minutes * 0.6)
                    activity.actual_duration = int(
                        activity.base_duration_minutes * activity.waste_multiplier
                    )

        if special.get("shops_closed"):
            updated = [activity for activity in updated if activity.name != "chores"]

        if special.get("social_family_focused"):
            updated.append(Activity("family_time", 180, 1.2, optional=False, priority=2))

        if special.get("energy_low"):
            for activity in updated:
                if activity.name in {"gym", "social"}:
                    activity.base_duration_minutes = int(activity.base_duration_minutes * 0.75)
                    activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)

        if special.get("study_hours_increased"):
            extra_minutes = int(special.get("extra_study_minutes", 240))
            updated.append(Activity("exam_study", extra_minutes, 1.2, optional=False, priority=2))

        return updated

    # ------------------------------------------------------------------
    # Week generation
    # ------------------------------------------------------------------
    def _generate_week_activities(
        self,
        profile: PersonProfile,
        start_date: date,
        yearly_budget: Optional[YearlyBudget] = None,
    ) -> List[DayPlan]:
        sleep_minutes = self._allocate_minutes(profile.budget.sleep_hours, 7)
        work_minutes = self._allocate_minutes(profile.budget.work_hours, 5)
        social_minutes = self._allocate_minutes(profile.budget.social_hours, 2)
        chores_minutes = self._allocate_minutes(profile.budget.chores_hours, 2)
        gym_minutes = self._allocate_minutes(profile.budget.gym_hours, 3)

        week_schedule: List[DayPlan] = []

        for day_offset in range(7):
            current_date = start_date + timedelta(days=day_offset)
            day_name = current_date.strftime("%A").lower()
            weekday_index = current_date.weekday()
            daily_friction = self._friction_generator(
                weekday_index, profile.base_waste_factor, profile.friction_variance
            )

            logger.debug(
                "[SLEEP-DEBUG] level=budget profile=%s day=%s minutes=%s weekly_hours=%s",
                profile.name,
                day_name,
                sleep_minutes,
                profile.budget.sleep_hours,
            )

            unique_day: Optional[UniqueDay] = None
            if yearly_budget:
                unique_day = yearly_budget.get_day_type(current_date)

            if unique_day:
                unique_schedule = self._unique_schedule_generator(
                    profile, current_date, unique_day
                )
                activities: List[Activity]
                day_type: str
                if unique_schedule is not None:
                    activities = unique_schedule
                    day_type = unique_day.day_type
                else:
                    day_type = self._calendar_provider.classify_day(
                        current_date, profile.country
                    )
                    activities = self._generate_standard_day_schedule(
                        weekday_index,
                        day_type,
                        sleep_minutes,
                        work_minutes,
                        social_minutes,
                        chores_minutes,
                        gym_minutes,
                    )
            else:
                day_type = self._calendar_provider.classify_day(
                    current_date, profile.country
                )
                if day_type == "public_holiday":
                    activities = self._calendar_provider.generate_holiday_schedule(
                        profile, current_date
                    )
                else:
                    activities = self._generate_standard_day_schedule(
                        weekday_index,
                        day_type,
                        sleep_minutes,
                        work_minutes,
                        social_minutes,
                        chores_minutes,
                        gym_minutes,
                    )

            seasonal = self._calendar_provider.get_seasonal_modifiers(current_date)
            self.apply_seasonal_modifiers(activities, seasonal)

            special = self._calendar_provider.get_special_period_effects(current_date)
            activities = self.apply_special_period_effects(activities, special)

            for activity in activities:
                self._apply_friction(activity, daily_friction)
                if activity.name == "sleep":
                    logger.debug(
                        "[SLEEP-DEBUG] level=activity profile=%s day=%s base=%s actual=%s",
                        profile.name,
                        day_name,
                        activity.base_duration_minutes,
                        activity.actual_duration,
                    )

            week_schedule.append(DayPlan(current_date, day_name, day_type, activities))

        return week_schedule

    @staticmethod
    def _compress_day_if_needed(
        activities: List[Activity], max_minutes: int = 1440
    ) -> Tuple[List[Activity], Dict[str, object]]:
        total = sum(activity.actual_duration for activity in activities)
        metadata: Dict[str, object] = {"original_total": total, "compressions": []}

        if total <= max_minutes:
            return activities, metadata

        overflow = total - max_minutes

        adjustable = [activity for activity in activities if activity.waste_multiplier > 1.0]
        adjustable.sort(key=lambda act: act.priority, reverse=True)
        for activity in adjustable:
            if overflow <= 0:
                break
            reduction = min(int(activity.actual_duration * 0.1), overflow)
            if reduction <= 0:
                continue
            activity.actual_duration -= reduction
            overflow -= reduction
            metadata["compressions"].append(f"Compressed {activity.name} by {reduction}m")

        if overflow > 0:
            optional = [activity for activity in activities if activity.optional]
            optional.sort(key=lambda act: act.priority, reverse=True)
            for activity in optional:
                if overflow <= 0:
                    break
                activities.remove(activity)
                overflow -= activity.actual_duration
                metadata["compressions"].append(f"Skipped {activity.name}")

        if overflow > 0:
            metadata["final_overflow"] = overflow

        return activities, metadata

    @staticmethod
    def _place_activities_in_day(
        day_index: int,
        day_name: str,
        activities: List[Activity],
        templates: Dict[str, ActivityTemplate],
    ) -> List[Event]:
        events: List[Event] = []
        current_time = 0
        fallback_template = ActivityTemplate("fallback", 12, 0)

        sorted_activities = sorted(
            activities,
            key=lambda act: templates.get(act.name, fallback_template).preferred_start_hour,
        )

        for activity in sorted_activities:
            template = templates.get(activity.name)
            if template and (template.valid_days is None or day_index in template.valid_days):
                jitter = random.randint(-template.flexibility_minutes, template.flexibility_minutes)
                start = max(0, template.preferred_start_hour * 60 + jitter)
            else:
                start = current_time

            start = max(start, current_time)
            end = start + activity.actual_duration
            events.append(
                Event(
                    date=date.min,
                    day=day_name,
                    start_minutes=start,
                    end_minutes=end,
                    activity=activity,
                )
            )
            current_time = end

        return events

    @staticmethod
    def fill_free_time(events: List[Event]) -> List[Event]:
        if not events:
            return [
                Event(
                    date=date.min,
                    day="",
                    start_minutes=0,
                    end_minutes=1440,
                    activity=Activity("free time", 1440, 1.0, optional=False, priority=5),
                )
            ]

        filled: List[Event] = []
        current = 0
        for event in sorted(events, key=lambda evt: evt.start_minutes):
            if current < event.start_minutes:
                gap_activity = Activity(
                    "free time", event.start_minutes - current, 1.0, optional=False, priority=5
                )
                filled.append(Event(event.date, event.day, current, event.start_minutes, gap_activity))
            filled.append(event)
            current = event.end_minutes

        if current < 1440:
            gap_activity = Activity("free time", 1440 - current, 1.0, optional=False, priority=5)
            filled.append(Event(events[-1].date, events[-1].day, current, 1440, gap_activity))

        return filled

    @staticmethod
    def apply_micro_jitter(
        events: List[Event],
        max_shift: int = 5,
        locked_activities: Optional[Set[str]] = None,
    ) -> List[Event]:
        if max_shift <= 0 or len(events) < 2:
            return events

        locked = set(locked_activities or {"sleep", "work", "commute_in", "commute_out"})
        sorted_events = sorted(events, key=lambda evt: evt.start_minutes)

        for index in range(len(sorted_events) - 1):
            current = sorted_events[index]
            following = sorted_events[index + 1]

            if current.activity.name in locked or following.activity.name in locked:
                continue

            min_boundary = current.start_minutes + 1
            max_boundary = following.end_minutes - 1
            if max_boundary <= min_boundary:
                continue

            shift = int(round(random.gauss(0.0, max_shift / 2)))
            shift = max(-max_shift, min(max_shift, shift))
            new_boundary = current.end_minutes + shift
            new_boundary = max(min_boundary, min(max_boundary, new_boundary))

            if new_boundary == current.end_minutes:
                continue

            current.end_minutes = new_boundary
            following.start_minutes = new_boundary

        return events

    @staticmethod
    def _generate_summary(event_dicts: Iterable[Dict[str, object]]) -> Dict[str, float]:
        totals: Dict[str, int] = {}
        for event in event_dicts:
            activity_name = str(event["activity"])
            duration = int(event["duration_minutes"])
            totals[activity_name] = totals.get(activity_name, 0) + duration
        return {name: round(minutes / 60, 2) for name, minutes in totals.items()}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def generate_complete_week(
        self,
        profile: PersonProfile,
        start_date: date,
        week_seed: int,
        templates: Optional[Dict[str, ActivityTemplate]] = None,
        yearly_budget: Optional[YearlyBudget] = None,
    ) -> Dict[str, object]:
        random.seed(week_seed)
        templates = templates or DEFAULT_TEMPLATES

        week_plans = self._generate_week_activities(profile, start_date, yearly_budget)
        issues = self._validator(
            {f"{plan.day_name} ({plan.date.isoformat()})": plan.activities for plan in week_plans}
        )

        compression_metadata: Dict[str, Dict[str, object]] = {}
        for plan in week_plans:
            compressed, metadata = self._compress_day_if_needed(plan.activities)
            plan.activities = compressed
            compression_metadata[plan.date.isoformat()] = metadata

        normalized_inputs: List[Dict[str, Any]] = []
        for plan in week_plans:
            events = self._place_activities_in_day(plan.date.weekday(), plan.day_name, plan.activities, templates)
            for event in events:
                event.date = plan.date
                event.day = plan.day_name
            events = self.fill_free_time(events)
            events = self.apply_micro_jitter(events)
            day_offset = (plan.date - start_date).days
            weekday_index = plan.date.weekday()
            for event in events:
                normalized_inputs.append(
                    {
                        "date": event.date,
                        "day": event.day,
                        "day_index": day_offset,
                        "weekday_index": weekday_index,
                        "start_minutes": event.start_minutes,
                        "end_minutes": event.end_minutes,
                        "duration_minutes": max(0, event.end_minutes - event.start_minutes),
                        "activity": event.activity.name,
                        "activity_details": {
                            "base_duration_minutes": event.activity.base_duration_minutes,
                            "waste_multiplier": event.activity.waste_multiplier,
                            "optional": event.activity.optional,
                            "priority": event.activity.priority,
                            "actual_duration": event.activity.actual_duration,
                        },
                        "day_type": plan.day_type,
                    }
                )

        events_payload = normalize_mk2_events(normalized_inputs, week_start=start_date)
        sleep_totals: Dict[str, int] = {}
        total_sleep_minutes = 0
        for event in events_payload:
            if str(event.get("activity")) != "sleep":
                continue
            minutes = int(event.get("duration_minutes", 0))
            day_label = str(event.get("day") or "")
            sleep_totals[day_label] = sleep_totals.get(day_label, 0) + minutes
            total_sleep_minutes += minutes
        if total_sleep_minutes:
            logger.debug(
                "[SLEEP-DEBUG] level=events profile=%s total_minutes=%s total_hours=%.2f per_day=%s",
                profile.name,
                total_sleep_minutes,
                total_sleep_minutes / 60.0,
                sleep_totals,
            )
        else:
            logger.debug(
                "[SLEEP-DEBUG] level=events profile=%s total_minutes=0 total_hours=0.00 per_day=%s",
                profile.name,
                sleep_totals,
            )
        summary_hours = self._generate_summary(events_payload)

        return {
            "person": profile.name,
            "week_start": start_date.isoformat(),
            "events": events_payload,
            "issues": [asdict(issue) for issue in issues],
            "metadata": {
                "total_events": len(events_payload),
                "issue_count": len(issues),
                "summary_hours": summary_hours,
                "compression": compression_metadata,
                "day_types": {plan.date.isoformat(): plan.day_type for plan in week_plans},
            },
        }

    def select_profile(self, archetype: str) -> Tuple[PersonProfile, Dict[str, ActivityTemplate]]:
        archetype = archetype.lower()
        if archetype not in self._profile_factory:
            raise ValueError(f"Unknown archetype: {archetype}")
        factory, templates = self._profile_factory[archetype]
        return factory(), templates


def normalize_mk2_events(
    events: Iterable[Mapping[str, object]], *, week_start: Optional[date] = None
) -> List[Dict[str, Any]]:
    """Coerce MK2 event payloads into the MK1 renderer shape."""

    normalized: List[Dict[str, Any]] = []
    for raw in events:
        event = _normalize_single_event(raw, week_start=week_start)
        if event is not None:
            normalized.append(event)

    normalized.sort(key=_event_sort_key)
    return normalized


def _normalize_single_event(
    raw: Mapping[str, object], *, week_start: Optional[date]
) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, Mapping):
        return None

    day_offset = _coerce_int(
        raw.get("day_index") if "day_index" in raw else raw.get("dayIndex")
    )
    weekday_index = _coerce_int(
        raw.get("weekday_index") if "weekday_index" in raw else raw.get("weekdayIndex")
    )

    event_date = _coerce_date(raw.get("date"), week_start, day_offset)
    date_iso = event_date.isoformat() if event_date else ""

    day_name = _coerce_day_name(
        raw.get("day"), event_date, weekday_index, day_offset, week_start
    )

    start_minutes = _extract_minutes(
        raw,
        [
            "start_minutes",
            "start_minute",
            "minute_start",
            "start",
            "start_time",
            "startTime",
            "time",
        ],
    )
    end_minutes = _extract_minutes(
        raw,
        [
            "end_minutes",
            "end_minute",
            "minute_end",
            "end",
            "end_time",
            "endTime",
        ],
    )

    duration_minutes = _extract_positive_int(
        raw,
        [
            "duration_minutes",
            "duration",
            "minutes",
            "length_minutes",
        ],
    )

    computed_duration = _compute_duration(start_minutes, end_minutes)
    if (duration_minutes is None or duration_minutes <= 0) and computed_duration is not None:
        duration_minutes = computed_duration

    if duration_minutes is None or duration_minutes < 0:
        duration_minutes = 0

    if end_minutes is None and start_minutes is not None and duration_minutes:
        end_minutes = start_minutes + duration_minutes

    if end_minutes is not None and start_minutes is not None and end_minutes <= start_minutes:
        # Ensure the range is strictly positive by rolling the end forward.
        adjusted = end_minutes
        while adjusted <= start_minutes:
            adjusted += 1440
            if adjusted - start_minutes > 14 * 1440:
                break
        if adjusted > start_minutes:
            end_minutes = adjusted
            if duration_minutes <= 0:
                duration_minutes = adjusted - start_minutes

    start_display = _format_minutes(start_minutes)
    end_display = _format_end_minutes(end_minutes, start_minutes, duration_minutes)

    activity_name = _coerce_activity_name(raw.get("activity"))
    if not activity_name:
        activity_name = _coerce_activity_name(raw.get("activity_name"))
    if not activity_name:
        activity_name = _coerce_activity_name(raw.get("activityName"))
    if not activity_name:
        activity_name = ""

    minute_range = _coerce_minute_range(raw.get("minute_range"))
    if minute_range is None:
        minute_range = _coerce_minute_range(raw.get("minuteRange"))

    if (
        minute_range is None
        and start_minutes is not None
        and end_minutes is not None
        and day_offset is not None
    ):
        absolute_start = day_offset * 1440 + start_minutes
        absolute_end = day_offset * 1440 + end_minutes
        if absolute_end <= absolute_start and duration_minutes:
            absolute_end = absolute_start + duration_minutes
        minute_range = [absolute_start, absolute_end]

    extras = _collect_extras(
        raw,
        {
            "date",
            "day",
            "day_index",
            "dayIndex",
            "weekday_index",
            "weekdayIndex",
            "start",
            "start_time",
            "startTime",
            "start_minutes",
            "start_minute",
            "minute_start",
            "time",
            "end",
            "end_time",
            "endTime",
            "end_minutes",
            "end_minute",
            "minute_end",
            "duration",
            "duration_minutes",
            "minutes",
            "length_minutes",
            "activity",
            "activity_name",
            "activityName",
            "minute_range",
            "minuteRange",
        },
    )

    if start_minutes is not None:
        extras.setdefault("start_minutes", start_minutes)
    if end_minutes is not None:
        extras.setdefault("end_minutes", end_minutes)
    if day_offset is not None:
        extras.setdefault("day_index", day_offset)
    if weekday_index is not None:
        extras.setdefault("weekday_index", weekday_index)
    if minute_range is not None:
        extras["minute_range"] = minute_range

    normalized: Dict[str, Any] = {
        "date": date_iso,
        "day": day_name,
        "start": start_display,
        "end": end_display,
        "activity": activity_name,
        "duration_minutes": int(duration_minutes),
    }
    normalized.update(extras)
    return normalized


def _event_sort_key(event: Mapping[str, Any]) -> Tuple[str, str]:
    date_value = str(event.get("date") or "")
    start_value = str(event.get("start") or "")
    return (date_value, start_value)


def _coerce_date(
    value: object, week_start: Optional[date], day_offset: Optional[int]
) -> Optional[date]:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        candidate = value.strip()
        if candidate:
            try:
                return date.fromisoformat(candidate.split("T")[0])
            except ValueError:
                return None
        return None
    if week_start is not None and day_offset is not None:
        try:
            return week_start + timedelta(days=day_offset)
        except OverflowError:
            return None
    return None


def _coerce_day_name(
    value: object,
    event_date: Optional[date],
    weekday_index: Optional[int],
    day_offset: Optional[int],
    week_start: Optional[date],
) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip().lower()

    if weekday_index is not None and 0 <= weekday_index < len(DAY_NAMES):
        return DAY_NAMES[weekday_index]

    if event_date is not None:
        return event_date.strftime("%A").lower()

    if week_start is not None and day_offset is not None:
        try:
            computed = week_start + timedelta(days=day_offset)
            return computed.strftime("%A").lower()
        except OverflowError:
            return ""

    return ""


def _extract_minutes(raw: Mapping[str, object], keys: Sequence[str]) -> Optional[int]:
    for key in keys:
        if key not in raw:
            continue
        minutes = _coerce_minutes(raw.get(key))
        if minutes is not None:
            return minutes
    return None


def _coerce_minutes(value: object) -> Optional[int]:
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        if "T" in candidate:
            candidate = candidate.split("T", 1)[1]
        parts = candidate.split(":")
        if len(parts) >= 2:
            try:
                hours = int(parts[0])
                minutes = int(parts[1])
                return hours * 60 + minutes
            except ValueError:
                return None
        try:
            return int(candidate)
        except ValueError:
            return None
    return None


def _extract_positive_int(raw: Mapping[str, object], keys: Sequence[str]) -> Optional[int]:
    for key in keys:
        if key not in raw:
            continue
        value = _coerce_int(raw.get(key))
        if value is not None and value > 0:
            return value
    return None


def _coerce_int(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and value.strip():
        try:
            return int(float(value))
        except ValueError:
            return None
    return None


def _compute_duration(
    start_minutes: Optional[int], end_minutes: Optional[int]
) -> Optional[int]:
    if start_minutes is None or end_minutes is None:
        return None
    if end_minutes > start_minutes:
        return end_minutes - start_minutes
    difference = end_minutes - start_minutes
    while difference <= 0:
        difference += 1440
        if difference > 14 * 1440:
            return None
    return difference


def _format_minutes(value: Optional[int]) -> str:
    if value is None:
        total = 0
    else:
        total = int(value) % 1440
    hours, minutes = divmod(total, 60)
    return f"{hours:02d}:{minutes:02d}"


def _format_end_minutes(
    end_minutes: Optional[int],
    start_minutes: Optional[int],
    duration_minutes: Optional[int],
) -> str:
    if end_minutes is not None and end_minutes < 1440:
        return _format_minutes(end_minutes)

    baseline = start_minutes or 0
    if end_minutes is not None and end_minutes >= 1440:
        return "00:00"

    if duration_minutes:
        candidate = baseline + duration_minutes
        if candidate >= 1440:
            return "00:00"
        return _format_minutes(candidate)

    return _format_minutes(baseline)


def _coerce_activity_name(value: object) -> Optional[str]:
    if isinstance(value, str):
        text = value.strip()
        return text if text else None
    if isinstance(value, Mapping):
        candidate = value.get("name")
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    if hasattr(value, "name"):
        candidate = getattr(value, "name")
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _coerce_minute_range(value: object) -> Optional[List[int]]:
    if isinstance(value, Sequence) and len(value) >= 2:
        start = _coerce_int(value[0])
        end = _coerce_int(value[1])
        if start is not None and end is not None:
            return [start, end]
    if isinstance(value, Mapping):
        start = _coerce_int(
            value.get("start")
            or value.get("from")
            or value.get("begin")
            or value.get(0)
        )
        end = _coerce_int(
            value.get("end")
            or value.get("to")
            or value.get("finish")
            or value.get(1)
        )
        if start is not None and end is not None:
            return [start, end]
    return None


def _collect_extras(
    raw: Mapping[str, object], canonical: Set[str]
) -> Dict[str, Any]:
    extras: Dict[str, Any] = {}
    for key, value in raw.items():
        if key in canonical:
            continue
        extras[key] = value
    return extras
