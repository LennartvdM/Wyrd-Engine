"""Reading the logs: one person's day, the population histogram, the realism checks,
a small swarm demo, and the command line."""
import argparse
import statistics
from collections import defaultdict

from .clock import DAY, WEEK, DAY_NAMES, hm, fmt, weekday
from .commitments import work_on
from .agent_api import latency_multiplier, accept_probability
from .world import World

INF = float("inf")
FREE = {"tv", "read", "personal", "chores", "exercise", "errands", "social", "walk", "idle"}
LEISURE = {"tv", "read", "social", "walk", "exercise", "idle", "outing", "club", "gym"}
HOUSEHOLD = {"chores", "cook", "laundry", "errands"}


def kind_of(activity):
    return activity.partition(":")[0]


def print_day(world, person, day):
    d = DAY_NAMES.index(day[:3].capitalize())
    print(f"{DAY_NAMES[d]}  person {person}")
    for s in world.segments(world.people[person]):
        if s.end > d * DAY and s.start < (d + 1) * DAY:
            kind, _, label = s.activity.partition(":")
            print(f" {hm(s.start)}-{hm(s.end)}  {kind:9} {s.place:8} {label}".rstrip())


def letter_of(activity, place):
    kind = kind_of(activity)
    if kind == "sleep":
        return "S"
    if kind in ("work", "meeting"):
        return "W"
    if kind == "commute":
        return "C"
    if kind in ("meal", "snack"):
        return "E"
    if kind in ("chores", "cook", "laundry"):
        return "K"
    return "O" if place == "out" else "H"


