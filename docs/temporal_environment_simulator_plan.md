# Temporal Environment Simulator (TES) Development Plan

## 1. Project Overview
- **Purpose**: Generate deterministic, tunable temporal fields and schedules for agents in a one-way, non-reactive environment.
- **Core Principles**: One-way generation, constraint-first modelling, subtractive modulation, temporal continuity, composability.
- **Primary Modules**: Engine (field generation), EngineFederation (multi-domain coordination), AgentOverlay (agent decision layer), Streamlit GUI.
- **Success Criteria**:
  - Deterministic generation with seeded RNG (exact replays).
  - Generate at least 1M entity-days in under 10 minutes.
  - GUI offers interactive tuning, visualization, and exports.
  - Automated tests verify determinism, invariants, and monotonic controls.

## 2. Technical Stack
- **Backend**: Python 3.12+, leveraging NumPy, SciPy, NetworkX, SortedContainers, Pandas, dataclasses, typing, hashlib.
- **Optional**: GPy (Phase 5) for Gaussian Process macro drift.
- **GUI**: Streamlit for rapid, cross-platform interface.
- **Testing**: Pytest + NumPy testing utilities; Streamlit manual testing for UI.
- **Tooling**: Poetry or Pipenv for dependency management; Docker (Phase 5) for deployment.

## 3. Architecture Overview
```
┌────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│  Engine (per   │     │  EngineFederation  │     │    AgentOverlay     │
│  archetype)    │◀────│  (itineraries &    │────▶│  (policies, budgets │
│                │     │  multi-domain sync)│     │  & reservations)    │
└────────────────┘     └────────────────────┘     └────────────────────┘
           │                          │                           │
           ▼                          ▼                           ▼
       Temporal fields          Federation fields            Decisions & logs
           │                          │                           │
           └──────────────┬───────────┴──────────┬─────────────────┘
                          ▼                      ▼
                   Streamlit GUI          Exports & analytics
```

### Data Flow
1. Users configure archetype parameters, interventions, and seeds in the GUI.
2. Engine generates temporal fields and segments per day using deterministic pipelines.
3. EngineFederation coordinates multiple engines, applies shared calendars, and constructs overlap graphs.
4. AgentOverlay merges fields, applies policies, arbitrates reservations, and tracks budgets/audits.
5. GUI renders timelines, heatmaps, overlap graphs, audit reports, and supports CSV/JSON exports.

### Invariants & Constraints
- Coverage of 1440 minutes per day.
- Activity-specific min/max durations and spacing constraints.
- Precedence rules (sleep → wake → commute → work → commute → leisure).
- Deterministic outputs when seeds and parameters match.
- Monotonic knobs (e.g., higher rigidity reduces drift).

## 4. Expanded GUI Wireframes
```
Streamlit Layout
┌────────────────────────────────────────────────────────────────┐
│ Sidebar                                                        │
│ ├─ Archetype selector (multiselect)                            │
│ ├─ Seed inputs (field, noise, intervention)                    │
│ ├─ Knobs (sliders): rigidity, phase_jitter, shock_tau, etc.    │
│ ├─ Days to generate (numeric input)                            │
│ ├─ Agents & itineraries (dynamic form)                         │
│ └─ Action buttons: Generate, Reset                             │
│                                                                │
│ Tabs                                                           │
│ ├─ Config                                                      │
│ │   • Summary cards of current selections                      │
│ │   • Preview field plot (1-day quick render)                  │
│ ├─ Generation                                                  │
│ │   • Gantt chart (Matplotlib) per agent/engine                │
│ │   • Heatmap (Plotly) of field intensities                    │
│ │   • Overlap matrix table                                     │
│ └─ Simulation                                                  │
│     • Policy controls (threshold, pick strategy, cooldown)     │
│     • Reservation results table                                │
│     • Audit log JSON viewer                                    │
│     • Overlap graph visualization (NetworkX)                   │
└────────────────────────────────────────────────────────────────┘
```

## 5. Development Phases (Concise)
1. **Phase 1 — Core Engine**
   - Implement dataclasses, deterministic baseline, multi-band noise, interventions, projections, and validation.
   - Verify deterministic outputs, projection idempotence, and invariant enforcement.

2. **Phase 2 — Federation**
   - Add lazy field sampling, shared calendar shifts, and overlap graph generation.
   - Test phase shifts, field slicing, and determinism across itineraries.

