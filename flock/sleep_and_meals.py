"""Bedtime and the alarm, sleep debt, and when a meal is due."""
from .clock import DAY, day_start, weekday, clamp
from .commitments import travel_min


def bedtime_at(p, t):
    a = day_start(t - 300)              # a night belongs to the day that ends at 05:00
    return a + p.traits.bedtime_minute + (25 if weekday(a) in (4, 5) else 0)


def wants_sleep(p, t):
    """At home only: tonight's bedtime has come.  Free time is clamped to end there, so
    only a late commitment keeps anyone up past it."""
    return t >= p.bed_tonight


def sleep_end(p, t):
    r, tr = p.rand, p.traits
    lie_in = 40 if weekday(day_start(t - 300)) in (4, 5) else 0      # Friday and Saturday nights
    natural = t + tr.sleep_need_min + p.sleep_debt // 2 + lie_in + round(r.gauss(0, 25))
    c = next((c for c in p.commitments if c.start > t + 240), None)
    alarm = c.start - travel_min(p, "home", c.place) - tr.prep_min - 5 if c else natural
    end = max(t + 240, min(natural, alarm)) + r.randint(0, 10)
    if r.random() < 0.3:                # snooze; spreads a person's wake time from day to day
        end += r.randint(5, 25)
    return end


def wake_up(p, t):
    """Called when a sleep segment ends."""
    p.woke_at = t
    p.sleep_debt = clamp(p.sleep_debt + p.traits.sleep_need_min - (t - p.started_at), 0, 180)
    p.lunch_at = day_start(t) + round(p.rand.gauss(740, 28))     # today's lunch when not at work, 12:20
    p.bed_tonight = bedtime_at(p, max(t, day_start(t) + 300)) + round(p.rand.gauss(0, 40))   # tonight, even after a 04:00 wake


MEAL_MINUTES = {"breakfast": (12, 4), "lunch": (28, 8), "dinner": (22, 8)}   # alone; household dinner N(28,10) at plan time


def meal_due(p, t):
    day, gap = t // DAY, t - p.last_meal_at
    if p.last_meal_day.get("lunch") != day and p.lunch_at <= t < p.lunch_at + 120 and gap > 180:
        return "lunch"
    if p.last_meal_day.get("dinner") != day and 1050 <= t % DAY < 1290 and gap > 180:   # 17:30-21:30
        if not any(c.activity == "dinner" and c.start // DAY == day for c in p.commitments):
            return "dinner"                 # no household dinner planned today
    return None


def meal(p, t, name, limit):
    """A meal at the current place.  Under 8 minutes it is skipped but still counts as had."""
    p.last_meal_day[name] = t // DAY
    mu, sd = MEAL_MINUTES[name]
    end = fit_end(t, max(8, round(p.rand.gauss(mu, sd))), limit)
    if end - t < 8:
        return None
    return ("meal:" + name, p.place, end, 0.6, frozenset())


def fit_end(t, duration, limit):
    """Clamp a duration to [5, limit - t]; a leftover under 5 minutes is swallowed."""
    end = t + clamp(duration, 5, max(5, limit - t))
    return limit if 0 < limit - end < 5 else end
