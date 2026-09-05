"""Time is an int: minutes since Monday 00:00 of week 1.  Nothing here is modular."""
DAY = 1440
WEEK = 7 * DAY
DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def minute_of_day(t):
    return t % DAY


def weekday(t):
    return (t // DAY) % 7          # 0 = Monday; floor division keeps negative t on Sunday


def day_start(t):
    return t - t % DAY


def day_type(t):
    d = weekday(t)
    return "weekday" if d < 5 else "saturday" if d == 5 else "sunday"


def hm(minute):
    return f"{minute // 60 % 24:02d}:{minute % 60:02d}"


def fmt(t):
    return f"{DAY_NAMES[weekday(t)]} {hm(t)}"


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x
