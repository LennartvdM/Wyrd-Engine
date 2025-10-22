"""Algebraic agent overlay for the Temporal Environment Simulator.

The implementation is intentionally dependency-light so it can operate in
constrained environments without third-party numerical libraries. Temporal
signals are represented as Python lists with a constant sampling resolution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
import bisect
import math


Number = float


@dataclass
class TimeField:
    """One-dimensional temporal signal with constant sampling resolution."""

    values: List[Number]
    dt: int = 1
    t_start: int = 0

    def __post_init__(self) -> None:
        if self.dt <= 0:
            raise ValueError("dt must be positive")
        if any(not isinstance(v, (int, float, bool)) for v in self.values):
            raise TypeError("TimeField values must be numeric")
        self.values = [float(v) for v in self.values]

    @property
    def length(self) -> int:
        return len(self.values)

    @property
    def t_end(self) -> int:
        return self.t_start + self.length * self.dt

    def slice_window(self, win_start: int, win_end: int) -> "TimeField":
        if win_end <= win_start:
            raise ValueError("window end must be greater than start")
        if win_start < self.t_start or win_end > self.t_end:
            raise ValueError("slice_window range is out of bounds")
        idx_start = (win_start - self.t_start) // self.dt
        idx_end = (win_end - self.t_start) // self.dt
        return TimeField(self.values[idx_start:idx_end], self.dt, win_start)

    def copy(self) -> "TimeField":
        return TimeField(list(self.values), self.dt, self.t_start)


def _ensure_alignment(fields: Sequence[TimeField]) -> None:
    if not fields:
        return
    base_dt = fields[0].dt
    base_start = fields[0].t_start
    base_length = fields[0].length
    for field in fields[1:]:
        if field.dt != base_dt or field.t_start != base_start or field.length != base_length:
            raise ValueError("TimeFields must share dt, t_start, and length")


def and_field(*fields: TimeField) -> TimeField:
    if not fields:
        raise ValueError("and_field expects at least one TimeField")
    _ensure_alignment(fields)
    values = [min(vals) for vals in zip(*(f.values for f in fields))]
    return TimeField(values, fields[0].dt, fields[0].t_start)


def mix_field(fields: Sequence[TimeField], weights: Sequence[float]) -> TimeField:
    if len(fields) != len(weights):
        raise ValueError("weights must match the number of fields")
    if not fields:
        raise ValueError("mix_field expects at least one TimeField")
    _ensure_alignment(fields)
    weight_sum = sum(weights)
    if math.isclose(weight_sum, 0.0):
        raise ValueError("weights sum must be non-zero")
    values: List[float] = []
    for idx in range(fields[0].length):
        numerator = sum(fields[i].values[idx] * weights[i] for i in range(len(fields)))
        values.append(numerator / weight_sum)
    return TimeField(values, fields[0].dt, fields[0].t_start)


def gate_field(hard_mask: TimeField, soft: TimeField) -> TimeField:
    _ensure_alignment([hard_mask, soft])
    values = [soft_v if mask_v >= 0.5 else 0.0 for mask_v, soft_v in zip(hard_mask.values, soft.values)]
    return TimeField(values, soft.dt, soft.t_start)


def _binary_dilation(mask: Sequence[bool], width: int) -> List[bool]:
    if width <= 1:
        return [bool(v) for v in mask]
    length = len(mask)
    result = [False] * length
    radius = width // 2
    for idx in range(length):
        start = max(0, idx - radius)
        end = min(length, idx + radius + 1)
        result[idx] = any(mask[start:end])
    return result


def _binary_erosion(mask: Sequence[bool], width: int) -> List[bool]:
    if width <= 1:
        return [bool(v) for v in mask]
    length = len(mask)
    result = [False] * length
    radius = width // 2
    for idx in range(length):
        start = max(0, idx - radius)
        end = min(length, idx + radius + 1)
        window = mask[start:end]
        result[idx] = len(window) == (end - start) and all(window)
    return result


def morphology_open(mask: Sequence[bool], width: int = 3) -> List[bool]:
    if width < 1:
        raise ValueError("width must be >= 1")
    mask_bool = [bool(v) for v in mask]
    eroded = _binary_erosion(mask_bool, width)
    return _binary_dilation(eroded, width)


def morphology_close(mask: Sequence[bool], width: int = 3) -> List[bool]:
    if width < 1:
        raise ValueError("width must be >= 1")
    mask_bool = [bool(v) for v in mask]
    dilated = _binary_dilation(mask_bool, width)
    return _binary_erosion(dilated, width)


@dataclass
class Policy:
    threshold: float = 0.7
    pick: str = "argmax"
    duration: int = 30
    weights: Tuple[float, float, float] = (0.4, 0.4, 0.2)
    open_width: int = 3


@dataclass
class AuditLog:
    inputs: Dict[str, float] = field(default_factory=dict)
    choice: Optional[Tuple[int, int]] = None
    score: float = 0.0
    threshold: float = 0.0
    conflicts: List[str] = field(default_factory=list)
    budgets: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return {
            "inputs": dict(self.inputs),
            "choice": self.choice,
            "score": float(self.score),
            "threshold": float(self.threshold),
            "conflicts": list(self.conflicts),
            "budgets": dict(self.budgets),
        }


class IntervalTree:
    def __init__(self) -> None:
        self._starts: List[int] = []
        self._entries: List[Tuple[str, int]] = []

    def add(self, agent_id: str, start: int, end: int) -> None:
        if end <= start:
            raise ValueError("interval end must be greater than start")
        idx = bisect.bisect_left(self._starts, start)
        self._starts.insert(idx, start)
        self._entries.insert(idx, (agent_id, end))

    def iter_overlaps(self, start: int, end: int) -> Iterable[Tuple[str, int, int]]:
        if end <= start:
            return []
        idx = bisect.bisect_left(self._starts, start)
        for offset in (-1, 0, 1):
            i = idx + offset
            if 0 <= i < len(self._starts):
                other_start = self._starts[i]
                agent_id, other_end = self._entries[i]
                if max(start, other_start) < min(end, other_end):
                    yield agent_id, other_start, other_end

    def conflicts(self, agent_id: str, start: int, end: int) -> bool:
        return any(other_id != agent_id for other_id, _, _ in self.iter_overlaps(start, end))

    def conflict_ids(self, agent_id: str, start: int, end: int) -> List[str]:
        return [other_id for other_id, _, _ in self.iter_overlaps(start, end) if other_id != agent_id]

    def items(self) -> Iterable[Tuple[int, List[Tuple[str, int]]]]:
        combined: Dict[int, List[Tuple[str, int]]] = {}
        for start, (agent_id, end) in zip(self._starts, self._entries):
            combined.setdefault(start, []).append((agent_id, end))
        return combined.items()


class AgentOverlay:
    def __init__(self, reservations: Optional[Dict[int, IntervalTree]] = None, budgets_seed: int = 42) -> None:
        self.reservations: Dict[int, IntervalTree] = reservations if reservations is not None else {}
        self.budgets: Dict[str, Dict[str, object]] = {}
        self._fair_counters: Dict[str, float] = {}
        self._seed = budgets_seed

    def score(
        self,
        tfields: Dict[str, TimeField],
        policy: Policy,
        day: int,
    ) -> Tuple[TimeField, List[bool], AuditLog]:
        required_keys = {"R", "A", "C"}
        missing = required_keys.difference(tfields.keys())
        if missing:
            raise KeyError(f"Missing fields for scoring: {sorted(missing)}")
        template = tfields["R"]
        _ensure_alignment([template, tfields["A"], tfields["C"]])
        windows = tfields.get("windows")
        if windows is None:
            hard_mask = TimeField([1.0] * template.length, template.dt, template.t_start)
        else:
            hard_mask = self._windows_to_mask(windows, template)
        readiness = tfields["R"]
        availability = tfields["A"]
        congestion = TimeField([1.0 - v for v in tfields["C"].values], template.dt, template.t_start)
        weights = policy.weights
        soft_blend = mix_field([readiness, availability, congestion], weights)
        score_field = gate_field(hard_mask, soft_blend)
        candidate_mask = [value >= policy.threshold for value in score_field.values]
        candidate_mask = morphology_open(candidate_mask, width=max(1, policy.open_width))
        audit = AuditLog(
            inputs={
                "R_mean": _mean(readiness.values),
                "A_max": max(availability.values) if availability.values else 0.0,
                "C_min": min(tfields["C"].values) if tfields["C"].values else 0.0,
            },
            threshold=policy.threshold,
        )
        return score_field, candidate_mask, audit

    def pick(
        self,
        score_field: TimeField,
        candidate_mask: Sequence[bool],
        policy: Policy,
        day: int,
        agent_id: str,
        base_log: Optional[AuditLog] = None,
    ) -> Tuple[Optional[Tuple[int, int]], AuditLog]:
        log = base_log if base_log is not None else AuditLog()
        required_steps = max(1, math.ceil(policy.duration / score_field.dt))
        windows = self._candidate_windows(candidate_mask, required_steps)
        if not windows:
            log.score = float("-inf")
            return None, log

        if policy.pick not in {"argmax", "earliest", "regret_min"}:
            raise ValueError(f"Unknown pick strategy '{policy.pick}'")

        scores: List[float] = []
        for start_idx in windows:
            end_idx = start_idx + required_steps
            window_values = score_field.values[start_idx:end_idx]
            scores.append(_mean(window_values))
        if policy.pick == "argmax":
            selection_index = scores.index(max(scores))
        elif policy.pick == "earliest":
            selection_index = 0
        else:
            best = max(scores)
            regrets = [best - score for score in scores]
            selection_index = regrets.index(min(regrets))
        chosen_start_idx = windows[selection_index]
        chosen_end_idx = chosen_start_idx + required_steps
        start_min = score_field.t_start + chosen_start_idx * score_field.dt
        end_min = score_field.t_start + chosen_end_idx * score_field.dt

        cooldown = self._get_cooldown(agent_id, day)
        if cooldown and _mean(cooldown[start_min:end_min]) > 0.5:
            log.score = float("-inf")
            log.choice = None
            return None, log

        log.score = scores[selection_index]
        log.choice = (start_min, end_min)
        return (start_min, end_min), log

    def reserve(
        self,
        agent_id: str,
        day: int,
        window: Tuple[int, int],
        budget_update: bool = True,
    ) -> bool:
        start, end = window
        tree = self.reservations.setdefault(day, IntervalTree())
        if tree.conflicts(agent_id, start, end):
            self._bump_cooldown(agent_id, day, start, end, delta=60)
            return False
        tree.add(agent_id, start, end)
        if budget_update:
            self._decrement_budget(agent_id, "time_min", end - start)
            self._decrement_budget(agent_id, "tasks_day", 1)
        return True

    def arbitrate(
        self,
        candidates: Dict[str, Tuple[int, int]],
        weights: Dict[str, float],
        mode: str = "priority",
    ) -> Dict[str, bool]:
        if not candidates:
            return {}
        if mode == "priority":
            ordered = sorted(candidates, key=lambda aid: weights.get(aid, 0.0), reverse=True)
            winner = ordered[0]
            return {aid: aid == winner for aid in candidates}
        if mode == "fair_queue":
            best_agent = None
            best_score = None
            for agent_id in candidates:
                weight = max(weights.get(agent_id, 0.0), 1e-6)
                counter = self._fair_counters.get(agent_id, 0.0)
                score = counter / weight
                if best_score is None or score < best_score:
                    best_agent = agent_id
                    best_score = score
            assert best_agent is not None
            self._fair_counters[best_agent] = self._fair_counters.get(best_agent, 0.0) + 1.0
            return {aid: aid == best_agent for aid in candidates}
        if mode == "auction":
            ordered = sorted(candidates, key=lambda aid: weights.get(aid, 0.0), reverse=True)
            winner = ordered[0]
            return {aid: aid == winner for aid in candidates}
        raise ValueError(f"Unknown arbitration mode '{mode}'")

    def audit(self, agent_id: str, day: int, log: AuditLog) -> AuditLog:
        tree = self.reservations.get(day)
        if log.choice and tree is not None:
            start, end = log.choice
            log.conflicts = tree.conflict_ids(agent_id, start, end)
        log.budgets = self._snapshot_budget(agent_id)
        return log

    def _candidate_windows(self, mask: Sequence[bool], width: int) -> List[int]:
        result: List[int] = []
        true_run = 0
        for idx, flag in enumerate(mask):
            true_run = true_run + 1 if flag else 0
            if true_run >= width:
                result.append(idx - width + 1)
        return result

    def _windows_to_mask(self, windows: Sequence[Tuple[int, int]], template: TimeField) -> TimeField:
        mask = [0.0] * template.length
        for start, end in windows:
            if end <= start:
                continue
            start_idx = max(0, math.floor((start - template.t_start) / template.dt))
            end_idx = min(template.length, math.ceil((end - template.t_start) / template.dt))
            for idx in range(start_idx, end_idx):
                mask[idx] = 1.0
        return TimeField(mask, template.dt, template.t_start)

    def _ensure_budget_entry(self, agent_id: str) -> Dict[str, object]:
        if agent_id not in self.budgets:
            cooldown = [0.0] * 1440
            self.budgets[agent_id] = {
                "time_min": 1440,
                "tasks_day": 10,
                "cooldown": cooldown,
            }
        return self.budgets[agent_id]

    def _get_cooldown(self, agent_id: str, day: int) -> List[float]:
        entry = self._ensure_budget_entry(agent_id)
        return entry["cooldown"]  # type: ignore[return-value]

    def _bump_cooldown(self, agent_id: str, day: int, start: int, end: int, delta: int) -> None:
        entry = self._ensure_budget_entry(agent_id)
        cooldown: List[float] = entry["cooldown"]  # type: ignore[assignment]
        start_idx = max(0, min(1440, start))
        end_idx = max(0, min(1440, end))
        if end_idx <= start_idx:
            return
        bump = delta / 1440.0
        for idx in range(start_idx, end_idx):
            cooldown[idx] = min(cooldown[idx] + bump, 1.0)

    def _decrement_budget(self, agent_id: str, key: str, amount: int) -> None:
        if amount < 0:
            raise ValueError("amount must be non-negative")
        entry = self._ensure_budget_entry(agent_id)
        current = int(entry.get(key, 0))
        entry[key] = max(current - amount, 0)

    def _snapshot_budget(self, agent_id: str) -> Dict[str, int]:
        entry = self._ensure_budget_entry(agent_id)
        return {
            "time_min": int(entry.get("time_min", 0)),
            "tasks_day": int(entry.get("tasks_day", 0)),
        }


def _mean(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)
