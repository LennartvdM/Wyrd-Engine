"""The free-activity table and the weighted pick that fills gaps between commitments."""
import bisect
import math

from .clock import weekday
from .sleep_and_meals import fit_end

# name, median min, lognormal sigma, place, weekday weights for 05-09 09-12 12-17 17-20 20-24, weekend weights
ROWS = (
    ("tv",      100, .5, "home",     (1, 1, 1.2, 2.3, 3.8), (1, 2, 2, 3, 5)),
    ("read",     55, .4, "home",     (1, 1, 1, 1, 2),      (1, 2, 1, 1, 3)),
    ("personal", 60, .5, "home",     (4, 4, 3, 4, 5),      (3, 4, 4, 4, 4)),
    ("chores",  110, .4, "home",     (.3, .5, .5, .7, .3), (.3, 1, .6, .5, .2)),
    ("exercise", 45, .3, "home/out", (1, .15, .2, 1, .2),  (1, 1, .5, .5, .3)),
    ("errands",  50, .5, "out",      (0, .15, .2, .3, 0),  (0, 1.2, 1.2, .3, 0)),
    ("social",  100, .4, "out",      (0, .1, .3, .6, .4),  (0, .6, 1.5, 2, 1.5)),
    ("walk",     35, .3, "out",      (.5, .1, .15, .8, .2), (.5, 1, 1, 1, .5)),
)
BAND = [4] * 5 + [0] * 4 + [1] * 3 + [2] * 5 + [3] * 3 + [4] * 4     # hour -> weight column

INTERRUPTIBLE = {
    "sleep": 0.0, "phone": 0.1, "meeting": 0.1, "appointment": 0.2, "wash": 0.3, "work:focused": 0.3,
    "dinner": 0.35, "commute": 0.4, "exercise": 0.4, "gym": 0.4, "cook": 0.5, "errands": 0.5,
    "social": 0.5, "club": 0.5, "outing": 0.5, "meal": 0.6, "snack": 0.6, "work:routine": 0.6,
    "chores": 0.7, "laundry": 0.7, "walk": 0.7, "personal": 0.8, "tv": 0.9, "read": 0.9, "idle": 0.9,
}


def pick_free_activity(p, t, limit):
    """One weighted pick.  Returns the activity tuple, or None after storing the pick in
    p.planned when it happens somewhere else (the caller commutes there first)."""
    gap = limit - t
    if gap < 30:
        return ("idle", p.place, max(t + 5, limit), 0.9, frozenset())
    band, weekend, last = BAND[t % 1440 // 60], weekday(t) >= 5, p.activity
    total, cum = 0.0, []
    for name, _, _, place, wk, we in ROWS:
        w = (we if weekend else wk)[band]
        if name == "social":
            w *= 0.5 + p.traits.sociability
        if (name == last and name != "tv") or (place == "out" and gap < 60):
            w = 0
        total += w
        cum.append(total)
    name, median, sigma, place, _, _ = ROWS[bisect.bisect(cum, p.rand.random() * total)]
    if place == "home/out":
        place = "out" if p.rand.random() < 0.5 else "home"
    duration = round(p.rand.lognormvariate(math.log(median), sigma))
    if place != p.place:
        p.planned = (name, place, duration)
        return None
    return (name, place, fit_end(t, duration, limit), INTERRUPTIBLE[name], frozenset())