3. **Phase 3 — Agent Overlay**
   - Build algebraic field operators, policy scoring, reservation handling, arbitration, and audit logging.
   - Validate budget monotonicity, cooldown behavior, and associative deformation bounds.

4. **Phase 4 — Streamlit GUI**
   - Integrate parameter controls, generation triggers, visualization components, and exports.
   - Conduct manual verification for user flows and responsiveness.

5. **Phase 5 — Enhancements & Deployment**
   - Integrate GP macro drift, expand automated test coverage, document architecture, and dockerize the app.
   - Measure performance (1M entity-days) and finalize release assets.

## 6. Agent Behavior Testing Strategy
- **Unit Tests**: Validate policy thresholds, cooldown adjustments, and reservation conflicts using Pytest fixtures.
- **Integration Tests**: Simulate multi-agent scenarios with varying priorities to ensure arbitration fairness and budget caps.
- **Stress Tests**: Generate large itineraries (≥10k reservations) to confirm performance and determinism.
- **Audit Review**: Automatically compare audit logs against expected event sequences for regression detection.

## 7. Core Module Code Blocks

### Engine (`engine.py`)
```python
import numpy as np
import hashlib
from dataclasses import dataclass
from typing import List, Dict, Optional, Callable, Tuple
import pandas as pd

@dataclass
class Segment:
    start: int
    end: int
    activity: str
    location: Optional[str] = None
    priority: int = 0
    buffer: Optional[Dict[str, int]] = None

@dataclass
class Intervention:
    id: str
    window: List[int]
    region: Optional[str] = None
    affects: Callable[[Segment], bool] = lambda s: False
    deform: Callable[[Segment, float], Tuple[Segment, int]] = lambda s, i: (s, 0)
    kernel: Optional[Callable[[int], float]] = None

@dataclass
class Archetype:
    harmonics: List[tuple[float, float]]
    constraints: Dict[str, Dict[str, any]]
    noise: Dict[str, float]
    knobs: Dict[str, float]
    T: int = 1440

# Utility helpers (normalize_segments, denormalize_segments, clamp_to_window_norm, etc.)
# ...

class Engine:
    def __init__(self, archetypes: Dict[str, Archetype], calendars: Dict[str, Dict], interventions: List[Intervention]):
        self.archetypes = archetypes
        self.calendars = calendars
        self.interventions = interventions
        self.T = 1440

    def _seed_rng(self, base: str, *parts: str) -> np.random.Generator:
        digest = hashlib.sha256("|".join((base, *parts)).encode()).digest()
        seed = int.from_bytes(digest[:8], "big", signed=False)
        return np.random.default_rng(seed)

    def generate(self, entity_id: str, archetype_key: str, days: int = 1) -> List[List[Segment]]:
        archetype = self.archetypes[archetype_key]
        results: List[List[Segment]] = []
        for day in range(days):
            rng = self._seed_rng(entity_id, archetype_key, str(day))
            baseline = self._baseline(archetype)
            field = self._apply_noise(archetype, baseline, rng)
            segments = self._decode_to_segments(field, archetype, rng)
            segments = self._apply_interventions(segments, archetype, rng)
            projected = self._project_invariance(segments, archetype)
            violations = self._validate(projected, archetype)
            if violations:
                raise ValueError(f"Invariant violations detected: {violations}")
            results.append(projected)
        return results

    # Baseline, noise, decode, intervention, projection, and validation methods as finalized in the prototype
    # ...
```

