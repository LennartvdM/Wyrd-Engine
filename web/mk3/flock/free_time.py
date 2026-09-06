"""The free-activity table and the weighted pick that fills gaps between commitments."""
import bisect

from .clock import DAY, weekday, fit_end, minutes

# name, median min, lognormal sigma, place, latest start (minute of day), weekday weights for
# 05-09 09-12 12-17 17-20 20-24, weekend weights.  A walk starts from wherever the person is
# ("here": no trip, logged out); exercise is out with p 0.5 when there is time for the trip.
ROWS = (
    ("tv",       60, .5, "home",     1800, (1, 1, 1.5, 2.5, 3.2),   (1, 2, 2.5, 3.5, 5)),
    ("read",     55, .4, "home",     1800, (1, 1, 1, .3, .4),       (1, 1.5, 1, .6, 1.2)),
    ("personal", 75, .4, "home",     1800, (.9, .4, .4, 3.4, 3.6),  (.9, 1.8, 1.8, 3.3, 3.3)),
    ("chores",  110, .4, "home",     1230, (.3, .1, .1, .6, .3),    (.3, .5, .4, .4, .15)),
    ("exercise", 45, .3, "home/out", 1260, (.12, .03, .04, .1, 0),   (.2, .2, .12, .12, 0)),
    ("errands",  80, .5, "out",      1110, (0, .12, .3, 1.5, 0),    (0, .9, .8, .2, 0)),
    ("social",  130, .4, "out",      1320, (0, .05, .15, .4, .15),  (0, .5, 1.2, 1.4, .5)),
    ("walk",     45, .3, "here",     1290, (.2, .1, .04, .15, .05), (.4, .8, .6, .6, .1)),
)
BAND = [4] * 5 + [0] * 4 + [1] * 3 + [2] * 5 + [3] * 3 + [4] * 4     # hour -> weight column
MOVE_NEEDS = 90         # minutes left at the far end of a trip (its leg back already allowed for): the leg there and an hour to do something
LONGEST = 180           # no free segment over 3 h (tv, personal, chores, errands and social; the rest cap at three medians)
SHORT = ("tv", "read", "personal")   # what fills a 10-29 minute gap at home
EVENING_CHORES = 60     # a chores pick after 19:00 is a tidy, not a cleaning session

INTERRUPTIBLE = {
    "sleep": 0.0, "phone": 0.1, "meeting": 0.1, "appointment": 0.2, "class": 0.2, "wash": 0.3, "work:focused": 0.3,
    "dinner": 0.35, "commute": 0.4, "exercise": 0.4, "gym": 0.4, "volunteer": 0.4, "cook": 0.5, "errands": 0.5,
    "social": 0.5, "club": 0.5, "outing": 0.5, "coffee": 0.5, "shop": 0.5, "meal": 0.6, "snack": 0.6,
    "work:routine": 0.6, "break": 0.8, "chores": 0.7, "dishes": 0.7, "laundry": 0.7, "walk": 0.7, "personal": 0.8, "tv": 0.9, "read": 0.9, "idle": 0.9,
}


def pick_free_activity(p, t, limit, away=None):
    """One weighted pick.  Returns the activity tuple, or None after storing the pick in
    p.planned when it happens somewhere else (the caller commutes there first); `away` is the
    limit as it will be over there.  A gap of 10-29 minutes at home is a short tv/read/personal
    to the limit; shorter, or away from home, it is idle."""
    gap, room = limit - t, (away if away is not None else limit) - t
    short = gap < 30
    if short and (gap < 10 or p.place != "home"):
        return ("idle", p.place, max(t + 5, limit), INTERRUPTIBLE["idle"], frozenset())
    band, weekend, clock = BAND[t % DAY // 60], weekday(t) >= 5, t % DAY + (DAY if t % DAY < 300 else 0)   # 00-05 ends the day before
    last = p.activity if p.activity != "snack" else next((s.activity for s in reversed(p.log) if s.activity not in ("snack", "phone")), "")
    just_in = p.activity == "commute" and p.place == "home"              # nobody walks in and straight back out
    total, cum = 0.0, []
    for name, _, _, place, until, wk, we in ROWS:
        w = (we if weekend else wk)[band]
        if name == "social":
            w *= 0.5 + p.traits.sociability
        trip = place in ("home", "out") and place != p.place
        if name == last or (short and name not in SHORT) or (trip and (room < MOVE_NEEDS or just_in)) \
                or clock >= until or (place == "here" and p.place == "work"):
            w = 0                                                        # never the same thing twice running (a snack between does not count)
        elif name == "exercise" and (p.today.get("exercise") or p.today.get("gym") or t - p.last_meal_at < 60):
            w = 0                                                        # one session a day (0.2 of adults on a given day), an hour after a meal
        elif name == "personal" and p.minutes_today.get("personal", 0) >= 180:
            w = 0                                                        # three hours of grooming, calls and paperwork is a day's worth
        elif p.today.get(name, 0) >= 2:
            w *= 0.5                                                     # a third helping of the same thing today
        total += w
        cum.append(total)
    if total == 0:
        return ("idle", p.place, limit, INTERRUPTIBLE["idle"], frozenset())
    name, median, sigma, place, _, _, _ = ROWS[bisect.bisect(cum, p.rand.random() * total)]
    if short:
        return (name, "home", limit, INTERRUPTIBLE[name], frozenset())
    if place == "home/out":
        place = "out" if p.place == "out" or (room >= MOVE_NEEDS and not just_in and p.rand.random() < 0.5) else "home"
    elif place == "here":
        place = p.place
    longest = min(3 * median, LONGEST, EVENING_CHORES if name == "chores" and clock >= 1140 else LONGEST)
    duration = minutes(p.rand, median, sigma, 5, longest)
    if place != p.place:                                                 # a trip out is worth at least the two legs it takes
        p.planned = (name, place, max(duration, 40) if place == "out" else duration, longest)
        return None
    return (name, place, free_end(t, duration, limit, longest), INTERRUPTIBLE[name], frozenset())


def free_end(t, duration, limit, longest):
    """A free activity that would leave under 30 minutes before the limit runs to it
    instead, unless that would make it longer than `longest` (three medians, at most 3 h)."""
    end = fit_end(t, duration, limit)
    return limit if 0 < limit - end < 30 and limit - t <= longest else end
