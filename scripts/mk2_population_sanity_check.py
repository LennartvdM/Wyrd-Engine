"""Population-level sanity check harness for Engine MK2 schedules."""

from __future__ import annotations

import argparse
import random
import statistics
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from archetypes import (
    create_exhausted_parent,
    create_night_owl_freelancer,
    create_office_worker,
)
from engines.engine_mk2 import EngineMK2
from models import PersonProfile

ARCHETYPE_FACTORIES: Dict[str, Callable[[], PersonProfile]] = {
    "office": create_office_worker,
    "parent": create_exhausted_parent,
    "freelancer": create_night_owl_freelancer,
}


def pick_archetype(choice: Sequence[str], rng: random.Random) -> str:
    if not choice:
        raise ValueError("At least one archetype must be provided")
    return rng.choice(choice)


def build_profile(archetype: str) -> PersonProfile:
    try:
        factory = ARCHETYPE_FACTORIES[archetype]
    except KeyError as exc:
        raise ValueError(f"Unknown archetype '{archetype}'") from exc
    return factory()


def summarise_events(events: Iterable[Dict[str, object]]) -> Dict[str, float]:
    totals: Dict[str, int] = defaultdict(int)
    for event in events:
        activity = str(event.get("activity"))
        minutes = int(event.get("duration_minutes", 0))
        totals[activity] += minutes
    return {activity: round(minutes / 60.0, 2) for activity, minutes in totals.items()}


def compute_min_mean_max(values: Sequence[float]) -> Tuple[float, float, float]:
    if not values:
        return (0.0, 0.0, 0.0)
    return (min(values), statistics.mean(values), max(values))


def bucketize(values: Sequence[float], bucket_edges: Sequence[int]) -> List[Tuple[str, int]]:
    labels: List[Tuple[str, int]] = []
    if not values:
        return labels

    buckets = [0 for _ in range(len(bucket_edges) + 1)]
    for value in values:
        placed = False
        for index, edge in enumerate(bucket_edges):
            if value < edge:
                buckets[index] += 1
                placed = True
                break
        if not placed:
            buckets[-1] += 1

    lower = 0
    for index, count in enumerate(buckets):
        if index < len(bucket_edges):
            upper = bucket_edges[index]
            label = f"{lower}–{upper}h"
            lower = upper
        else:
            label = f">= {lower}h"
        labels.append((label, count))
    return labels


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=100, help="Number of synthetic people to generate")
    parser.add_argument(
        "--archetypes",
        nargs="*",
        default=list(ARCHETYPE_FACTORIES.keys()),
        help="Subset of archetypes to sample from",
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="Seed for sampling the population and weekly schedules"
    )
    args = parser.parse_args()

    rng = random.Random(args.seed)
    engine = EngineMK2()

    sleep_totals: List[float] = []
    work_totals: List[float] = []
    free_totals: List[float] = []

    for index in range(args.samples):
        archetype = pick_archetype(args.archetypes, rng)
        profile = build_profile(archetype)
        week_seed = rng.randint(0, 10_000_000)
        result = engine.generate_complete_week(
            profile=profile,
            start_date=date(2024, 1, 1),
            week_seed=week_seed,
        )

        summary = summarise_events(result["events"])
        sleep_totals.append(summary.get("sleep", 0.0))
        work_totals.append(summary.get("work", 0.0))
        free_totals.append(summary.get("free time", 0.0))

    sleep_stats = compute_min_mean_max(sleep_totals)
    work_stats = compute_min_mean_max(work_totals)
    free_stats = compute_min_mean_max(free_totals)

    print(f"Population size: {args.samples}")
    print("Archetypes:", ", ".join(sorted(set(args.archetypes))))
    print()
    print("Weekly sleep hours (min/mean/max): {:.2f} / {:.2f} / {:.2f}".format(*sleep_stats))
    print("Weekly work hours (min/mean/max): {:.2f} / {:.2f} / {:.2f}".format(*work_stats))
    print("Weekly free-time hours (min/mean/max): {:.2f} / {:.2f} / {:.2f}".format(*free_stats))

    print()
    print("Sleep distribution (hours/week):")
    for label, count in bucketize(sleep_totals, [20, 40, 60]):
        print(f"  {label:<8} : {count}")


if __name__ == "__main__":
    main()