### Federation (`federation.py`)
```python
import numpy as np
import networkx as nx
from typing import Dict, List, Tuple

class EngineFederation:
    def __init__(self, engines: Dict[str, Engine], shared_calendar: Dict[str, int] | None = None):
        self.engines = engines
        self.calendar = shared_calendar or {}

    def generate_for_agent(self, agent_id: str, itinerary: List[Tuple[str, List[int]]], days: int = 7) -> Dict[str, List[List[Segment]]]:
        output: Dict[str, List[List[Segment]]] = {}
        for engine_name, windows in itinerary:
            engine = self.engines[engine_name]
            output[engine_name] = engine.generate(agent_id, engine_name, days)
            shift = self.calendar.get(engine_name, 0)
            if shift:
                for day_segments in output[engine_name]:
                    for seg in day_segments:
                        seg.start = (seg.start + shift) % engine.T
                        seg.end = (seg.end + shift) % engine.T
        return output

    def sample_field(self, engine_name: str, start_minute: int, end_minute: int, archetype_key: str, entity_id: str) -> np.ndarray:
        engine = self.engines[engine_name]
        rng = engine._seed_rng(entity_id, archetype_key, "sample")
        baseline = engine._baseline(engine.archetypes[archetype_key])
        field = engine._apply_noise(engine.archetypes[archetype_key], baseline, rng)
        return field[start_minute:end_minute]

    def overlap_graph(self, fields: Dict[str, List[List[Segment]]]) -> nx.Graph:
        graph = nx.Graph()
        engine_names = list(fields.keys())
        for i, left in enumerate(engine_names):
            for right in engine_names[i + 1:]:
                overlap = self._compute_overlap(fields[left], fields[right])
                graph.add_edge(left, right, weight=overlap)
        return graph

    def _compute_overlap(self, segments_a: List[List[Segment]], segments_b: List[List[Segment]]) -> int:
        total = 0
        for day_a, day_b in zip(segments_a, segments_b):
            mask_a = self._segments_to_mask(day_a)
            mask_b = self._segments_to_mask(day_b)
            total += int(np.dot(mask_a, mask_b))
        return total

    @staticmethod
    def _segments_to_mask(segments: List[Segment], length: int = 1440) -> np.ndarray:
        mask = np.zeros(length, dtype=int)
        for seg in segments:
            mask[seg.start:seg.end] = 1
        return mask
```

### Agent Overlay (`overlay.py`)
```python
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Tuple
from sortedcontainers import SortedList

@dataclass
class TimeField:
    values: np.ndarray
    dt: int = 1
    t0: int = 0

@dataclass
class Policy:
    threshold: float
    pick: str = "earliest"
    duration: int = 60

@dataclass
class AuditLog:
    entries: List[Dict] = field(default_factory=list)

    def record(self, event: str, payload: Dict) -> None:
        self.entries.append({"event": event, **payload})

class IntervalTree:
    def __init__(self) -> None:
        self._intervals = SortedList()

    def add(self, start: int, end: int) -> None:
        self._intervals.add((start, end))

    def conflicts(self, start: int, end: int) -> bool:
        idx = self._intervals.bisect_left((start, end))
        neighbors = []
        if idx > 0:
            neighbors.append(self._intervals[idx - 1])
        if idx < len(self._intervals):
            neighbors.append(self._intervals[idx])
        return any(not (end <= n_start or start >= n_end) for n_start, n_end in neighbors)

class AgentOverlay:
    def __init__(self) -> None:
        self.reservations: Dict[int, IntervalTree] = {}
        self.budgets: Dict[str, float] = {}
        self.cooldowns: Dict[str, int] = {}
        self.audit = AuditLog()

    def score(self, fields: Dict[str, TimeField], policy: Policy, agent_id: str, day: int) -> Tuple[np.ndarray, np.ndarray]:
        composite = np.ones_like(next(iter(fields.values())).values)
        for field_obj in fields.values():
            composite *= field_obj.values
        candidates = (composite >= policy.threshold).astype(int)
        self.audit.record("score", {"agent": agent_id, "day": day, "threshold": policy.threshold})
        return composite, candidates

    def pick(self, candidates: np.ndarray, policy: Policy) -> Tuple[int, int] | None:
        indices = np.where(candidates > 0)[0]
        if indices.size == 0:
            return None
        start = int(indices[0])
        end = start + policy.duration
        return start, end

    def reserve(self, agent_id: str, day: int, window: Tuple[int, int]) -> bool:
        tree = self.reservations.setdefault(day, IntervalTree())
        if tree.conflicts(*window):
            self.audit.record("reservation_conflict", {"agent": agent_id, "day": day, "window": window})
            return False
        tree.add(*window)
        self.audit.record("reservation_confirmed", {"agent": agent_id, "day": day, "window": window})
        return True
```

## 8. Testing & Validation
- **Pytest suites** covering engine determinism, projection idempotence, federation overlaps, and overlay budgeting.
- **CI Considerations**: Run `pytest --maxfail=1 --disable-warnings -q` and optionally `pytest --cov` for coverage (>90% target).
- **Manual GUI Checks**: Validate slider responses, generation latencies, and visualization rendering for multiple agents/domains.

## 9. Deployment Notes
- Streamlit entry point: `streamlit run app.py`.
- Dockerization (Phase 5): Minimal image running `poetry install` and launching Streamlit.
- Recommended exports: zipped JSON schedules, CSV summaries, PNG graphs for audits.

---
This plan is modular, deterministic, and ready for sequential implementation via a coding assistant. Prompt each phase with the associated context and code blocks to build TES incrementally.
