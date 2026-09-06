"""Bedtime and the alarm, sleep debt, and when a meal or a snack is due."""
from .clock import DAY, day_start, weekday, clamp, fit_end, minutes
from .commitments import travel_min
from .free_time import INTERRUPTIBLE


def bedtime_at(p, t):
    a = day_start(t - 300)              # a night belongs to the day that ends at 05:00
    return a + p.traits.bedtime_minute + (20 if weekday(a) in (4, 5) else 0)   # weekend bedtime delay 26


def sleep_end(p, t):
    """Natural wake (plus 0-10 minutes, and a 5-25 minute lie-in on 30 % of nights), or the
    alarm: prep + 10 before leaving for the first commitment, set 0-10 minutes earlier each
    day, so the morning routine always has room and the wake time still moves a little."""
    r, tr = p.rand, p.traits
    lie_in = 35 if weekday(day_start(t - 300)) in (4, 5) else 0      # Friday and Saturday nights: weekend wake delay 53
    natural = t + tr.sleep_need_min + p.sleep_debt // 2 + lie_in + round(r.gauss(0, 20))
    c = next((c for c in p.commitments if c.start > t + 240), None)
    alarm = c.start - travel_min(p, "home", c.place) - tr.prep_min - 15 if c else natural
    wobble = r.randint(0, 10)
    natural += wobble + (r.randint(5, 25) if r.random() < 0.3 else 0)
    return max(t + 240, min(natural, alarm - wobble))


def wake_up(p, t, household):
    """Called when a sleep segment ends."""
    p.woke_at, p.today, p.minutes_today = t, {}, {}
    p.sleep_debt = clamp(p.sleep_debt + p.traits.sleep_need_min - (t - p.started_at), 0, 180)
    p.lunch_at = household.lunch_at.get(t // DAY, day_start(t) + 740)  # today's lunch when not at work, shared at home
    p.bed_tonight = bedtime_at(p, max(t, day_start(t) + 300)) + round(p.rand.gauss(0, 40))   # tonight, even after a 04:00 wake
    p.wind_down = p.rand.randint(15, 45)                               # minutes at home between coming in and bed
    p.breakfast_min = minutes(p.rand, *MEAL_MINUTES["breakfast"], 60)
    # Today's margin before setting off anywhere: positive leaves early, negative leaves late.
    # Drawn per day, so the same person is not a metronome — without it their arrival at work
    # varied by under 2 minutes across a month, and an agent could predict them exactly.
    p.slack_today = clamp(round(p.rand.gauss(3, 12)), -25, 35)


def meal_day(t):
    """The day a meal belongs to ends at 05:00, so a night shift's dinner after midnight is that shift's."""
    return (t - 300) // DAY


MEAL_MINUTES = {"breakfast": (15, 0.3, 8), "lunch": (22, 0.3, 15), "dinner": (24, 0.3, 15)}   # median, sigma, least, alone; household dinner median 25, at least 20, at plan time


def meal_due(p, t):
    day, gap = meal_day(t), t - p.last_meal_at
    if p.last_meal_day.get("lunch") != day and p.lunch_at - 10 <= t < p.lunch_at + 100 and gap > 140:   # up to 10 min early
        return "lunch"
    if p.last_meal_day.get("dinner") != day and 1050 <= t % DAY < 1290 and gap > 180:   # 17:30-21:30
        if not any(c.activity == "dinner" and c.start // DAY == t // DAY for c in p.commitments):
            return "dinner"                 # no household dinner planned today
    return None


def meal(p, t, name, limit, length=None):
    """A meal at the current place; one that does not fit its least length before the limit
    is not eaten now (later in its window, or skipped)."""
    median, sigma, least = MEAL_MINUTES[name]
    end = fit_end(t, length or minutes(p.rand, median, sigma, least, 60), limit)
    if end - t < least:
        return None
    return ("meal:" + name, p.place, end, INTERRUPTIBLE["meal"], frozenset())


def break_meal(cut):
    """The meal at a work break: lunch, or dinner when the cut falls after 16:00 (afternoon shifts)."""
    return "lunch" if cut % DAY < 960 else "dinner"


def snack_due(p, t, work=None):
    """Five hours since a meal, three since a snack or the work break, an hour and a half since
    waking, an hour or more before bed, and no meal window still to come within the hour after
    it or open and uneaten: the cut at work (else today's lunch minute), the posted household
    dinner (else 17:30-21:30)."""
    if t - p.last_meal_at <= 300 or t - p.last_snack_at <= 180 or t - p.woke_at <= 90 or p.bed_tonight - t <= 60:
        return False
    day, windows, cut = meal_day(t), [], work.lunch_cut if work else 0
    if cut and p.last_meal_day.get(break_meal(cut)) != day:
        windows.append((cut, work.end))
    elif not cut and p.last_meal_day.get("lunch") != day:
        windows.append((p.lunch_at, p.lunch_at + 100))
    if p.last_meal_day.get("dinner") != day:
        posted = next((c for c in p.commitments if c.activity == "dinner" and c.start // DAY == t // DAY), None)
        windows.append((posted.start, posted.end) if posted else (day * DAY + 1050, day * DAY + 1290))
    return all(t < s - 70 or t >= e for s, e in windows)
