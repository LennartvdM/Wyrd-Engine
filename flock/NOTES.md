# flock: decisions the design left open, and where it was changed

Read top to bottom: `clock.py`, `seeds.py`, `people.py`, `commitments.py`,
`sleep_and_meals.py`, `free_time.py`, `world.py`, `agent_api.py`, `report.py`.

## Decisions the spec did not settle

1. **Tonight's bedtime is drawn at wake** (`bed_tonight = bedtime_at + N(0,40)`), the same way
   the spec fixes the alarm and `lunch_cut` ahead of time.  Free time is clamped to end at it, so
   people go to bed at a drawn minute instead of at the first activity boundary after
   `bedtime_at - 30`.  With the spec's window (`-30 .. +90`) and 80-minute activities, bedtime
   drifted to `bedtime + 45` and half the nights started after midnight.  `latest_bed` is gone.
2. **Workplace start minute and seven-day flag are stratified by workplace id** (golden-ratio
   sequence plus 5 % jitter) instead of drawn freely.  400 people give ~11 workplaces, and seed 1
   drew one seven-day workplace out of eleven (weekend work share 0.09, bound 0.22-0.38).
   Stratifying keeps small populations close to the start distribution while every workplace
   still has its own stream.  The member-weighted mix still varies by seed (see below).
3. **Lunch has a time even away from work**: `lunch_at = N(12:20, 28)` drawn at wake, used as a
   soft limit for free activities at home and as the start of the 2-hour lunch window.  The
   spec's plain 11:30-13:30 window spread home lunches evenly and dinner beat lunch as the
   eating peak (check 16a).  At work, `lunch_minute` is clamped to 11:45-13:00 for day shifts
   (6:00 starters no longer lunch at 10:30); shifts starting after 10:00 keep `start + 270`.
4. **Non-workers start from a habitual wake time** (`06:40 + N(0,35)`), and their bedtime is
   `wake + 1440 - sleep_need`.  Starting from a bedtime (spec: `23:00 + N(0,40)`) made the
   population wake sd ~100 (bound 40-95) while sleep-duration sd was under 60.  Workers keep the
   alarm-based bedtime, set 20 minutes later than the spec (`alarm + 1440 - need + 10`) so
   weekday sleep runs a little short and the debt buys the weekend lie-in; day-shift bedtimes are
   capped at 23:35 and the trait clamp is 21:30..01:00 (spec 02:00).  `sleep_need_min` is
   `N(470, 55)` (spec `N(485, 35)`): the mean matches a 23:00 bedtime with a 06:50 wake, the sd
   is what check 2 needs once night-to-night jitter is held down by check 13b.  Friday and
   Saturday nights add a 40-minute lie-in and the bedtime is 25 minutes later (spec 35).
5. **`commitment_start` events exist only for accepted appointments.**  Everything planned a week
   ahead is honoured through `limit` (free time, meals, snacks and work blocks all end at the
   next departure), so a heap entry per planned commitment would only pop stale.  An appointment
   accepted while something else runs pushes one at `start - travel - 5`; if it pops during a
   commute or phone call it tries again in 5 minutes.

## Smaller choices

- Household dinner: the commitment starts at the drawn dinner minute with an end drawn once per
  household (`N(28,10)`); `dinner_call` only rewrites `with_ids` and interruptibility for the
  members already at the table.  A member who ate within 90 minutes drops the commitment; one
  home late but before the end joins for the rest.  The 17:30-21:30 dinner window is not used
  on a day with a household dinner planned.
- Cook is 45 minutes (spec 35) so the household bucket clears 50 min/day for the employed.
- Chores are rare and long (median 110 min, sigma 0.4): check 14 caps participation at 45 %
  while check 8c wants 50+ household minutes, so the people who clean, clean for a while.
- The free-activity table was retuned throughout (`free_time.py`); the spec's weights put 40 %
  of people out of the house at 21:00 and gave 26 segments a day.  `tv` may follow `tv`.
- A pick that happens elsewhere is stored in `p.planned`; the commute goes first and the pick
  runs on arrival unless a meal is due.  Arriving at work early waits (`idle`) instead of going
  home; the spec's `place == work -> commute home` rule shuttled early arrivals home and back.
- The same-place lead is 0 for clamping and 5 for being due: a meeting or dinner starts on the
  minute, but someone who arrives five minutes early just starts.
- Meals: the drawn duration is at least 8 minutes, so only the limit clamp can skip a meal.  A
  snack is also possible inside a work block (long shifts otherwise went 11 h unfed).
- The initial sleep starts at `min(0, bedtime - 1440 + U(-20,60))` so every log starts at 0.
- The nag counter keeps rising through ignored pings (spec wording), so one agent pinging every
  30 minutes gets 8 answers a day and then silence until the count decays.
- Reply latency: only the random part is multiplied by `1 + 0.25 nag` and divided by
  responsiveness; the wait for the end of sleep or a meeting is not.  Mean minutes: sleep 8,
  meeting/appointment 4 (spec 15 and 6: with the `+2` nag for `interruptible < 0.2`, replies
  after meetings had a median of 17 minutes).  A ping that lands during `phone` does not get
  the `+2`, or the 40-pings-in-2-h test answers 4 instead of 8.  A reply deferred to a boundary
  that turns out to be bedtime waits for the wake-up.  A call never splits an activity in its
  first minute (`started_at < t`); otherwise the zero-length piece before the call is never
  logged and the activity looks two minutes late, which broke the "17 once phone splits are
  removed" determinism test.  Heap `version` is checked only on
  `activity_end` and `phone_end`; `reply_due` entries carry the ping id as their owner.
- Predicted sleep windows for `request_slot` run from `bedtime - 60` to `bedtime + need + 75`
  and use `bed_tonight` for the current night; the wider margins cover the per-night draw.
- `next_commitment` treats a commitment with under 5 minutes left as over, so nobody logs a
  4-minute dinner.

## Check definitions

- 6b counts only sleep segments split at exactly midnight; two work blocks meeting at 00:00 on
  a night shift are two blocks, not a split.
- 11b is the median over (workplace, day, shift) groups with at least three lunches at work.
- 13b is the median over persons of their weekday wake sd.
- 20a samples sleeping workers whose sleep is due to end 06:00-08:30 (a morning alarm); short
  sleepers with a 21:30 bedtime are up at 04:30 and answer before 06:00.
- 21a is checked as "latency multiplier non-decreasing" (the spec says non-increasing for both
  functions; more nagging is meant to slow replies down, not speed them up).
- 22b checks the counter against the person's logged sleep.
- Checks 20-22 run on their own 200-person world so pings never touch the population logs.

## Bounds I believe are wrong

- 3b (weekday wake sd 40-95, reference 70 "guess"): with the spec's start distribution (13 % of
  workplaces start at 12:00 or later, 6 % at 06:00) the member-weighted wake sd lands at 80-110
  depending on which workplaces are large.  Seed 1 passes at 80; seeds 2 and 3 sit at 95-109.
- 18a (morning commute peak at least 4x the 11:00 bin) and 18d (working at 11:00, 0.50-0.68)
  move with the same workplace mix: a seed where a big workplace starts at 12:00 fails 18a.
- 14a/8c together (chores participation under 45 % and 50+ household minutes for the employed)
  force 110-minute chores blocks; ATUS housework participation (33 %) is a narrower category
  than the household bucket the minutes come from.
