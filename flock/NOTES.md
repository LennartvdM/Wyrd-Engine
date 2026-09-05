# flock: decisions the design left open, and where it was changed

Read top to bottom: `clock.py`, `seeds.py`, `people.py`, `commitments.py`,
`sleep_and_meals.py`, `free_time.py`, `world.py`, `agent_api.py`, `report.py`.

## Decisions the spec did not settle

1. **Tonight's bedtime is drawn at wake** (`bed_tonight = bedtime_at + N(0,40)`), the same way
   the spec fixes the alarm and `lunch_cut` ahead of time.  Free time is clamped to end at it, so
   people go to bed at a drawn minute instead of at the first activity boundary after
   `bedtime_at - 30`.  With the spec's window (`-30 .. +90`) and 80-minute activities, bedtime
   drifted to `bedtime + 45` and half the nights started after midnight.  `latest_bed` is gone.
   **Coming in from out takes a wind-down**: free time away from home ends `wind_down` minutes
   (15-45, drawn at wake) before `bed_tonight - travel`, so an evening out is followed by 15-45
   minutes at home; before, 57 % of nights with an evening social went from the front door
   straight to sleep (11.6 % of all nights), now 1 % (1.7 % of nights: late shifts, and evening
   habits ending after `bed_tonight` less the trip and the wind-down, which the wind-down does not
   cut short: on 400 x 4 seed 1, 132 of 187 follow work, 53 a club, 2 the gym).  At home
   with nothing left before bed, sleep starts up to 10 minutes early; a gap of 10-29 minutes at
   home is a short tv/read/personal to the limit (see free time), so no `idle` stub precedes bed.
   Any commitment at home within two hours after bedtime keeps the person up until it is over
   (before, a member could go to bed at 20:14 and sleep through the household's 21:27 dinner).
   **A commitment at the current place within 60 minutes is waited for** whatever the bedtime
   limit says (`free_until` gives way to `c.start`): a night-shift worker 6 minutes early used to
   be sent home to bed and back (three commutes, work 69 minutes late), and with the wind-down a
   club member 8 minutes early was sent home and back.
2. **Workplaces are stratified by the employed placed so far, never by n.**  Each new workplace
   draws its start bin among the bins still short of their share of the employed placed so far
   (itself included), with probability proportional to the squared shortfall, and holds at most
   that shortfall plus a quarter of the bin's share of the employed placed so far (at least 120,
   or the first workplaces would all be tiny); the floor is 6.  The seven-day flag is set when the
   member-weighted seven-day share so far is under 0.35 (`+/- 0.05` jitter).  400 people give ~23
   workplaces of 6-24.  The earlier golden-ratio walk by workplace id made the same ids seven-day
   in every seed and let one 40-member workplace carry a third of a bin; the earlier allowance
   (a quarter of the share of a constant 240 employed) let a 60-person population be two 08:00
   workplaces and one floored tail workplace, so 18c ran 0.55-0.91 there and 0.60-0.73 at 200.
   The population-only sd of the 07:00-08:30 share over 40 seeds is now 0.026 at 400 (was
   0.027), 0.035 at 200 (was 0.063) and 0.14 at 60 (was 0.175; 36 employed cannot fill twelve
   bins with workplaces of 6+, so 60 x 1 stays a smoke run).  `START_MINUTES` has a 05:30 bin
   and 12:00-18:00 weight (ACS: about 14 % leave before 06:00, 18 % arrive after 10:00).
   **Seven-day workplaces run a roster**: two days off in a row on a four-week cycle
   (`ROSTER`: Sat-Sun, Wed-Thu, Mon-Tue, Thu-Fri, each member starting at a random position), so
   a full weekend comes round every fourth week (25 % of member-weeks, was 2.3 % with five days
   drawn fresh each week) and nobody works both weekend days four weeks running; 5/7 of days
   worked, 3/4 of weekend days, so check 7b sits at 0.27-0.33 (was 0.25-0.32).
