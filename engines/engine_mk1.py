"""Implementation of the MVP scheduling engine (MK1)."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .base import ScheduleEngine, ScheduleInput, ScheduleOutput

__all__ = ["EngineMK1", "load_character_config"]


DAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def parse_time_to_minutes(value: str) -> int:
    """Convert an HH:MM string to the number of minutes after midnight."""

    try:
        hour, minute = value.split(":", 1)
        hours = int(hour)
        minutes = int(minute)
    except ValueError as exc:  # pragma: no cover - configuration assumed valid
        raise ValueError(f"Invalid time format: {value!r}") from exc

    if not (0 <= hours < 24 and 0 <= minutes < 60):
        raise ValueError(f"Invalid time value: {value!r}")
    return hours * 60 + minutes


def minutes_to_time(minutes: int) -> str:
    """Convert minutes since midnight to HH:MM."""

    minutes = minutes % (24 * 60)
    hours, mins = divmod(minutes, 60)
    return f"{hours:02d}:{mins:02d}"


def get_week_start(reference: Optional[date] = None) -> date:
    """Return the Monday of the week for *reference* (defaults to today)."""

    reference = reference or date.today()
    offset = (reference.weekday() + 7 - 0) % 7  # Monday == 0
    return reference - timedelta(days=offset)


def day_indices(days: Sequence[str]) -> Sequence[int]:
    """Map a list of day names to their indices in the week."""

    if not days:
        return []

    if any(day.lower() == "daily" for day in days):
        return list(range(7))

    result = []
    for day in days:
        try:
            result.append(DAY_NAMES.index(day.lower()))
        except ValueError as exc:  # pragma: no cover - configuration assumed valid
            raise ValueError(f"Unknown day: {day!r}") from exc
    return result


@dataclass
class SleepConfig:
    bedtime: str
    duration_hours: float

    @property
    def start_minutes(self) -> int:
        return parse_time_to_minutes(self.bedtime)

    @property
    def duration_minutes(self) -> int:
        return int(self.duration_hours * 60)


@dataclass
class WorkConfig:
    start: str
    duration_hours: float
    days: Sequence[str]

    @property
    def start_minutes(self) -> int:
        return parse_time_to_minutes(self.start)

    @property
    def duration_minutes(self) -> int:
        return int(self.duration_hours * 60)

    @property
    def day_indices(self) -> Sequence[int]:
        return day_indices(self.days)


@dataclass
class MealConfig:
    breakfast: str
    lunch: str
    dinner: str

    def items(self) -> Sequence[Tuple[str, str]]:
        return (
            ("breakfast", self.breakfast),
            ("lunch", self.lunch),
            ("dinner", self.dinner),
        )


@dataclass
class ActivityConfig:
    name: str
    time: str
    duration_minutes: int
    days: Sequence[str]

    @property
    def start_minutes(self) -> int:
        return parse_time_to_minutes(self.time)

    @property
    def day_indices(self) -> Sequence[int]:
        return day_indices(self.days)


@dataclass
class CharacterConfig:
    name: str
    sleep: SleepConfig
    work: Optional[WorkConfig]
    meals: MealConfig
    activities: Sequence[ActivityConfig] = field(default_factory=list)


@dataclass
class Event:
    date: date
    day: str
    start: int
    end: int
    activity: str

    @property
    def duration_minutes(self) -> int:
        return self.end - self.start

    def to_dict(self) -> Dict[str, object]:
        result: Dict[str, object] = {
            "date": self.date.isoformat(),
            "day": self.day,
            "start": minutes_to_time(self.start),
            "end": minutes_to_time(self.end if self.end < 1440 else 0),
            "activity": self.activity,
            "duration_minutes": self.duration_minutes,
        }
        return result


class DaySchedule:
    def __init__(self, day_index: int, day_date: date):
        self.day_index = day_index
        self.day_name = DAY_NAMES[day_index]
        self.date = day_date
        self._events: List[Tuple[int, int, str]] = []

    def apply_micro_jitter(
        self,
        max_shift: int = 5,
        locked_activities: Optional[Sequence[str]] = None,
    ) -> None:
        """Shift internal boundaries slightly to avoid rigid 15-minute grids."""

        if max_shift <= 0 or len(self._events) < 2:
            return

        locked = set(locked_activities or {"sleep", "work", "commute_in", "commute_out"})
        for index in range(len(self._events) - 1):
            start_a, end_a, activity_a = self._events[index]
            start_b, end_b, activity_b = self._events[index + 1]

            if activity_a in locked or activity_b in locked:
                continue

            min_boundary = start_a + 1
            max_boundary = end_b - 1
            if max_boundary <= min_boundary:
                continue

            shift = int(round(random.gauss(0.0, max_shift / 2)))
            shift = max(-max_shift, min(max_shift, shift))
            new_boundary = end_a + shift
            new_boundary = max(min_boundary, min(max_boundary, new_boundary))

            if new_boundary == end_a:
                continue

            self._events[index] = (start_a, new_boundary, activity_a)
            self._events[index + 1] = (new_boundary, end_b, activity_b)

    def add_event(self, start: int, end: int, activity: str) -> bool:
        """Attempt to add an event; return False if it would overlap."""

        if start < 0 or end > 1440 or start >= end:
            raise ValueError("Invalid event boundaries")

        for existing_start, existing_end, _ in self._events:
            if not (end <= existing_start or start >= existing_end):
                return False

        self._events.append((start, end, activity))
        self._events.sort(key=lambda item: item[0])
        return True

    def find_slot(self, desired_start: int, duration: int) -> Optional[Tuple[int, int]]:
        """Find a free slot at or after *desired_start* that fits *duration*."""

        free_segments = self.free_segments()
        # Try to use a segment containing the desired start first
        for start, end in free_segments:
            if start <= desired_start and end - desired_start >= duration:
                return desired_start, desired_start + duration

        # Otherwise pick the first segment after the desired start
        for start, end in free_segments:
            if start >= desired_start and end - start >= duration:
                return start, start + duration

        # Finally try earlier segments (place at the end of the gap)
        for start, end in reversed(free_segments):
            if end <= desired_start and end - start >= duration:
                return end - duration, end

        return None

    def free_segments(self) -> List[Tuple[int, int]]:
        """Return a list of free time segments for the day."""

        segments: List[Tuple[int, int]] = []
        current = 0
        for start, end, _ in sorted(self._events, key=lambda item: item[0]):
            if current < start:
                segments.append((current, start))
            current = max(current, end)
        if current < 1440:
            segments.append((current, 1440))
        return segments

    def fill_free_time(self) -> None:
        """Fill remaining gaps with 'free time' events."""

        additions = []
        current = 0
        for start, end, _ in self._events:
            if current < start:
                additions.append((current, start, "free time"))
            current = end
        if current < 1440:
            additions.append((current, 1440, "free time"))

        for start, end, activity in additions:
            self._events.append((start, end, activity))

        self._events.sort(key=lambda item: item[0])

    def validate(self) -> None:
        """Ensure that events cover the day without gaps or overlaps."""

        if not self._events:
            raise ValueError("Day has no events")

        current = 0
        for start, end, _ in self._events:
            if start != current:
                raise ValueError(f"Gap detected in {self.day_name}")
            if end <= start:
                raise ValueError(f"Invalid event duration in {self.day_name}")
            current = end
        if current != 1440:
            raise ValueError(f"Day {self.day_name} does not cover full 24 hours")

    def to_events(self) -> List[Event]:
        return [Event(self.date, self.day_name, start, end, activity) for start, end, activity in self._events]


def load_character_config(data: Mapping[str, Any]) -> CharacterConfig:
    """Construct a :class:`CharacterConfig` from raw mapping data."""

    sleep = SleepConfig(**data["sleep"])

    work_data = data.get("work")
    work = WorkConfig(**work_data) if work_data else None

    meals = MealConfig(**data["meals"])

    activities = [ActivityConfig(**item) for item in data.get("activities", [])]

    return CharacterConfig(
        name=data["name"],
        sleep=sleep,
        work=work,
        meals=meals,
        activities=activities,
    )


def add_sleep(schedule: List[DaySchedule], config: SleepConfig) -> None:
    duration = config.duration_minutes
    for day_index in range(7):
        remaining = duration
        current_day = day_index
        start = config.start_minutes

        while remaining > 0 and current_day < day_index + 7:
            day = schedule[current_day % 7]
            end = min(1440, start + remaining)
            if not day.add_event(start, end, "sleep"):
                raise ValueError(f"Sleep overlaps existing event on {day.day_name}")

            spent = end - start
            remaining -= spent
            current_day += 1
            start = 0


def add_work(schedule: List[DaySchedule], config: Optional[WorkConfig]) -> None:
    if not config:
        return

    duration = config.duration_minutes
    for day_index in config.day_indices:
        remaining = duration
        current_day = day_index
        start = config.start_minutes

        while remaining > 0 and current_day < day_index + 7:
            day = schedule[current_day % 7]
            end = min(1440, start + remaining)
            if not day.add_event(start, end, "work"):
                raise ValueError(f"Work overlaps existing event on {day.day_name}")

            spent = end - start
            remaining -= spent
            current_day += 1
            start = 0


def add_meals(schedule: List[DaySchedule], meals: MealConfig) -> None:
    duration = 30
    for day in schedule:
        for meal_name, time_str in meals.items():
            start = parse_time_to_minutes(time_str)
            slot = day.find_slot(start, duration)
            if slot is None:
                raise ValueError(f"Could not schedule {meal_name} on {day.day_name}")
            day.add_event(slot[0], slot[1], meal_name)


def add_activities(schedule: List[DaySchedule], activities: Sequence[ActivityConfig]) -> None:
    for activity in activities:
        duration = activity.duration_minutes
        for day_index in activity.day_indices:
            day = schedule[day_index]
            start = activity.start_minutes
            end = start + duration
            if end > 1440:
                continue  # Skip activities that would overflow the day
            if day.add_event(start, end, activity.name):
                continue
            # Activity conflicts – skip as per MVP scope


def finalise_schedule(schedule: List[DaySchedule]) -> None:
    for day in schedule:
        day.fill_free_time()
        day.apply_micro_jitter()
        day.validate()


def generate_schedule(
    config: CharacterConfig,
    start_date: Optional[date] = None,
) -> Tuple[List[Event], Dict[str, float], Tuple[date, date]]:
    start_date = start_date or get_week_start()
    days = [DaySchedule(idx, start_date + timedelta(days=idx)) for idx in range(7)]

    add_sleep(days, config.sleep)
    add_work(days, config.work)
    add_meals(days, config.meals)
    add_activities(days, config.activities)
    finalise_schedule(days)

    events: List[Event] = []
    totals: Dict[str, int] = {}
    for day in days:
        day_events = day.to_events()
        events.extend(day_events)
        for event in day_events:
            totals[event.activity] = totals.get(event.activity, 0) + event.duration_minutes

    totals_hours = {activity: minutes / 60 for activity, minutes in totals.items()}
    week_range = (days[0].date, days[-1].date)
    return events, totals_hours, week_range


class EngineMK1(ScheduleEngine):
    """Schedule engine that implements the original MVP generator."""

    def __init__(self, *, reference_start: Optional[date] = None):
        self._reference_start = reference_start

    def generate(self, schedule_input: ScheduleInput) -> ScheduleOutput:
        raw_constraints = schedule_input.constraints
        if isinstance(raw_constraints, CharacterConfig):
            config = raw_constraints
        else:
            config = load_character_config(raw_constraints)

        start_date: Optional[date] = schedule_input.metadata.get("start_date") if schedule_input.metadata else None
        if start_date is None:
            start_date = self._reference_start

        events, totals, week_range = generate_schedule(config, start_date=start_date)

        event_payloads = [event.to_dict() for event in events]
        diagnostics: Dict[str, Any] = {
            "week_start": week_range[0],
            "week_end": week_range[1],
            "character_name": config.name,
        }

        return ScheduleOutput(
            events=event_payloads,
            totals=totals,
            diagnostics=diagnostics,
        )

