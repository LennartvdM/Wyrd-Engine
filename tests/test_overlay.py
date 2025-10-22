from __future__ import annotations

from typing import Dict, List, Tuple

from tes.overlay import AgentOverlay, IntervalTree, Policy, TimeField


def linspace(start: float, stop: float, num: int) -> List[float]:
    if num == 1:
        return [float(start)]
    step = (stop - start) / (num - 1)
    return [start + step * i for i in range(num)]


def build_fields(dt: int = 15) -> Dict[str, object]:
    steps = 1440 // dt
    base_time = linspace(0.3, 0.9, steps)
    readiness = TimeField(base_time, dt)
    availability = TimeField([min(1.0, v + 0.05) for v in base_time], dt)
    congestion = TimeField([max(0.0, 1.0 - v) for v in base_time], dt)
    windows: List[Tuple[int, int]] = [(480, 720), (780, 900)]
    return {
        "R": readiness,
        "A": availability,
        "C": congestion,
        "windows": windows,
    }


def count_true(values: List[bool]) -> int:
    return sum(1 for v in values if v)


def test_threshold_monotonicity() -> None:
    overlay = AgentOverlay()
    low_policy = Policy(threshold=0.5, duration=60)
    high_policy = Policy(threshold=0.8, duration=60)
    fields = build_fields()

    _, candidates_low, _ = overlay.score(fields, low_policy, day=0)
    _, candidates_high, _ = overlay.score(fields, high_policy, day=0)

    assert count_true(candidates_high) <= count_true(candidates_low)


def test_pick_idempotent() -> None:
    overlay = AgentOverlay()
    policy = Policy(threshold=0.5, duration=60)
    fields = build_fields()

    score_field, candidates, log = overlay.score(fields, policy, day=0)
    win_one, log_one = overlay.pick(score_field, candidates, policy, day=0, agent_id="agent_1", base_log=log)
    win_two, log_two = overlay.pick(score_field, candidates, policy, day=0, agent_id="agent_1", base_log=log)

    assert win_one == win_two
    assert log_one.choice == log_two.choice


def test_reservation_and_budget_updates() -> None:
    overlay = AgentOverlay()
    policy = Policy(threshold=0.5, duration=60)
    fields = build_fields()
    score_field, candidates, log = overlay.score(fields, policy, day=0)
    window, log = overlay.pick(score_field, candidates, policy, day=0, agent_id="agent_1", base_log=log)
    assert window is not None
    success = overlay.reserve("agent_1", day=0, window=window)
    assert success is True
    audited = overlay.audit("agent_1", 0, log)
    assert 0 <= audited.budgets["time_min"] <= 1440
    assert 0 <= audited.budgets["tasks_day"] <= 10


def test_reservation_conflict_triggers_cooldown() -> None:
    overlay = AgentOverlay()
    tree = IntervalTree()
    tree.add("agent_a", 600, 660)
    overlay.reservations[0] = tree
    success = overlay.reserve("agent_b", 0, (610, 650))
    assert success is False
    cooldown = overlay._get_cooldown("agent_b", 0)
    assert sum(cooldown[610:650]) > 0


def test_arbitration_modes() -> None:
    overlay = AgentOverlay()
    candidates = {"agent_a": (600, 660), "agent_b": (600, 660)}
    weights = {"agent_a": 0.8, "agent_b": 0.2}

    result_priority = overlay.arbitrate(candidates, weights, mode="priority")
    assert result_priority["agent_a"] is True
    assert result_priority["agent_b"] is False

    result_auction = overlay.arbitrate(candidates, weights, mode="auction")
    assert result_auction == result_priority

    weights_even = {"agent_a": 0.5, "agent_b": 0.5}
    result_fair_one = overlay.arbitrate(candidates, weights_even, mode="fair_queue")
    result_fair_two = overlay.arbitrate(candidates, weights_even, mode="fair_queue")
    assert result_fair_one != result_fair_two
    assert result_fair_one["agent_a"] != result_fair_two["agent_a"]


def test_interval_tree_conflict_detection() -> None:
    tree = IntervalTree()
    tree.add("agent_a", 600, 660)
    tree.add("agent_b", 700, 730)
    assert tree.conflicts("agent_c", 605, 620) is True
    assert tree.conflicts("agent_a", 605, 620) is False
    assert tree.conflicts("agent_c", 660, 690) is False
