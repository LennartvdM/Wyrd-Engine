"""Traits drawn once per person, the mutable state of a person, households, workplaces
and make_population."""
import math
from dataclasses import dataclass
from typing import NamedTuple

from .clock import clamp
from .seeds import stream


class Habit(NamedTuple):
    name: str          # gym, club, laundry; class, coffee, volunteer, shop for non-workers
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
    sleep_need = clamp(round(r.gauss(485 if workplace else 490, 55)), 400, 560)   # employed weekday sleep 492, all adults 526; habitual sd ~50
    prep = clamp(round(r.gauss(35, 10)), 20, 60)
    commute = clamp(round(r.lognormvariate(math.log(24), 0.5)), 5, 90)   # ACS median 24 min
    start_offset = round(r.gauss(0, 12))
    full_time = r.random() < 0.85                                   # full-time 8.4 h, all employed 7.9 h on days worked
    day_len = clamp(round(r.gauss(535, 25) if full_time else r.gauss(300, 40)), 120, 720)
    afternoon = not full_time and r.random() < 0.5
    home_days = r.choice((1, 2)) if r.random() < 0.2 else 0
    sociability, responsiveness, skips_breakfast = r.random(), r.uniform(0.5, 1.5), r.random() < 0.2
    if workplace is not None:              # the alarm leaves prep + 10 before leaving (sleep_end takes the same margin)
        alarm = workplace.start_minute + start_offset + (300 if afternoon else 0) - commute - prep - 15
        bedtime = alarm + 1440 - sleep_need + round(r.gauss(0, 40))   # the alarm bites: a little debt a night, paid back at the weekend
        if workplace.start_minute <= 600:
            bedtime = min(bedtime, 1439)   # day-shift starters turn in by midnight (sleep crosses midnight, check 6a)
    else:                                  # no alarm: bed around 23:00 (reference bedtime_median), wake follows the need
        bedtime = 1380 + round(r.gauss(0, 25))
    if partner is not None:                # partners meet halfway between their own bedtimes
        bedtime = round((bedtime + partner.traits.bedtime_minute) / 2) + round(r.gauss(0, 15))
    habits = []
    if r.random() < 0.4:
        habits.append(Habit("gym", tuple(sorted(r.sample(range(5), 2))), r.choice(range(1020, 1141, 15)), 60, "out"))   # 17:00-19:00
    if r.random() < 0.4:
        habits.append(Habit("club", (r.randrange(5),), r.choice(range(1140, 1201, 15)), 120, "out"))   # 19:00-20:00
    if r.random() < 0.7:
        habits.append(Habit("laundry", (r.choice((5, 6)),), r.choice(range(540, 961, 15)), 60, "home"))   # 09:00-16:00
    if workplace is None:                  # 1-3 standing daytime commitments a week, each on its own weekday
        for name, minutes, duration in r.sample(DAYTIME_HABITS, r.randint(1, 3)):
            habits.append(Habit(name, (r.randrange(5),), r.choice(minutes), duration, "out"))
    return Traits(sleep_need, clamp(bedtime, 1290, 1500), prep, commute, start_offset, day_len,
                  afternoon, home_days if workplace is not None else 0, sociability,
                  responsiveness, skips_breakfast, tuple(habits))


# name, usual minutes of day, duration: a class, a standing coffee, volunteering, the weekly shop
DAYTIME_HABITS = (("class", (600, 840), 120), ("coffee", (630,), 90), ("volunteer", (540, 780), 180), ("shop", (600, 900), 90))


