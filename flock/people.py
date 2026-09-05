"""Traits drawn once per person, the mutable state of a person, households, workplaces
and make_population."""
import math
from dataclasses import dataclass
from typing import NamedTuple

from .clock import clamp
from .seeds import stream


class Habit(NamedTuple):
    name: str          # gym, club, laundry
    days: tuple        # weekdays it is tried on
    minute: int        # usual minute of day
    duration: int
    place: str


class Segment(NamedTuple):
    person_id: int
    activity: str
    place: str
    start: int
    end: int
    with_ids: frozenset


@dataclass(frozen=True)
class Traits:
    sleep_need_min: int
    bedtime_minute: int
    prep_min: int
    commute_min: int
    start_offset_min: int
    day_len_min: int
    afternoon_shift: bool
    home_days: int
    sociability: float
    responsiveness: float
    skips_breakfast: bool
    habits: tuple


def draw_traits(r, workplace, partner):
    """Every draw comes from the person's own stream; partner = first household member."""
    sleep_need = clamp(round(r.gauss(470, 55)), 380, 600)
    prep = clamp(round(r.gauss(35, 10)), 20, 60)
    commute = clamp(round(r.lognormvariate(math.log(24), 0.5)), 5, 90)   # ACS median 24 min
    start_offset = round(r.gauss(0, 12))
    full_time = r.random() < 0.85
    day_len = clamp(round(r.gauss(535, 25) if full_time else r.gauss(300, 40)), 120, 720)
    afternoon = not full_time and r.random() < 0.5
    home_days = r.choice((1, 2)) if r.random() < 0.2 else 0
    sociability, responsiveness, skips_breakfast = r.random(), r.uniform(0.5, 1.5), r.random() < 0.2
    if partner is not None:
        bedtime = partner.traits.bedtime_minute + round(r.gauss(0, 20))
    elif workplace is not None:
        alarm = workplace.start_minute + start_offset + (300 if afternoon else 0) - commute - prep - 5
        bedtime = alarm + 1440 - sleep_need + 10 + round(r.gauss(0, 40))    # a little short of need
        if workplace.start_minute <= 600:
            bedtime = min(bedtime, 1415)   # late day-shift starters still turn in by 23:35
    else:                                  # no alarm: a habitual wake around 07:00 sets the bedtime
        bedtime = 400 + round(r.gauss(0, 35)) + 1440 - sleep_need
    habits = []
    if r.random() < 0.4:
        habits.append(Habit("gym", tuple(sorted(r.sample(range(5), 2))), 1035, 60, "out"))   # 17:15
    if r.random() < 0.4:
        habits.append(Habit("club", (r.randrange(5),), 1170, 120, "out"))
    if r.random() < 0.7:
        habits.append(Habit("laundry", (r.choice((5, 6)),), 600, 60, "home"))
    return Traits(sleep_need, clamp(bedtime, 1290, 1500), prep, commute, start_offset, day_len,
                  afternoon, home_days if workplace is not None else 0, sociability,
                  responsiveness, skips_breakfast, tuple(habits))


class Person:
    def __init__(self, id, household_id, workplace_id, traits, rand):
        self.id, self.household_id, self.workplace_id = id, household_id, workplace_id
        self.traits, self.rand = traits, rand
        self.activity, self.place, self.started_at, self.ends_at = "sleep", "home", 0, 0
        self.interruptible, self.with_ids = 0.0, frozenset()
        self.version = 0                   # bumped by every start(); stale heap entries are dropped
        self.woke_at = self.bed_at = self.sleep_debt = self.last_meal_at = self.last_snack_at = 0
        self.last_meal_day = {}            # meal name -> day index it was last eaten
        self.lunch_at = 0                  # today's lunch minute when not at work, drawn at wake
        self.bed_tonight = 0               # tonight's bedtime, drawn at wake
        self.commitments = []              # sorted by start
        self.pings_from = {}               # agent_id -> (nag, at)
        self.resume = None                 # activity put on hold by a phone call
        self.planned = None                # free activity waiting at the far end of a commute
        self.log = []                      # finished Segments


# Workplace start minute: share of workplaces (ACS arrival bins, mode 08:00).
START_MINUTES = ((360, .06), (420, .10), (450, .12), (480, .22), (510, .13), (540, .10),
                 (570, .07), (600, .07), (720, .04), (840, .06), (1080, .03))


class Workplace:
    def __init__(self, seed, id):
        r = self.rand = stream(seed, "workplace", id)
        self.id, self.members = id, []
        self.size = r.randint(8, 40)
        # A population has few workplaces (400 people -> ~10), so the start minute and the
        # seven-day flag are spread over their distributions by id, with a little jitter.
        u = (id * 0.618033988749895 + r.random() * 0.05) % 1
        self.start_minute = next(m for m, cum in START_CUMULATIVE if u < cum)
        self.seven_day = (id * 0.414213562373095 + r.random() * 0.05) % 1 < 0.35
        lunch = self.start_minute + 270
        if self.start_minute <= 600:       # day shifts eat between 11:45 and 13:00 whatever the start
            lunch = clamp(lunch, 705, 780)
        self.lunch_minute = lunch + round(r.gauss(0, 15))
        self.meetings = []                 # (start, end, attendee ids) for the realism checks


START_CUMULATIVE = [(m, sum(w for _, w in START_MINUTES[:i + 1]) + 1e-9) for i, (m, _) in enumerate(START_MINUTES)]


class Household:
    def __init__(self, seed, id):
        r = self.rand = stream(seed, "household", id)
        self.id, self.members = id, []
        u = r.random()
        self.size = 1 if u < 0.3 else 2 if u < 0.7 else r.choice((3, 4))
        self.dinner_minute = round(r.gauss(1110, 40))      # 18:30
        self.dinner_days = set()
        self.cook_index = 0
        self.dinner_ends = {}              # dinner minute -> when the shared meal ends
        self.dinners = []                  # every dinner minute so far, for the checks


def make_population(seed, n):
    """Households fill up in id order, workplaces in id order over the employed 60 %.
    The last household and workplace may be cut short by n."""
    people, households, workplaces = [], [], []
    for pid in range(n):
        if not households or len(households[-1].members) == households[-1].size:
            households.append(Household(seed, len(households)))
        h = households[-1]
        h.members.append(pid)
        r = stream(seed, "person", pid)
        w = None
        if r.random() < 0.60:
            if not workplaces or len(workplaces[-1].members) == workplaces[-1].size:
                workplaces.append(Workplace(seed, len(workplaces)))
            w = workplaces[-1]
            w.members.append(pid)
        partner = people[h.members[0]] if len(h.members) == 2 else None
        traits = draw_traits(r, w, partner)
        people.append(Person(pid, h.id, w.id if w else None, traits, r))
    return people, households, workplaces