def print_histogram(world, day_type):
    days = [d for d in range(world.now // DAY) if {"weekday": d % 7 < 5, "saturday": d % 7 == 5, "sunday": d % 7 == 6}[day_type]]
    minutes = [defaultdict(int) for _ in range(24)]
    for p in world.people:
        for s in world.segments(p):
            letter = letter_of(s.activity, s.place)
            for d in days:
                lo, hi = max(s.start, d * DAY), min(s.end, (d + 1) * DAY)
                if lo >= hi:
                    continue
                for h in range(lo % DAY // 60, (hi - 1) % DAY // 60 + 1):
                    minutes[h][letter] += min(hi, d * DAY + 60 * h + 60) - max(lo, d * DAY + 60 * h)
    print(f"{day_type}: one letter per 2 % of person-minutes; S sleep W work C commute E eat K chores O out H home")
    for h in range(24):
        total = sum(minutes[h].values()) or 1
        print(f"{h:02d}  " + "".join(k * round(50 * minutes[h][k] / total) for k in "SHEKCWO"))


def median(xs):
    return statistics.median(xs) if xs else INF


def sd(xs):
    return statistics.pstdev(xs) if len(xs) > 1 else 0.0


def days_covering(s, e, minute, ndays):
    """Day indices d for which d*DAY + minute lies inside [s, e)."""
    return range(max(0, -(-(s - minute) // DAY)), min(ndays, (e - 1 - minute) // DAY + 1))


def run_checks(seed, n, weeks):
    world = World(seed, n)
    ndays, T = weeks * 7, weeks * WEEK
    world.run_until(T)
    employed = {p.id for p in world.people if p.workplace_id is not None}
    wd = [d for d in range(ndays) if d % 7 < 5]
    we = [d for d in range(ndays) if d % 7 >= 5]
    n_wd, n_we = len(wd) * n, len(we) * n

    sleeps, bedtimes, wakes, person_wakes, crossing, split = [], [], defaultdict(list), defaultdict(list), 0, 0
    per_day = defaultdict(lambda: defaultdict(int))     # (pid, day) -> kind -> minutes
    segs_per_day, free_seq, meals_per_day, bad_gap = defaultdict(int), defaultdict(list), defaultdict(int), set()
    home_evening = 0
    eat_bins, commute_bins = [0] * 96, [0] * 96
    eating_at = defaultdict(int)                          # minute -> person-days eating (weekdays)
    asleep_3, awake_18, asleep_14 = 0, 0, 0
    leave, working_11, first_awake = [], 0, defaultdict(list)
    dinners_home = defaultdict(list)                      # (pid, day) -> home dinner (s, e)
    meeting_segs, lunch_starts = defaultdict(list), defaultdict(list)
    contiguous, short = True, 0
    for p in world.people:
        log = world.segments(p)
        contiguous &= log[0].start == 0 and log[-1].end == T and all(a.end == b.start for a, b in zip(log, log[1:]))
        awake_gap = 0
        for i, s in enumerate(log):
            kind, _, label = s.activity.partition(":")
            length = s.end - s.start
            if length < 5 and kind not in ("commute", "snack", "phone") and s.end < T:   # the tail is cut at T
                short += 1
            if i and kind == "sleep" and s.start % DAY == 0 and log[i - 1].activity == s.activity:
                split += 1
            day = s.start // DAY
            if kind == "sleep":
                if s.start > 0 and s.end < T:
                    a = (s.start - 300) // DAY
                    sleeps.append((a % 7, length))
                    bedtimes.append((a % 7, s.start - a * DAY))
                    wakes[s.end // DAY % 7].append(s.end % DAY)
                    if s.end // DAY % 7 < 5:
                        person_wakes[p.id].append(s.end % DAY)
                    crossing += s.start // DAY != (s.end - 1) // DAY
                    first_awake[s.end // DAY % 7].append(s.end % DAY)
                awake_gap = 0
                asleep_3 += len(days_covering(s.start, s.end, 180, ndays))
                asleep_14 += sum(d % 7 < 5 for d in days_covering(s.start, s.end, 840, ndays))
            else:
                awake_18 += len(days_covering(s.start, s.end, 1080, ndays))
            for d in range(day, min((s.end - 1) // DAY, ndays - 1) + 1):        # minutes split at midnight
                lo, hi = max(s.start, d * DAY), min(s.end, (d + 1) * DAY)
                per_day[p.id, d][kind] += hi - lo
                if d % 7 < 5:
                    if s.place == "home":
                        home_evening += max(0, min(hi, d * DAY + 1320) - max(lo, d * DAY + 1200))
                    if kind in ("meal", "snack", "commute"):
                        bins = eat_bins if kind != "commute" else commute_bins
                        for b in range(lo % DAY // 15, (hi - 1) % DAY // 15 + 1):
                            bins[b] += min(hi, d * DAY + 15 * b + 15) - max(lo, d * DAY + 15 * b)
            segs_per_day[p.id, day] += 1
            if kind in ("meal", "snack"):
                awake_gap = 0
                for m in (630, 750):
                    eating_at[m] += sum(d % 7 < 5 for d in days_covering(s.start, s.end, m, ndays))
            elif kind != "sleep":
                awake_gap += length
                if awake_gap > 480:
                    bad_gap.add((p.id, day))
            if kind == "meal":
                meals_per_day[p.id, day] += 1
                if label == "dinner" and s.place == "home":
                    dinners_home[p.id, day].append((s.start, s.end))
                if label == "lunch" and s.place == "work":       # per workplace, day and shift
                    lunch_starts[p.workplace_id, day, p.traits.afternoon_shift].append(s.start % DAY)
            if kind in FREE:
                free_seq[p.id, day].append(kind)
            if kind == "meeting":
                meeting_segs[p.id].append((s.start, s.end))
            if kind == "commute" and i and i + 1 < len(log) and log[i - 1].place == "home" and log[i + 1].place == "work" and day % 7 < 5:
                if not leave or leave[-1][0] != (p.id, day):
                    leave.append(((p.id, day), s.start % DAY))
            if kind in ("work", "meeting") and p.id in employed:
                working_11 += sum(d % 7 < 5 for d in days_covering(s.start, s.end, 660, ndays))

    weeknight = [m for a, m in sleeps if a in (0, 1, 2, 3, 6)]
    weekend_night = [m for a, m in sleeps if a in (4, 5)]
    wd_wake = [m for d in range(5) for m in wakes[d]]
    we_wake = [m for d in (5, 6) for m in wakes[d]]
    bed_wd = [m for a, m in bedtimes if a not in (4, 5)]
    bed_we = [m for a, m in bedtimes if a in (4, 5)]
    emp_days = [(pid, d) for pid in employed for d in range(ndays)]
    work_min = {k: per_day[k]["work"] + per_day[k]["meeting"] for k in emp_days}
    worked_wd = [work_min[pid, d] for pid, d in emp_days if d % 7 < 5]
    worked_we = [work_min[pid, d] for pid, d in emp_days if d % 7 >= 5]
    emp_wd = [per_day[pid, d] for pid, d in emp_days if d % 7 < 5]
    emp_we = [per_day[pid, d] for pid, d in emp_days if d % 7 >= 5]

    def mean_minutes(rows, kinds):
        return sum(sum(r[k] for k in kinds) for r in rows) / len(rows)

    dinner_days = [(h, t) for h in world.households if len(h.members) >= 2 for t in h.dinners if t < T]
    together = 0
    for h, t in dinner_days:
        eaten = [seg for pid in h.members for seg in dinners_home[pid, t // DAY] if abs(seg[0] - t) <= 90]
        together += any(min(a[1], b[1]) - max(a[0], b[0]) >= 15 for i, a in enumerate(eaten) for b in eaten[i + 1:])
    meetings = [(s, e, pid) for w in world.workplaces for s, e, ids in w.meetings if e <= T for pid in ids]
    attended = sum(any(a <= s and e <= b for a, b in meeting_segs[pid]) for s, e, pid in meetings)
    lunch_sds = [sd(v) for v in lunch_starts.values() if len(v) >= 3]
    wake_sd = [sd(v) for v in person_wakes.values() if len(v) >= 3]
    differ = [free_seq[pid, d] != free_seq[pid, d + 1] for pid in range(n) for d in wd if d + 1 in wd]
    chores_wd = sum(per_day[pid, d]["chores"] + per_day[pid, d]["laundry"] > 0 for pid in range(n) for d in wd) / n_wd
    chores_we = sum(per_day[pid, d]["chores"] + per_day[pid, d]["laundry"] > 0 for pid in range(n) for d in we) / n_we
    peak_eat = max(range(96), key=eat_bins.__getitem__)
    morning_peak = max(range(26, 36), key=commute_bins.__getitem__)
    evening_peak = max(range(48, 96), key=commute_bins.__getitem__)
    sat_first, tue_first = median(first_awake[5]), median(first_awake[1])
    agent = agent_checks(seed)

    checks = [
        ("1a weeknight sleep median h", median(weeknight) / 60, 7.6, 8.7),
        ("1b weekend night minus weeknight median min", median(weekend_night) - median(weeknight), 30, INF),
        ("2  sleep duration sd min", sd([m for _, m in sleeps]), 60, 125),
        ("3a weekday wake median min of day", median(wd_wake), 380, 440),
        ("3b weekday wake sd min", sd(wd_wake), 40, 95),
        ("4  weekend wake minus weekday median min", median(we_wake) - median(wd_wake), 40, 90),
        ("5a bedtime median min of day", median(bed_wd), 1350, 1410),
        ("5b Fri/Sat bedtime later by min", median(bed_we) - median(bed_wd), 15, 50),
        ("6a sleep crossing midnight share", crossing / len(sleeps), 0.70, 1),
        ("6b segments split at midnight", split, 0, 0),
        ("7a employed working on weekday share", sum(m > 0 for m in worked_wd) / len(worked_wd), 0.74, 0.86),
        ("7b employed working on weekend day share", sum(m > 0 for m in worked_we) / len(worked_we), 0.22, 0.38),
        ("7c hours on weekdays worked", statistics.mean(m for m in worked_wd if m) / 60, 7.0, 8.5),
        ("7d hours on weekend days worked", statistics.mean(m for m in worked_we if m) / 60, 4.5, 6.5),
        ("8a employed weekday work min", mean_minutes(emp_wd, ("work", "meeting")), 340, 420),
        ("8b employed weekday leisure min", mean_minutes(emp_wd, LEISURE), 170, 260),
        ("8c employed weekday household min", mean_minutes(emp_wd, HOUSEHOLD), 50, 100),
        ("8d employed weekday travel min", mean_minutes(emp_wd, ("commute",)), 55, 95),
        ("8e employed weekday eating min", mean_minutes(emp_wd, ("meal", "snack")), 50, 80),
        ("8f employed weekend leisure min", mean_minutes(emp_we, LEISURE), 270, 420),
        ("9a meals per person-day", sum(meals_per_day.values()) / (n * ndays), 2.3, 3.3),
        ("9b person-days without an 8 h awake gap unfed", 1 - len(bad_gap) / (n * ndays), 0.95, 1),
        ("10 dinner days with 2+ eating together (2+ households)", together / max(1, len(dinner_days)), 0.65, 1),
        ("11a meeting invitees present full span", attended / max(1, len(meetings)), 0.90, 1),
        ("11b within-workplace lunch start sd min (median)", median(lunch_sds), 0, 25),
        ("12a logs contiguous and summing to run length", float(contiguous), 1, 1),
        ("12b segments under 5 min (not commute/snack/phone)", short, 0, 0),
        ("13a segments per weekday", sum(segs_per_day[pid, d] for pid in range(n) for d in wd) / n_wd, 10, 22),
        ("13b within-person weekday wake sd min (median)", median(wake_sd), 10, 45),
        ("13c consecutive weekdays differing in free activity", sum(differ) / len(differ), 0.80, 1),
        ("14a share doing chores/laundry weekday", chores_wd, 0.25, 0.45),
        ("14b share doing chores/laundry weekend", chores_we, 0.35, 0.55),
        ("15 weekday 20-22 person-minutes at home", home_evening / (n_wd * 120), 0.75, 1),
        ("16a weekday eating peak bin (15 min index)", peak_eat, 48, 51),
        ("16b share eating at 12:30 weekdays", eating_at[750] / n_wd, 0.22, 0.38),
        ("16c 12:30 eating share over 10:30 share", eating_at[750] / max(1, eating_at[630]), 4, INF),
        ("17a asleep at 03:00", asleep_3 / (n * ndays), 0.93, 1),
        ("17b awake at 18:00", awake_18 / (n * ndays), 0.96, 1),
        ("17c asleep at 14:00 weekdays", asleep_14 / n_wd, 0, 0.04),
        ("18a morning commute peak over 11:00 bin", commute_bins[morning_peak] / max(1, commute_bins[44]), 4, INF),
        ("18b evening commute peak bin (15 min index)", evening_peak, 62, 73),
        ("18c commuters leaving 06:00-08:29", sum(360 <= m < 510 for _, m in leave) / max(1, len(leave)), 0.50, 0.68),
        ("18d employed working at 11:00 weekdays", working_11 / (len(employed) * len(wd)), 0.50, 0.68),
        ("19 Saturday first-awake minus Tuesday median min", sat_first - tue_first, 40, 90),
    ] + agent
    passed = 0
    for name, value, lo, hi in checks:
        ok = lo <= value <= hi
        passed += ok
        print(f"{'ok  ' if ok else 'FAIL'} {name:52} {value:8.3f}  [{lo}, {hi}]")
    print(f"{passed}/{len(checks)} checks pass")
    return passed, len(checks)


def agent_checks(seed):
    """Checks 20-22 on their own small world, so pings do not touch the population logs."""
    w = World(seed, 200)
    t = DAY + 180                                                     # Tuesday 03:00
    w.run_until(t)
    sleepers = [p.id for p in w.people if p.activity == "sleep" and p.workplace_id is not None
                and work_on(p, 1) and DAY + 360 <= p.ends_at <= DAY + 510][:80]     # due up 06:00-08:30
    for pid in sleepers:
        w.ping(pid, t, "a", "question")
    w.run_until(DAY + 720)
    morning = [DAY + 360 <= r.delivered_at <= DAY + 570 for r in w.replies("a", 0)]
    meeting_end, easy_sent, pinged = {}, {}, set()
    while w.now < 2 * DAY + 1020:                                       # Tue 12:00 .. Wed 17:00
        w.run_until(w.now + 5)
        for p in w.people:
            if p.id in pinged or len(pinged) >= 200:
                continue
            if p.activity == "meeting":
                meeting_end[w.ping(p.id, w.now, "b", "question").ping_id] = p.ends_at
            elif p.interruptible >= 0.8 and w.now % 60 == 0:
                easy_sent[w.ping(p.id, w.now, "c", "question").ping_id] = w.now
            else:
                continue
            pinged.add(p.id)
    t = w.now
    for i in range(40):                                                # 40 pings in 2 h to person 5
        w.run_until(t + 3 * i)
        w.ping(5, w.now, "d", "question")
    invited, sleepy = [], []
    for p in w.people:
        if p.activity != "sleep" and p.place == "home" and p.workplace_id is None and len(invited) < 40:
            slot = w.request_slot(p.id, w.now, 60, (w.now + 120, w.now + DAY))[0]
            invited.append((w.ping(p.id, w.now, "e", "invite", slot).ping_id, slot))
            night = w.now // DAY * DAY + DAY + 180                     # 03:00 next morning
            sleepy.append(w.ping(p.id, w.now, "f", "invite", type(slot)(night, night + 60, "out")).ping_id)
    w.run_until(w.now + 2 * DAY)
    m_delay = [r.delivered_at - meeting_end[r.ping_id] for r in w.replies("b", 0)]
    c_delay = [r.delivered_at - easy_sent[r.ping_id] for r in w.replies("c", 0)]
    accepted = {r.ping_id: r for r in w.replies("e", 0) if r.decision == "accept"}
    kept = [any(s.activity == "appointment" and s.start <= slot.start and s.end >= slot.end for s in w.segments(w.people[w.pings[pid].person]))
            for pid, slot in invited if pid in accepted]
    declined = [r for r in w.replies("f", 0) if r.ping_id in sleepy]
    good_counter = [r.decision == "decline" and r.counter is not None and
                    not any(s.activity == "sleep" and s.start < r.counter.end and r.counter.start < s.end
                            for s in w.segments(w.people[r.person]))
                    for r in declined]
    return [
        ("20a 03:00 question to sleeping worker answered 06:00-09:30", sum(morning) / max(1, len(morning)), 0.95, 1),
        ("20b reply after meeting end, median min", median(m_delay), 0, 10),
        ("20c reply at interruptible >= 0.8, median min", median(c_delay), 0, 9.99),
        ("21a latency multiplier non-decreasing in nag", float(all(latency_multiplier(k) <= latency_multiplier(k + 1) for k in range(10))), 1, 1),
        ("21b accept probability non-increasing in nag", float(all(accept_probability(.8, k) >= accept_probability(.8, k + 1) for k in range(10))), 1, 1),
        ("21c replies to 40 pings in 2 h from one agent", len(w.replies("d", 0)), 8, 8),
        ("22a accepted invites kept as appointment", sum(kept) / max(1, len(kept)) if kept else INF, 1, 1),
        ("22b sleep-time invite declined with counter outside sleep", sum(good_counter) / max(1, len(good_counter)), 1, 1),
    ]


def demo_swarm(world):
    """Three agents look at three people on Tuesday morning, ask a question each, and one
    proposes a meeting; the transcript shows what came back."""
    t = DAY + 540                                                      # Tuesday 09:00
    world.run_until(t)
    for agent, pid in (("scout", 3), ("scout", 17), ("booker", 42)):
        o = world.observe(pid, t)
        print(f"{fmt(t)}  {agent} sees person {pid}: {o.activity} at {o.place} until {hm(o.expected_end)}, "
              f"interruptible {o.interruptible}, next commitment {hm(o.next_commitment_start) if o.next_commitment_start else '-'}")
        world.ping(pid, t, agent, "question")
        if agent == "booker":
            for slot in world.request_slot(pid, t, 45, (t + 60, t + DAY)):
                print(f"           free slot {fmt(slot.start)}-{hm(slot.end)} {slot.place}")
            slot = world.request_slot(pid, t, 45, (t + 60, t + DAY))[0]
            world.ping(pid, t, agent, "invite", slot)
    world.run_until(t + DAY)
    for r in sorted(world.replies("scout", t) + world.replies("booker", t), key=lambda r: r.delivered_at):
        print(f"{fmt(r.delivered_at)}  person {r.person} -> ping {r.ping_id}: {r.decision}"
              + (f", counter {fmt(r.counter.start)}-{hm(r.counter.end)}" if r.counter else ""))


def main():
    ap = argparse.ArgumentParser(prog="python -m flock")
    ap.add_argument("command", choices=("day", "histogram", "checks", "demo-swarm"))
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--people", type=int, default=200)
    ap.add_argument("--weeks", type=int, default=1)
    ap.add_argument("--person", type=int, default=17)
    ap.add_argument("--day", default="tue")
    a = ap.parse_args()
    if a.command == "checks":
        run_checks(a.seed, a.people, a.weeks)
        return
    world = World(a.seed, a.people)
    if a.command == "demo-swarm":
        demo_swarm(world)
        return
    world.run_until(a.weeks * WEEK)
    if a.command == "day":
        print_day(world, a.person, a.day)
    else:
        print_histogram(world, a.day if a.day in ("weekday", "saturday", "sunday") else "weekday")