3. **Lunch has a time even away from work**, and it is the household's: `plan_household` draws
   a lunch minute per day (`N(12:20, 20)`) that everyone at home uses as a soft limit for free
   activities and as the start of a 100-minute window (gap since the last meal over 150 min).
   The clamp applies only once the lunch will be due: `max(lunch_at, last_meal_at + 151)` when
   that falls inside the window, else not at all (a late riser's reading was cut at 12:25 for a
   lunch that was then refused as too soon after breakfast: 5.2 % of person-days, now 0.9 %, all
   of them people who had no meal since waking and then skipped).  **A boundary within 10 minutes
   of the household lunch starts it** (`meal_due` takes `lunch_at - 10`, the way a commitment at
   home may start 5-10 minutes early), and **a pick planned away from home for home is dropped
   when under 30 minutes are left on arrival** (the short-gap rule applies instead): a planned
   pick used to start through `free_end` and be cut to 5-9 minutes by the lunch, 153
   tv/read/personal segments right after a commute and before lunch on 400 x 4 seed 1, now 1.
   The spec's plain 11:30-13:30
   window spread home lunches evenly and dinner beat lunch as the eating peak (check 16a);
   separate per-person minutes had housemates lunching an hour apart on 29 % of person-days.  At
   work, `lunch_minute` is clamped to 11:45-13:00 for day shifts, `+ N(0,10)`; shifts starting
   after 10:00 keep `start + 270` and **a cut after 16:00 is dinner**.  A meeting that starts
   within 45 minutes after a person's cut (or covers it) moves that cut to the meeting's end at
   plan time, chained through later meetings; at run time a lunch is also not started within 45
   minutes of a meeting at the same place.  Meetings are never drawn to start 11:45-13:00 or
   within 30 minutes before to 45 after the workplace's cut.  **A quarter of workplace lunches
   are eaten out** (`LUNCH_OUT`): at the cut, with two hours of the day left, `work_block` sends
   the person out (20 minutes each way, a 30-60 minute sit, back with 45 minutes of work left);
   it adds 7.2 minutes to employed weekday travel (8d: 58.3-60.9 on 400 x 4 seeds 1-8; 52.9-56.7
   without it, 63.6 at HEAD, see below), and the desk lunch median went 28 to 25 with it (8e).
4. **The alarm leaves room for the routine.**  `sleep_end` sets the alarm at
   `first commitment - travel - prep - 15`, set 0-10 minutes earlier still each day (that is the
   day-to-day wake spread on work days); the 5-25 minute lie-in on 30 % of nights applies to
   natural wakes only.  So wash (`0.6 prep`, at least 10 min) and the breakfast always fit before
   leaving.  **The breakfast length is drawn at wake** (`breakfast_min`, lognormal median 15,
   sigma 0.3, at least 8) and the wash reserves exactly that; the wash absorbs at most 10 minutes
   of slack and anything more is a short pick after breakfast (before, the wash absorbed up to
   30 minutes and the breakfast was clamped to the 15 reserved: 26 % of breakfasts were exactly
   15 minutes, 5.8 % of washes ran 45-60 minutes; now the commonest length holds 9 % and no wash
   is over 45).  Workers' trait bedtime is `alarm + 1440 - need - 10 + N(0,40)` (sleep about
   equals need), day-shift bedtimes capped at 23:35, trait clamp 21:30..01:00.  **Non-workers go
   to bed at `23:00 + N(0,25)`** (spec `N(0,40)`) and wake when the need is met; their need is
   `N(500, 55)` against the employed `N(470, 55)` (spec `N(485, 35)` for all): non-workers now
   sleep 508 a weekday and 553 at the weekend (were 480/525), all adults 484/532 against the
   reference 526/581.  The 577 the reference implies for the non-employed cannot be had with its
   06:30 wake and 23:00 bedtime: at `N(520, 55)` check 3a (wake median under 07:20) failed on
   seed 3 and 3b reached 96.  **Partners meet halfway**: the second member's bedtime is the mean
   of their own draw and the first member's, `+ N(0,15)`.  Friday and Saturday nights are 20
   minutes later (spec 35) with a 35-minute lie-in: 25/40 put the Saturday first-awake delay
   (check 19) at 90+ once the 05:30 and 06:00 workplaces pulled Tuesday's median earlier.