class Person:
    def __init__(self, id, household_id, workplace_id, traits, rand):
        self.id, self.household_id, self.workplace_id = id, household_id, workplace_id
        self.traits, self.rand = traits, rand
        self.activity, self.place, self.started_at, self.ends_at = "sleep", "home", 0, 0
        self.interruptible, self.with_ids = 0.0, frozenset()
        self.version = 0                   # bumped by every start(); stale heap entries are dropped
        self.woke_at = self.bed_at = self.sleep_debt = self.last_meal_at = self.last_snack_at = 0
        self.last_meal_day = {}            # meal name (or "break") -> day index it was last had; breakfast -> the wake it followed
        self.today, self.minutes_today = {}, {}   # activity -> times started, minutes finished, since waking
        self.lunch_at = 0                  # today's lunch minute when not at work, drawn at wake
        self.bed_tonight = 0               # tonight's bedtime, drawn at wake
        self.wind_down = 30                # minutes at home before it when coming in from out, drawn at wake
        self.breakfast_min = 15            # today's breakfast length, drawn at wake (the wash leaves room for it)
        self.commitments = []              # sorted by start
        self.pings_from = {}               # agent_id -> (nag, at, started_at of the activity already charged the +2)
        self.resume = None                 # activity put on hold by a phone call
        self.planned = None                # free activity waiting at the far end of a commute
        self.log = []                      # finished Segments


# Workplace start minute: share of workplaces (ACS arrival bins, mode 08:00; 0.57 of workers leave
# home 06:00-08:29, 0.07 arrive 10:00-14:00, 0.08 14:00-18:00, 0.035 after 18:00).
START_MINUTES = ((330, .02), (360, .06), (420, .11), (450, .13), (480, .20), (510, .13), (540, .08),
                 (570, .06), (600, .06), (720, .05), (840, .07), (1080, .03))


class Workplace:
    def __init__(self, seed, id, earlier):
        """earlier: the workplaces already filled, in id order."""
        r = self.rand = stream(seed, "workplace", id)
        self.id, self.members = id, []
        self.size = r.randint(8, 40)
        # A population has few workplaces (400 people -> ~23) of very different sizes, so the start
        # minute is drawn among the bins still short of their share of the employed placed so far
        # (this workplace included), in proportion to the squared shortfall, and the workplace holds
        # at most that shortfall plus a quarter of its bin's share of the employed so far, so no bin
        # overfills at any population size; the seven-day flag keeps the member-weighted share near
        # 0.35 (0.30 of the employed work on a weekend day).  None of this depends on n: person n+1
        # changes no earlier workplace.
        before = sum(len(w.members) for w in earlier)
        short = [max(0.0, share * (before + self.size) - sum(len(w.members) for w in earlier if w.start_minute == m))
                 for m, share in START_MINUTES]
        k = r.choices(range(len(START_MINUTES)), [x * x for x in short])[0]
        self.start_minute, share = START_MINUTES[k]
        self.size = min(self.size, max(6, round(short[k] + 0.25 * share * max(before + self.size, 120))))
        seven = sum(len(w.members) for w in earlier if w.seven_day)   # flagged when the share, half of itself included, is under 0.35
        self.seven_day = ((seven + self.size / 2) / (before + self.size / 2) if before else r.random()) + r.uniform(-0.05, 0.05) < 0.35
        lunch = self.start_minute + 270
        if self.start_minute <= 600:       # day shifts eat between 11:45 and 13:00 whatever the start
            lunch = clamp(lunch, 705, 780)
        self.lunch_minute = lunch + round(r.gauss(0, 10))
        self.meetings = []                 # (start, end, attendee ids) for the realism checks
        self.roster = {}                   # seven-day workplaces: member -> position in ROSTER next week


class Household:
    def __init__(self, seed, id):
        r = self.rand = stream(seed, "household", id)
        self.id, self.members = id, []
        u = r.random()
        self.size = 1 if u < 0.3 else 2 if u < 0.7 else r.choice((3, 4))
        self.dinner_minute = clamp(round(r.gauss(1110, 45)), 1035, 1230)   # 17:15-20:30; dinner peak window 17:30-19:00
        self.lunch_at = {}                 # day index -> the household's lunch minute
        self.cook_index = 0
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
        if r.random() < 0.60:                                       # 0.6 of the population 15+ employed
            if not workplaces or len(workplaces[-1].members) == workplaces[-1].size:
                workplaces.append(Workplace(seed, len(workplaces), workplaces))
            w = workplaces[-1]
            w.members.append(pid)
        partner = people[h.members[0]] if len(h.members) == 2 else None
        traits = draw_traits(r, w, partner)
        people.append(Person(pid, h.id, w.id if w else None, traits, r))
    return people, households, workplaces
