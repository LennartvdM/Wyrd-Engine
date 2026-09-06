"""Time is an int: minutes since Monday 00:00 of week 1.  Nothing here is modular."""
import math

DAY = 1440
WEEK = 7 * DAY
DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def weekday(t):
    return (t // DAY) % 7          # 0 = Monday; floor division keeps negative t on Sunday


def day_start(t):
    return t - t % DAY


def hm(minute):
    return f"{minute // 60 % 24:02d}:{minute % 60:02d}"


def fmt(t):
    return f"{DAY_NAMES[weekday(t)]} {hm(t)}"


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def fit_end(t, duration, limit):
    """Clamp a duration to [5, limit - t]; a leftover under 5 minutes is swallowed."""
    end = t + clamp(duration, 5, max(5, limit - t))
    return limit if 0 < limit - end < 5 else end


def minutes(r, median, sigma, least, most):
    """A lognormal draw of minutes resampled into [least, most], so nothing piles up on the ends."""
    for _ in range(8):
        x = round(r.lognormvariate(math.log(median), sigma))
        if least <= x <= most:
            return x
    return clamp(x, least, most)