5. **`commitment_start` events exist only for accepted appointments.**  Everything planned a week
   ahead is honoured through `limit` (free time, meals, snacks and work blocks all end at the
   next departure).  An accepted appointment pushes one at `start - travel - 5` from where the
   person is at delivery; **when it pops it is judged against the appointment from where the
   person is now**, re-pushed if the leave time is later from here, retried in 5 minutes during a
   commute or a call.  (Before, the pop took whatever commitment was due, so one delivered at
   `out` and popping at home 25 minutes early cut a running household dinner to four minutes and
   the dinner branch then dropped it as "just ate".)  An invite the person could not set off for
   within 5 minutes of the call is declined.  **Appointments start on the minute**: `start_lead`
   is 0 for an appointment at the current place (5 for other commitments, 10 for housework at
   home) and a commute towards an appointment arriving under 5 minutes early runs to its start;
   on 400 x 4 seed 1 all 51 accepts in the invite probe start on the slot's minute (28 of 59 were
   2-5 minutes early).  **A commute is never late**: the jitter `U(0.85, 1.15)` is capped at the
   trait plus 5, the departure lead, so 90-minute commutes arrive 0-13 minutes early instead of
   up to 10 late (2 of 4,353 workplace days start 2-3 minutes late, after the four-hour sleep
   floor).  Inside a running commitment (work), the next one takes over at `start - travel - 5`,
   and at the same place on the minute; a household dinner does not: work runs to its end and
   the member joins late.  No boundary lands 1-14 minutes before a meeting.  `fits`, `home_by`
   and the invite verdict all pad by the same `trip_lead` (travel plus 5, nothing at the same
   place), so a habit placed right after a fixed-end commitment is reachable on time (gym used to
   start 1-2 minutes late on 10 of 700).
6. **No `dinner_call` event, and a household of two or more eats together every evening.**
   `plan_household` posts the dinner on every day for households of 2+ (85 % of weekdays and
   70 % of weekend days for a single person, the spec's rates).  Members sit down at the drawn
   minute (or up to 5 minutes early, or late from work) through `join_table`, which adds the
   newcomer to the `with_ids` of everyone already at the table and gives them the table's ids,
   so `with_ids` are symmetric and name only people who overlap; the newcomer eats for the longer
   of the table's end and their own (a member used to be cut short by a housemate's earlier
   alone-dinner).  **A member on a phone call at the table is still at the table**: `join_table`
   and `table_meal` look through the call (`running`) and the newcomer's id goes into the
   `with_ids` the call restores; before, a question to one person emptied a housemate's
   `with_ids` (the README's determinism promise), now a test.  The same function seats a home
   lunch, and anyone at a boundary at home whose housemate is at lunch or dinner (12 minutes left,
   2 h since their own last meal) sits down too.  A member with under 12 minutes of the dinner
   left, or who ate within 90 minutes, drops the commitment and eats alone in the 17:30-21:30
   window.  The cook (lognormal median 55, 30-80 min, next member of the rota home in time) is
   followed by **`dishes`** (median 22, 10-35 min) for the next eater on the rota after the cook,
   or the cook alone; a washer who had no dinner that day skips the dishes (78 of 4,800 were
   done by a member who had missed the meal).
7. **Two weeks are always planned**: `World()` plans weeks 1 and 2, and each Sunday 20:00 plans
   the week after next, so a Sunday slot request sees Monday's work.
8. **One break a day at work** (`break`, 10-15 min, drawn at plan time 2-4 h into a day of 5 h or
   more; a draw within the hour before the lunch cut or two hours after it moves to 2-3 h after
   the cut; taken in `work_block` at the first boundary after it, an hour or more after a meal,
   never within the hour before a pending lunch or within 45 min of a meeting).  Before the
   hour's clearance a `break_at` inside the last block before lunch was deferred and taken the
   minute the meal ended: 770 of 4,117 breaks on 400 x 4 seed 1 (588 after a desk lunch, 182
   after the commute back from a lunch out), now 0 of 3,888.  With it and the wider start mix
   18d sits at 0.56-0.67 (reference 0.58).  Employed weekday work minutes 364-384 (reference
   380; the lunch out took ~8), 7.5-7.6 h on days worked (reference 7.9).  The break is `W` in
   the histogram and counts as a snack for snack spacing.
9. **A walk starts from the front door.**  The `walk` row's place is "here": no trip, logged at
   `out`, the person's place unchanged (`logged_place`).  With the spec's `out` row two thirds of
   walks began with a 20-minute trip.  **Arriving early is a wait, not a walk**: at `out` with
   under 15 minutes before a commitment there (or at work, when going home first is not worth
   it) the person is `idle`, as at work; 15-29 minutes is a walk.  Before, 1,059 walks of 5-9
   minutes (a fifth of all walks) were the same early arrival at the gym or the class; now 28
   of 4,100 walks follow a commute, none under 10 minutes.  Each row has a latest start: chores
   20:30, exercise 21:00, errands 18:30, social 22:00, walk 21:30.  When that leaves nothing to
   pick at `out` the person goes home, unless the next commitment is near and under 90 minutes
   away, when a walk fills the gap (a volunteer used to go home and straight back, arriving
   late).  Exercise happens once a day (`p.today`) and its weights are a third of the earlier
   ones: 27 % of person-days have exercise or gym.  A third helping of the same activity in a
   day has half weight, and "never the same thing twice running" looks past a snack.
10. **Replies wait for the call, not the activity behind it, and never land on the exact
    boundary.**  A reply that cannot split the running activity (sleep, interruptible under 0.3,
    under 8 minutes left, or its first minute) is re-pushed 1-4 minutes after that activity's end,
    the end of a running phone call when it landed on one (`p.resume` keeps it), and judged again.
    **A ping that lands on a call waits for the call**: `reply_latency` uses the call's end
    (`p.resume[3]`), not the activity under it (13 of 30 such pings used to wait 1-2 hours for the
    tv the call had interrupted; now 3-13 minutes).  The random part is at least a minute, so no
    reply is delivered in the minute the ping was sent (10 of 105 were).  The `+2` for pinging
    someone asleep or in a meeting is charged once per agent and activity.

## Smaller choices

- Chores are rare and long (median 110 min, sigma 0.4): check 14 caps participation at 45 %
  while check 8c wants 50+ household minutes, so the people who clean, clean for a while.  **After
  19:00 a chores pick is a tidy** (`EVENING_CHORES`, at most 60 minutes) and none starts after
  20:30: 4 % of person-days had a 2-3 hour cleaning session after dinner and 3 % one running past
  22:30, now 0.05 % and 0.01 %.  That took 8 minutes off the employed weekday household bucket.
  **8c counts the `dishes`** (an activity the design's bucket list, chores/cook/laundry/errands,
  predates; the reference's household activities include food preparation and cleanup), and they
  are 8.5-8.9 of its minutes: 8c is 57.0-62.5 on 400 x 4 seeds 1-8 with them and 50.4-54.0 on
  seeds 1-5 by the design's four names, i.e. on the bound (chores 24-27, cook 16-18, errands 9-10,
  weekday laundry 0; reference 75, bound 50; chores participation 14a 0.36-0.39 against the 0.33
  reference).  The bucket is short of what
  the reference counts and the model lacks (household management, pets, garden, cooking outside
  the one dinner cook), and the participation check leaves no room to buy those minutes with
  more chores; those minutes sit in `personal`, which is why personal/other runs ~20 % over.
- The free-activity table was retuned throughout (`free_time.py`).  Medians: tv 60, read 55,
  personal 75, chores 110, exercise 45, errands 80, social 130, walk 45; every draw is a
  lognormal **resampled below its cap** (three medians, at most 3 h): the cap used to be a clamp,
  and 7.8 % of socials and 5.6 % of chores were exactly 180 minutes; now 0.2 %.  A pick that
  would leave under 30 minutes before the limit runs to the limit (unless that breaks the cap).
  **A gap of 10-29 minutes at home is a short tv, read or personal to the limit** (`SHORT`),
  weighted by the band, never the activity just finished; under 10 minutes, or away from home, it
  is `idle`.  Before, every gap under 30 was `idle`: 11.4 % of person-days had a 10-29 minute
  stand after walking in the door or after lunch before leaving, now none.  What is left is a 5-9
  minute `idle` at home on 5.9 % of person-days (670 on 400 x 4 seed 1): before the household
  dinner, which may start 5 minutes early, so a boundary 6-9 minutes before it waits, or before
  leaving for a commitment.  **A trip is judged by
  the far end**: `pick_free_activity` gets the limit as it will be over there (`away`, from
  `free_until`: the leave time for the next commitment from that place, or bed less the trip
  home and the wind-down) and a trip needs 90 minutes of that (`MOVE_NEEDS`: the leg there and an
  hour to do something; the leg back is already inside `away`).  With the gap measured from home,
  the wind-down made people arrive out and turn straight round (57 double commutes on seed 1).
  **Nobody walks in and straight back out**: a pick right after a commute home has no trip rows,
  and a pick planned at work for home is dropped on arrival when under 30 minutes are left (the
  short-gap rule takes over, item 3).
  A planned trip out lasts at least its two legs (40 min); a trip home from work does not (a
  chores pick made at work with a 90-minute commute used to become a 180-minute block at 21:34).
  Someone leaving work picks first and goes straight to where the pick happens, or straight to
  an `out` commitment when there is no time at home before it (judged on the commitment's start
  and the two legs; it used to be judged on the bedtime limit, so a 23:30 finisher was routed
  `out` for tomorrow's gym and walked for 17 minutes).
  Daytime weight sits on tv/read/errands with some personal; `personal` (the reference's "other"
  and "caring" buckets, ~55 + 30 min) carries most of its weight in the evening.  Weekend social
  and walk weights were cut and tv raised.  The weekday errands weight in the 17-20 band is 1.5;
  the latest start stays 18:30 (19:00 moved the evening commute peak to 18:45 on seed 3).
- **Employed weekday travel (8d) is 58.3-60.9 on 400 x 4 seeds 1-8** (reference 78, bound 55;
  before the lunch out it was 52.9-56.7 and failed on three of eight seeds).  Per employed
  weekday on seed 1: home-work 20.0 + 19.0, home-out 6.0 + 6.8, work-out 3.8 + 3.4.  **HEAD had
  63.6-63.7 on seeds 1-2**, 4-5 more: against it the round removed ~10 minutes of trips (walks
  that began with a 20-minute trip and their way back, 2.9 each way, item 9; morning exercise
  trips cut with the exercise weights, ~1.7 each way; shuttles and double commutes, an arrival
  5-9 minutes early sent home and back or a commute straight into a commute, ~2) and added ~9
  (the lunch out 7.2, the 20-minute out trip).  The reference's other
  ~20 minutes are caring, school runs and eating-out trips the model does not have.  The
  model's at-home share of days worked is 4-7 % against the reference's 33 % (`home_days` is 1-2
  days for 20 % of the employed); raising it would take ~10 minutes off 8d, so it stays until
  more trips out exist to pay for it.
- Travel to or from `out` is 20 minutes (spec 15; the NHTS average trip, a figure outside
  `atus_reference.json`); home-work is the trait.  A commute takes `travel x U(0.85, 1.15)`, at
  most the trait plus 5, and the departure lead is the trait plus 5 (design 5.1), so arrivals
  scatter: on 400 x 4 seeds 1-3, 53 % of work arrivals are 5-9 minutes early and wait (`idle` at
  work; the spec's `place == work -> commute home` rule shuttled them home and back), 42-43 %
  are 0-4 minutes early and start on arrival (the 5-minute same-place lead), 4-5 % are 10 or
  more minutes early, 0 % late.
- Work blocks: a remainder under 15 minutes joins the block; the block before the next
  commitment ends exactly at the leave time.  A snack inside a work block is possible.
- Meals are lognormal, resampled above a least length (`clock.minutes`): breakfast median 15 (at
  least 8), lunch 25 and dinner alone 24 (at least 15), lunch out 35 (at least 30), household
  dinner 28 (at least 20) at plan time, snacks `U(8,15)`; a meal that does not fit its least
  length is not marked as eaten, so lunch is taken later in its window or honestly skipped.  The
  earlier `max(least, N(mu, sd))` floors put 10 % of breakfasts on exactly 8 minutes and 18 % of
  household dinners on exactly 20; now 2 % and 4 %.  Meal days are keyed to the day that ends at
  05:00 (`meal_day`), so an evening shift's dinner after midnight belongs to that shift (it used
  to count as the next day's and cancel it).
- Snacks (`snack_due`): 5 h since a meal, 3 h since a snack or the work break, 90 minutes since
  waking, an hour or more before bed, and never within 70 minutes before a meal window opens or
  while one is open and uneaten.  About 0.4 a person-day; snacks between 23:00 and 05:00 fell
  from 4.6 % to 2.2 % of person-days (late shifts).
- Habits: gym 17:15, club at 19:00/19:30/20:00 per person, laundry at the weekend at a minute
  drawn per person on the quarter hour 09:00-16:00.  A non-worker also draws 1-3 of class
  (10:00 or 14:00, 2 h), coffee (10:30, 90 min), volunteer (09:00 or 13:00, 3 h) and shop (10:00
  or 15:00, 90 min), each on one weekday, placed like gym/club.  Habit lengths vary `U(0.8, 1.2)`
  week to week.  Housework at home (cook, dishes, laundry) may start up to 10 minutes early when
  a boundary lands that close (`start_lead`); dinner and the rest 5.
- The initial sleep starts at `min(0, bedtime - 1440 + U(-20,60))` so every log starts at 0.
- The nag counter keeps rising through ignored pings (spec wording) and decays one per whole
  6 h since the agent's last ping, so an agent whose pings come under 6 h apart gets exactly 8
  answers and then silence (the 9th ping has nag 9; a ping that lands on sleep or a meeting
  counts 3, judged on the activity a phone call interrupted, never on the call itself, and only
  once per such activity).
- Reply latency: only the random part is multiplied by `1 + 0.25 nag` and divided by
  responsiveness; the wait for the end of sleep, a meeting or a call is not.  After sleep the
  wait is the wash (`0.6 prep`), not the whole prep (spec: prep).  Mean minutes: sleep 8,
  meeting/appointment/class 4 (spec 15 and 6; with 15, 20a is 0.933 on seed 2).  A reply
  deferred to a boundary that turns out to be bedtime waits for the wake-up.  A call never
  splits an activity in its first minute (`started_at < t`).  Heap `version` is checked only on
  `activity_end` and `phone_end`; `reply_due` entries carry the ping id as their owner.  A call
  taken on a commute is logged in transit.
- Sleep windows for `request_slot`, `observe` and the invite verdict: the night being slept
  runs from when the person went to bed to the expected wake plus prep plus 30 minutes; a night
  already slept is over; tonight starts at `bed_tonight` exactly, later nights an hour before the
  trait bedtime; the wake side carries `need + 90 + debt // 2 + 35 on Fri/Sat` (was 75).  One
  counter in ~500 still overlaps the sleep the person later logs (the `N(0,40)` bedtime draw of a
  later night plus a lie-in); covering that would push every morning counter an hour later.
- `free_windows` returns gaps inside `[t, t + horizon)` only (it used to run past the horizon
  with no nights removed), and a gap open now while the person is away ends when they must leave
  where they are: the next commitment's start less the trip from there, or bed less the trip home
  and the wind-down (30 of 1,400 open-now windows used to promise time the person spent on the
  way to a cook at home).  `Observation.next_free_window.place` is where the person will be:
  their current place when the window is open now, else `home`.
- `request_slot` offers start at least 30 minutes ahead, padded by the trip there and back plus
  5 minutes (from the person's current place for a window open now, else from home); a duration
  that is not an `int` of at least a minute (`bool` included), an inverted window, a window
  already over or an unknown place raise `ValueError`.  Offers and counters are not held.  A
  counter is the first offer not overlapping the refused slot.
- Invite verdict: any commitment the person does not own is firm (work, meetings, everything the
  household posts, other appointments), travel included on both sides; over the person's own
  habits (owner `self`) the usual sociability draw applies and an accept removes the habits it
  overlaps.
- Person ids are 1-based in `observe`, `ping`, `request_slot`, `Reply.person`,
  `Observation.with_ids`, `--person` and the printed header; `World.person(17)` is the 17th person
  and `world.people[16]` inside.  Ids outside `1..n`, a time other than `world.now`, a
  `run_until` into the past, an unknown ping kind and a malformed invite slot raise `ValueError`
  at the call; `checks --people 0` or `--weeks 0` is an argparse error.  `Reply.agent_id` names
  the agent.
- `demo-swarm`: three agents (scout observes, asker questions, booker invites) over people 1-12,
  three rounds Tue 09:00, Tue 19:00, Wed 09:00; one line per observation and reply.  A smoke test.
- `next_commitment` treats a commitment with under 5 minutes left as over, so nobody logs a
  4-minute dinner.
- Known leftovers: a free `errands` pick can run straight into a household `errands` block (a
  handful in 5,600 person-days); non-worker days are still 19 awake segments with 9 of them
  tv/read/personal (the three home labels and "never the same thing twice" shuffle rather than
  settle; longer medians would push 13a, at 20.6-20.9 of 22, and tv is already over the weekday
  reference); partners at home in the evening do the same thing side by side on 79 % of couple
  evenings with no `with_ids` (only the table joins people, see README); a non-worker married to
  an early-shift worker still turns in around 22:00; on 9 % of person-days someone lunches at
  home while a housemate is home, awake and not eating; a person put to bed by the four-hour
  sleep floor after a 01:00 bedtime leaves for a 05:40 shift late; 9 % of person-days have no
  lunch (short shifts without a cut, weekend outings over noon); a late shift or an evening habit
  ending after `bed_tonight` less the trip and the wind-down still goes from the commute straight
  to sleep (1.7 % of nights, a third of them clubs); 1.8 % of
  person-days wait 10+ minutes at work (arrivals 10-13 minutes early on long commutes).

## Check definitions

- 6b counts only sleep segments split at exactly midnight; two work blocks meeting at 00:00 on
  a night shift are two blocks, not a split.
- 8b, 8c and 8f count `gym` as leisure (the reference's leisure and sports bucket) and `dishes`
  as household; 8c's bucket includes `errands` (the reference's shopping, 20 min, is not in its
  75), so like for like the model's household minutes are ~50 against 75.
- 11b is the median over (workplace, day, shift) groups with at least three lunches at work.
- 13b is the median over persons of their weekday wake sd.
- 16a orders two peaks the reference calls equal ("about 3 in 10" at noon and at 18:00); at
  400 x 4 lunch wins on seeds 1-8, at 200 x 2 and 60 people the dinner peak is a few household
  minutes drawn once and the order is a coin toss (200 x 2 seed 5 and 60 x 1 seed 9 fail it).
  A definition question, not a mechanism; nothing is tuned to make lunch win.
- 18a compares all commuting (trips out included) in the 11:00 bin with the morning peak; the
  reference has no time-of-day travel figure and the bound is the design's guess, over a
  denominator of 90-110 person-minutes a weekday (6-7 of 400 people in transit).  The 11:00 bin
  is non-workers back from a morning errand or leaving for one before a 12:30+ lunch, the 12:00
  workplaces' commutes (44 of seed 3's ~110: it has 15 members there against the 0.05 share)
  and the earliest lunches out.  The morning peak quarter-hour holds 9-10 % of the day's
  commuters (the ACS-shaped start table, 0.57 leaving 06:00-08:29), 350-450 person-minutes a
  weekday, so the ratio sits at 3.3-6.8 on 400 x 4 seeds 1-8 and **fails on seed 3 (3.28; 3.21
  at HEAD)**; at 1,000 x 4 seed 1 it is 3.985 and fails: with the reference's start shares its
  expectation is about 4.  **HEAD had 7.1 on seed 2 and 6.1 at 1,000 x 4**: its peak bin (627 on
  seed 2, 647 on seed 1) held 512 person-minutes of home-work commutes stacked by the old
  allocation (65 of 240 employed in the 08:00 bin on seed 2, one 40-member workplace on seed 1)
  plus 135 of walks that began with a trip, morning exercise trips and their way back, which
  this round removed (item 9) or cut (the exercise participation); the same bin here is 444
  home-work + 9 other.  Seed 2 passes again (4.52) only because the break and lunch changes
  reshuffled its draws; last round it was 3.88 and the mechanism is unchanged.  A start table
  with 0.04 more in 07:30-08:30 (08:00 at the design's 0.22, 12:00 down to 0.02) gives 4.8-8.2
  on seeds 1-5 but puts 18c at 0.69 on seed 4 (bound 0.68) and 18d at 0.65-0.67: the three
  checks share the table and 18c/18d already sit above their references, so it stays.  I think
  the 4x is wrong for a population whose non-workers move about in the late morning; left
  failing rather than tuned.
- 20a samples sleeping workers whose sleep is due to end 06:00-08:30 (a morning alarm).
- 20b and 20c ping up to 100 people each from separate pools.
- 18d counts `work` and `meeting` as working; a `break` at work is not.
- 21a is checked as "latency multiplier non-decreasing" (the spec says non-increasing for both
  functions; more nagging is meant to slow replies down, not speed them up).
- 22a/22b invite the first 40 non-workers awake at home who have a free slot in the next day;
  22b checks the counter against the person's logged sleep.
- Checks 20-22 run on their own 200-person world so pings never touch the population logs.

## Robustness across seeds (400 x 4 seeds 1-8; 200 x 2 seeds 1-4; 60 x 1 seeds 1-3)

- 400 x 4: seeds 1, 2, 4, 5, 6, 7 and 8 pass all 52; seed 3 fails 18a (3.28), see above.
  Across the eight: 8d 58.3-60.9 (bound 55), 8c 57.0-62.5 (bound 50), 18c 0.56-0.63 (reference
  0.57), 18d 0.56-0.67 (0.58), 7b 0.27-0.33 (0.30), 3b 85-95 (bound 95, seed 3 at 94.6), 3a
  414-429 (bound 440), 1a 7.98-8.23 h, 8f 372-383 (bound 420), 13a 20.6-20.9 (bound 22), 14a
  0.36-0.39 (bound 0.45), 14b 0.50-0.53 (bound 0.55).  1,000 x 4 seed 1 fails 18a (3.985) and
  runs in 17 s.
- 200 x 2: seeds 1-4 pass (seed 4 failed 18c and 18d before the workplace cap change).
- 60 x 1: seed 1 fails 7a (0.73), 7b (0.43), 8a (323), 8b (272), 8d (55.0), 16b (0.40) and
  18c (0.70); seed 2 fails 1b (25.5); seed 3 fails 1b (19.5) and 7b (0.382).  60 people give
  3-4 workplaces, 36 employed and 35 weekend nights: the seven-day share, the roster, the start
  mix, the lie-in and the housework share are one or two draws (the break's plan-time move
  re-rolled every work-day draw, which is why seed 1's failures changed).  Sampling; the
  calibration surface is 400 x 4.
- 3b (weekday wake sd 40-95, reference 70 "guess") is the one bound I still think is wrong for
  this start distribution (15 % of workplaces start at 12:00 or later, 8 % at 06:00 or
  earlier): the member-weighted wake sd lands at 84-95, and seed 3's population sits at 92-95
  whatever the non-workers' need (92.4 at `N(470)`, 94.6 at `N(500)`).  The reference's 70
  describes a population whose late starters it does not count.  It passes on all 400 x 4 runs
  but has no room.
- 1b (weekend nights 30+ minutes longer) sits at 33-42 against the reference's +66: the
  reference's own timing deltas (wake +53..75, bedtime +26) imply +27..+49, and its 558-492
  includes weekend naps the model does not have.  The 60 x 1 failures (19-26) are the same mean
  under 35-night noise.
- Employed sleep runs 4-7 % under the reference on both day types (weekday 467-474 against 492,
  weekend 518-522 against 558): inside the reference's own uncertainty, left as is; non-workers
  are at 508/553 (see item 4).
- Employed weekday eating (8e) is 71-73 against the 58 reference (bound 80): the lunch out is a
  30-60 minute sit, and the desk lunch median was lowered from 28 to 25 when it came in (a
  tuning worth ~1 minute of 8e, not a skip); trimming the desk lunch further would only move it
  back to 70.
