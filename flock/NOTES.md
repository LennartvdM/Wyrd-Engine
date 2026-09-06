# flock: decisions the design left open, and where it was changed

Read top to bottom: `clock.py`, `seeds.py`, `people.py`, `commitments.py`,
`sleep_and_meals.py`, `free_time.py`, `world.py`, `agent_api.py`, `report.py`.

## Decisions the spec did not settle

1. **Tonight's bedtime is drawn at wake** (`bed_tonight = bedtime_at + N(0,40)`), the same way
   the spec fixes the alarm and `lunch_cut` ahead of time.  Free time is clamped to end at it, so
   people go to bed at a drawn minute instead of at the first activity boundary after
   `bedtime_at - 30`.  With the spec's window (`-30 .. +90`) and long activities, bedtime
   drifted late and many nights started after midnight.  `latest_bed` is gone.
   **Coming in from out takes a wind-down**: free time away from home ends `wind_down` minutes
   (15-45, drawn at wake) before `bed_tonight - travel`, so an evening out is followed by 15-45
   minutes at home; what still goes from the front door straight to sleep is 2.0 % of nights
   (216 of 10,800 on 400 x 4 seed 1, 1.6-2.5 % over seeds 1-8: late shifts, and evening habits
   ending after `bed_tonight` less the trip and the wind-down, which the wind-down does not cut
   short; 115 of the 216 follow work, 65 a club, 36 the gym).  At home
   with nothing left before bed, sleep starts up to 10 minutes early; a gap of 10-29 minutes at
   home is a short tv/read/personal to the limit (see free time), so no `idle` stub precedes bed.
   Any commitment at home within two hours after bedtime keeps the person up until it is over
   (before, a member could go to bed before the household's dinner and sleep through it).
   **A commitment at the current place within 60 minutes is waited for** whatever the bedtime
   limit says (`free_until` gives way to `c.start`): a night-shift worker a few minutes early used
   to be sent home to bed and back, and with the wind-down a club member a few minutes early was
   sent home and back.
2. **Workplaces are stratified by the employed placed so far, never by n.**  Each new workplace
   draws its start bin among the bins still short of their share of the employed placed so far
   (itself included), with probability proportional to the squared shortfall, and holds at most
   that shortfall plus a quarter of the bin's share of the employed placed so far (at least 120,
   or the first workplaces would all be tiny); the floor is 6.  The seven-day flag is set when the
   member-weighted seven-day share so far is under 0.35 (`+/- 0.05` jitter).  400 people give 23-28
   workplaces over 40 seeds (23 on seed 1) of 2-28 members (6-20 on seed 1), the last cut short by
   n.  The earlier golden-ratio walk by workplace id made the same ids seven-day in every seed
   and let one large workplace carry a third of a bin; the earlier allowance (a quarter of the share
   of a constant 240 employed) let a 60-person population be two 08:00 workplaces and one floored
   tail workplace.  The population-only sd of the 07:00-08:30 share of the employed over 40 seeds is
   0.026 at 400, 0.035 at 200 and 0.14 at 60 (30-37 employed cannot fill twelve bins with workplaces
   of 6+, so 60 x 1 stays a smoke run).  `START_MINUTES` has a 05:30 bin
   and 12:00-18:00 weight (the reference has 18.5 % arriving after 10:00).
   **Seven-day workplaces run a roster**: two days off in a row on a four-week cycle
   (`ROSTER`: Sat-Sun, Wed-Thu, Mon-Tue, Thu-Fri, each member starting at a random position), so
   a full weekend comes round every fourth week (25 % of member-weeks) and nobody works both
   weekend days four weeks running; 5/7 of days worked, 3/4 of weekend days, so check 7b sits at
   0.258-0.295 on 400 x 4 seeds 1-8.
3. **Lunch has a time even away from work**, and it is the household's: `plan_household` draws
   a lunch minute per day (`N(12:20, 20)`) that everyone at home uses as a soft limit for free
   activities and as the start of a 100-minute window (gap since the last meal over 140 min).
   The clamp applies only once the lunch will be due: `max(lunch_at, last_meal_at + 141)` when
   that falls inside the window, else not at all (a late riser's reading used to be cut for a
   lunch that was then refused as too soon after breakfast).  **A boundary within 10 minutes
   of the household lunch starts it** (`meal_due` takes `lunch_at - 10`, the way a commitment at
   home may start 5-10 minutes early), and **a pick planned away from home for home is dropped
   when under 30 minutes are left on arrival** (the short-gap rule applies instead): a planned
   pick used to start through `free_end` and be cut to 5-9 minutes by the lunch; no tv, read or
   personal segment under 10 minutes now sits between a commute home and lunch on 400 x 4 seeds
   1-3.  The spec's plain 11:30-13:30 window spread home lunches evenly and dinner beat lunch as
   the eating peak (check 16a); separate per-person minutes had housemates lunching hours apart.  At
   work, `lunch_minute` is clamped to 11:45-13:00 for day shifts, `+ N(0,10)`; shifts starting
   after 10:00 keep `start + 270` and **a cut after 16:00 is dinner**.  A meeting that starts
   within 45 minutes after a person's cut (or covers it) moves that cut to the meeting's end at
   plan time, chained through later meetings; at run time a lunch is also not started within 45
   minutes of a meeting at the same place.  Meetings are never drawn to start 11:45-13:00 or
   within 30 minutes before to 45 after the workplace's cut.  **A seventh of workplace lunches
   are eaten out** (`LUNCH_OUT` 0.15): at the cut, with two and a half hours of the day left,
   `work_block` sends the person out (20 minutes each way, a 25-45 minute sit, back with an hour
   of the day left).  It was a quarter, and the quarter is worth about 2 minutes of employed
   weekday travel: on 400 x 4 seeds 1-3, 8d reads 61.6-63.6 at a quarter against 59.8-61.3 here
   and 8e 67.0-67.6 against 66.6-67.2, with the evening commute peak bin (18b) unmoved at 64-69
   either way.  A seventh is the more honest share of workplace days, and 8d has room for it.
4. **The alarm leaves room for the routine.**  `sleep_end` sets the alarm at `first commitment -
   travel - prep - 15`, set 0-10 minutes earlier still each day (that is the day-to-day wake spread
   on work days); the 5-25 minute lie-in on 30 % of nights applies to natural wakes only.  So wash
   (`0.6 prep`, at least 10 min) and the breakfast always fit before leaving.  **The breakfast
   length is drawn at wake** (`breakfast_min`, lognormal median 15, sigma 0.3, at least 8) and the
   wash reserves exactly that; the wash absorbs at most 10 minutes of slack and anything more is a
   short pick after breakfast (before, the wash absorbed up to 30 minutes and the breakfast was
   clamped to the 15 reserved; now the commonest breakfast length, 14 minutes, holds 9 % and the
   longest of the 11,200 washes on 400 x 4 seed 1 is 45).  Workers' trait bedtime is `alarm + 1440 -
   need + N(0,40)`, so the alarm bites on about half the nights: a weeknight sleep is cut short of
   the need on 48-53 % of employed weeknights (400 x 4 seeds 1-8) and the debt an employed person
   carries runs from 19-30 at the Sunday wake to 50-61 at the Friday wake (seed 1: 19 to 56); an
   employed weeknight is 9.0 minutes short of the need on average (seeds 1-3), paid back through
   `need + debt // 2` on Friday and Saturday nights.  The
   design asked for 15-20 a night.  Shifting the trait bedtime 20 minutes later buys that (54-57 %
   short of the need, debt to 60-68) and all 52 checks still pass on seeds 1-3, but it doubles the
   tail: nights under five hours go from 6 to 12 on seed 1 and 9 to 14 on seed 4, people whose alarm
   is already tight taking both `N(0,40)` draws the wrong way.  Left at the alarm.  Day-shift
   bedtimes capped at 23:59, trait clamp 21:30..01:00.  **Non-workers go to bed at
   `23:00 + N(0,25)`** (spec `N(0,40)`) and wake when the need is met; their need is `N(490, 55)`
   against the employed `N(485, 55)` (spec `N(485, 35)` for all): non-workers sleep 492-507 a
   weekday and 525-540 at the weekend, all adults 481-493 / 525-534 against the reference 526/581
   (400 x 4 seeds 1-8).  The 577 the reference implies for the non-employed cannot be had with its
   06:30 wake and 23:00 bedtime: at `N(520, 55)` check 3a (wake median under 07:20) fails on seeds
   2 and 3 (442 and 445 of 440) and 3b reaches 93.7.  **Partners meet halfway**: the second
   member's bedtime is the mean of their own draw and the first member's, `+ N(0,15)`.  Friday and
   Saturday nights are 20 minutes later (spec 35) with a 35-minute lie-in: at the spec's 35 the
   Saturday first-awake delay (check 19) fails on 400 x 4 seeds 1, 4 and 5 (90.5-96.0 against its
   90 ceiling) and passes seeds 2 and 3 at 86.0 and 88.5.
5. **`commitment_start` events exist only for accepted appointments.**  Everything planned a week
   ahead is honoured through `limit` (free time, meals, snacks and work blocks all end at the next
   departure).  An accepted appointment pushes one at `start - travel - 5` from where the person is
   at delivery; **when it pops it is judged against the appointment from where the person is now**,
   re-pushed if the leave time is later from here, retried on arrival during a commute, and **a call
   over the departure minute is ended there and then** (the person hangs up and sets off): over
   eighteen runs (200 people, seeds 1-3, three times of day, with and without a question every 10
   minutes to everyone alongside the invites) none of the 1,693 accepted appointments begins late.
   (Before, the pop took whatever commitment was due, so one delivered at `out` and popping at home
   early cut a running household dinner short and the dinner branch then dropped it as "just ate".)
   An invite the person could not set off for within 5 minutes of the call is declined.
   **Appointments start on the minute**: `start_lead` is 0 for an appointment at the current place (5
   for other commitments, 10 for housework at home) and a commute towards an appointment arriving
   under 5 minutes early runs to its start; in a probe that invites all 400 people to their own first
   offer at three times of day on seeds 1-3, 1,767 of 1,770 accepts start on the slot's minute and
   the other three 2-4 minutes early.  **A commute is never late**: the jitter `U(0.85, 1.15)` is
   capped at the trait plus 5, the departure lead, so long commutes arrive early instead of up to 10
   minutes late (none of the 4,487 work days on 400 x 4 seed 1 starts late).  Inside a running
   commitment (work), the next one takes over at `start - travel - 5`, and at the same place on the
   minute; a household dinner does not: work runs to its end and the member joins late.  No
   boundary lands 1-14 minutes before a meeting.  `fits`, `home_by` and the invite verdict all pad
   by the same `trip_lead` (travel plus 5, nothing at the same place), so a habit placed right
   after a fixed-end commitment is reachable on time (the gym used to start a minute or two
   late).
6. **No `dinner_call` event, and a household of two or more eats together every evening.**
   `plan_household` posts the dinner on every day for households of 2+ (85 % of weekdays and 70 % of
   weekend days for a single person, the spec's rates).  Members sit down at the drawn minute (or up
   to 5 minutes early, or late from work) through `join_table`, which adds the newcomer to the
   `with_ids` of everyone already at the table and gives them the table's ids, so `with_ids` are
   symmetric and name only people who overlap; the newcomer eats for the longer of the table's end
   and their own (a member used to be cut short by a housemate's earlier alone-dinner), and **their
   own dishes wait until they have eaten**: a latecomer down to wash up used to have the dinner cut
   short, ending exactly when the dishes began; on 400 x 4 seed 1, 234 members sit down after their
   household's dinner minute, a median 27 minutes each with 18 under 20, and none of those 18 ends
   where a dishes block begins.
   **A member on a phone call at the table is still at the table**: `join_table` and `table_meal`
   look through the call (`running`) and the newcomer's id goes into the `with_ids` the call
   restores; before, a question to one person emptied a housemate's `with_ids` (the README's
   determinism promise), now a test.  The same function seats a home lunch, and anyone at a boundary
   at home whose housemate is at lunch or dinner (12 minutes left, 2 h since their own last meal)
   sits down too.  **It seats the lunch inside a weekend outing too** (`join_table` looks for
   members eating where the person is, not only at home): the outing's own `with_ids` used to be
   stamped on that meal, so on 400 x 4 seed 1, 73 lunch segments named a housemate who was not
   eating - members pause for lunch at their own minute (each one's gap since breakfast) and one may
   not pause at all.  Now the meal names only whoever is eating alongside, and no meal segment on
   seeds 1-3 names someone not eating the same meal.  A member with under 12 minutes of the dinner
   left, or who ate within 90 minutes, drops the commitment and eats alone in the 17:30-21:30
   window.  The cook (lognormal median 55,
   30-80 min, next member of the rota home in time) is followed by **`dishes`** (median 22, 10-35
   min) for the next eater on the rota after the cook, or the cook alone; a washer who had no dinner
   that day skips the dishes (78 of the 4,856 dishes blocks posted on 400 x 4 seed 1 are dropped
   that way).
7. **Two weeks are always planned**: `World()` plans weeks 1 and 2, and each Sunday 20:00 plans
   the week after next, so a Sunday slot request sees Monday's work.
8. **One break a day at work** (`break`, 10-15 min, drawn at plan time 2-4 h into a day of 5 h or
   more; a draw within the hour before the lunch cut or two hours after it moves to 2-3 h after
   the cut; taken in `work_block` at the first boundary after it, an hour or more after a meal,
   never within the hour before a pending lunch or within 45 min of a meeting).  Before the
   hour's clearance a `break_at` inside the last block before lunch was deferred and taken the
   minute the meal ended; now none of the 3,884 breaks on 400 x 4 seed 1 does.  With it and the
   wider start mix 18d sits at 0.58-0.66 (reference 0.58).  Employed weekday work minutes 374-389
   (reference 380), 7.57-7.80 h on days worked (reference 7.9).  The break is `W` in
   the histogram and counts as a snack for snack spacing.
9. **A walk starts from the front door.**  The `walk` row's place is "here": no trip, logged at
   `out`, the person's place unchanged (`logged_place`).  With the spec's `out` row a walk began
   with a 20-minute trip.  **Arriving early is a wait, not a walk**: at `out` with under 15 minutes
   before a commitment there (or at work, when going home first is not worth it) the person is
   `idle`, as at work; 15-29 minutes is a walk.  Before, short walks were the same early arrival at
   the gym or the class; now 26 of the 4,379 walks on 400 x 4 seed 1 follow a commute, the shortest
   of those 15 minutes and no walk under 15.  Each row has a latest start: chores 20:30, exercise
   21:00, errands 18:30, social 22:00, walk 21:30.  When that leaves nothing to pick at `out` the
   person goes home, unless the next commitment is near and under 90 minutes away, when a walk fills
   the gap (a volunteer used to go home and straight back, arriving late).  Exercise happens once a
   day (`p.today`), never within an hour of a meal: 20.5-22.3 % of person-days have exercise or gym
   (400 x 4 seeds 1-8).  **A pick waiting at the far end of a trip is judged again on arrival**: an
   exercise planned before the meal that turned out to be due there is dropped and the pick made
   afresh (none of the 1,816 exercise segments on 400 x 4 seed 1 begins the minute a meal ended;
   without the re-pick, 14 of 1,825 do).  A
   third helping of the same activity in a day has half weight, and "never the same thing twice
   running" looks past a snack.
10. **Replies wait for the call, not the activity behind it, and never land on the exact
    boundary.**  A reply that cannot split the running activity (sleep, interruptible under 0.3,
    under 8 minutes left, or its first minute) is re-pushed 1-4 minutes after that activity's end,
    the end of a running phone call when it landed on one (`p.resume` keeps it), and judged again.
    **A ping that lands on a call waits for the call**: `reply_latency` uses the call's end
    (`p.resume[3]`), not the activity under it: such a ping used to wait for the tv the call had
    interrupted.  The random part is at least a minute, so no reply is delivered in the minute the
    ping was sent (none of the 3,600 answers in a probe that questions all 200 people every 10
    minutes for two days on seeds 1-3).  The `+2` for pinging
    someone asleep or in a meeting is charged once per agent and activity.

## Day-to-day variation (added after the metronome finding)

Measured on 400 x 4 seed 1 before this change: each person arrived at work with a standard
deviation of **1.9 minutes** across their own month (p90 4.3).  Their morning absorbed every bit of
variance — the alarm is set back from the commitment, so however late they woke they set off at the
same minute — and the commute was clamped to never run more than 5 minutes over the trait.  A
population like that is a metronome: an agent learns "person 17 arrives 08:03" and is right every
day forever, which defeats the point of testing agents against people.

Two changes:

- `slack_today`, drawn at wake in `sleep_and_meals.wake_up` as `clamp(gauss(3, 12), -25, 35)`: the
  margin the person leaves themselves before setting off anywhere that day.  Positive leaves early,
  negative leaves late.  `world.start_lead` adds it to a trip's lead.
- `world.commute` now draws `travel * gauss(0, 0.12)` and adds a 5-20 minute hold-up on 8 % of
  trips, with no clamp against arriving late.  A journey that always takes the same time is one an
  agent can time perfectly.

After: per-person arrival standard deviation **8.9 minutes** (p90 13.7), 552 distinct arrival
minutes over 4,297 arrivals, no minute holding more than 0.9 % of them.  The morning ramp lost its
spikes: the busiest 5-minute bin fell from 2.5x the mean to 1.9x, and the dead bins (06:20 held
zero arrivals) filled in.  Cost: `18a` now fails on seed 3 (3.78 against its 4) — see Check
definitions; that check rewards a *sharper* commute peak, which is the rigidity being removed, and
its bound is the design's guess with no reference behind it.  Left failing rather than widened.

## The working day varies from day to day (mk3)

Measured on 400 x 4 seed 1 after mk2's departure slack: the *schedule* underneath was still a pure
function of fixed traits.  Per person across their own weekdays, the work day started with a
standard deviation of **5.3 minutes** and lasted within **5.3 minutes** of the same length — person
1 began at 11:58, 11:59, 11:59, 12:00, 12:00, 12:00, 12:00, 12:00, 12:00, 12:01.  Meals and free
time already varied (lunch sd 20.8, bedtime sd 33.1); the skeleton did not.  Nobody was ever called
in early, stayed late, or got away at four.

`plan_work` now draws both per day: the start takes `gauss(0, 8)` on top of the workplace minute and
the person's offset, and the length is multiplied by `clamp(gauss(1.0, 0.10), 0.7, 1.35)` with a 4 %
chance of a half day or a long one.  After: start sd **9.6 min**, length sd **59 min** for a
full-day worker.  The magnitude is chosen to sit near the day-to-day variation a fixed-schedule
worker actually shows, not tuned to a picture.

Also here: adjacent segments with the same activity, place and company merge into one (commutes
excepted, since two in a row are two journeys).  9,300 of 232,485 segments were a stretch of one
thing split in two by the decision loop's bookkeeping — two work blocks back to back, or the pair
of five-minute idles a late departure leaves.  Segments per weekday fell from 21.0 to 20.1.

Cost: `18a` now fails on seeds 2 and 3 (3.77 and 3.44 against its 4).  It divides the morning
commute peak by the 11:00 background, so it scores a *sharper* rush higher — the synchronisation
this change removes.  Its bound is the design's guess with no reference behind it.  Left failing
rather than widened; see Check definitions.

## Smaller choices

- **The full-time work day is `N(535, 25)` minutes** (design section 3: `N(510, 25)`): meals, the
  break and the lunch out come out of it, so what is left lands on the reference.  Check 7c (hours
  on weekdays worked) reads 7.57-7.80 and 8a 374-389 on 400 x 4 seeds 1-8 against the reference's
  7.9 h and 380 minutes; at 510 they read 7.22-7.33 and 358-364 on seeds 1-3.  Both pass.
- **A weekend work day is 0.72 of the person's day length** (design sections 5.3 and 6: 0.65),
  which keeps a weekend day at about three quarters of a weekday: check 7d (hours on weekend days
  worked) reads 5.42-5.72 on 400 x 4 seeds 1-8 against the reference's 5.3 h; at 0.65 it reads
  4.95-4.99 on seeds 1-3.  Both are inside the check's 4.5-6.5.
- **The household's dinner minute is `N(1110, 45)` clamped to 17:15-20:30, plus `N(0, 15)` on the
  day** (design section 3: `N(1110, 25)` and `N(0, 10)`): the wide spread across households is what
  keeps the weekday eating peak at lunch.  With sd 25 the peak bin is 18:45-19:00 (bin 75) and
  check 16a fails on 400 x 4 seeds 1, 2 and 3.
- Chores are rare and long (median 110 min, sigma 0.4): check 14 caps participation at 45 %
  while check 8c wants 50+ household minutes, so the people who clean, clean for a while.  **After
  19:00 a chores pick is a tidy** (`EVENING_CHORES`, at most 60 minutes) and none starts after
  20:30: on 400 x 4 seed 1, 0.12 % of person-days now hold a two-hour-plus cleaning session after
  19:00 and none runs past 22:30.
  **8c counts the `dishes`** (an activity the design's bucket list, chores/cook/laundry/errands,
  predates; the reference's household activities include food preparation and cleanup), 8c is
  61.2-63.9 on 400 x 4 seeds 1-8, and on seed 1 that is chores 22.9, cook 16.6, errands 15.5,
  dishes 8.7 and no weekday laundry (reference: household 75 plus shopping 20), with chores
  participation (14a) at 0.351-0.373 against the 0.33 reference.
  The bucket is short of what
  the reference counts and the model lacks (household management, pets, garden, cooking outside
  the one dinner cook), and the participation check leaves no room to buy those minutes with
  more chores; those minutes sit in `personal`, which is 128.1 minutes an employed weekday on seed 1
  against the reference's 85 for "other" plus caring.
- The free-activity table was retuned throughout (`free_time.py`).  Medians: tv 60, read 55,
  personal 75, chores 110, exercise 45, errands 80, social 130, walk 45; every draw is a
  lognormal **resampled below its cap** (three medians, at most 3 h): the cap used to be a clamp
  and piled draws on 180 minutes; now 0.3 % of 4,713 socials and 0.1 % of 4,925 chores sit there
  (400 x 4 seed 1).  A pick that
  would leave under 30 minutes before the limit runs to the limit (unless that breaks the cap).
  **A gap of 10-29 minutes at home is a short tv, read or personal to the limit** (`SHORT`),
  weighted by the band, never the activity just finished; under 10 minutes, or away from home, it
  is `idle`.  Before, every gap under 30 was `idle`: a 10-29 minute stand after walking in
  the door or after lunch before leaving, now none.  What is left is a 5-9 minute `idle` at home
  on 5.6 % of person-days (634 segments on 400 x 4 seed 1): before the household
  dinner, which may start 5 minutes early, so a boundary 6-9 minutes before it waits, or before
  leaving for a commitment.  **A trip is judged by
  the far end**: `pick_free_activity` gets the limit as it will be over there (`away`, from
  `free_until`: the leave time for the next commitment from that place, or bed less the trip
  home and the wind-down) and a trip needs 90 minutes of that (`MOVE_NEEDS`: the leg there and an
  hour to do something; the leg back is already inside `away`), whatever the row.  A shorter least
  room for the errands row (50, the leg and half an hour) is what a previous round used to buy
  travel minutes for check 8d; it doubled the errand chains inside one trip and put shopping at
  twice the reference, so it is gone.  With the gap measured from home, the wind-down made people
  arrive out and turn straight round.
  **Nobody walks in and straight back out**: a pick right after a commute home has no trip rows,
  and a pick planned at work for home is dropped on arrival when under 30 minutes are left (the
  short-gap rule takes over, item 3).
  A planned trip out lasts at least its two legs (40 min); a trip home from work does not (a
  chores pick made at work with a long commute used to become a three-hour block late at night).
  Someone leaving work picks first and goes straight to where the pick happens, or straight to
  an `out` commitment when there is no time at home before it (judged on the commitment's start
  and the two legs; it used to be judged on the bedtime limit, so a late finisher was routed
  `out` for the next day's gym).
  Daytime weight sits on tv/read/errands with some personal; `personal` (the reference's "other"
  and "caring" buckets, ~55 + 30 min) carries most of its weight in the evening.  Weekend social
  and walk weights were cut and tv raised.  **Errands weight sits in the weekday evening**
  (weekday 09-12 0.12, 12-17 0.3, 17-20 1.5; weekend 09-12 0.9, 12-17 0.8), the latest start 18:30,
  which is what keeps check 15 safe: an errand picked by 18:30 is home before 20:00, and 15 reads
  0.776-0.798 on 400 x 4 seeds 1-8.  The weekday morning column has to stay low: at 0.3 the 11:00
  commute bin grows and 18a fails on seeds 1-3 (2.54-3.36 against its 4).  The weekend weight
  stays high because every minute taken off weekend errands goes to chores, and 14b (weekend
  chores participation) sits at 0.516-0.540 against a 0.55 bound.
- **Employed weekday travel (8d) is 58.7-62.7 on 400 x 4 seeds 1-8** (reference 78, bound 55).
  On seed 1, 61.4 minutes an employed weekday: 39.1 home-work and 22.3 on trips out, 0.54 of them
  a day.  The reference's remaining ~16 minutes are caring, school runs and eating-out trips the
  model does not have; the gap is real and is not worth closing with shopping the reference does
  not support (a round that tried read 66.7-69.5 here and put weekday errands at twice the
  reference's shopping).  The model's at-home share of days worked is 4-7 % on seeds 1-3 against
  the reference's 33 % (`home_days` is 1-2 days for a fifth of people); raising it would take
  minutes off 8d, so it stays.
- Travel to or from `out` is 20 minutes (spec 15; the NHTS average trip, a figure outside
  `atus_reference.json`); home-work is the trait.  A commute takes `travel x U(0.85, 1.15)`, at
  most the trait plus 5, and the departure lead is the trait plus 5 (design 5.1), so arrivals
  scatter: on 400 x 4 seeds 1-3, 53-54 % of work arrivals are 5-9 minutes early and wait (`idle` at
  work; the spec's `place == work -> commute home` rule shuttled them home and back), 41-42 %
  are 0-4 minutes early and start on arrival (the 5-minute same-place lead), 4-5 % are 10 or
  more minutes early, 0 % late.
- Work blocks: a remainder under 15 minutes joins the block; the block before the next
  commitment ends exactly at the leave time.  A snack inside a work block is possible.
- Meals are lognormal, resampled above a least length (`clock.minutes`): breakfast median 15 (at
  least 8), lunch 22 (at least 15) and dinner alone 24 (at least 15), lunch out median 30 (25-45),
  household dinner 25 (at least 20) at plan time, snacks `U(8,15)`; a meal that does not fit its
  least length is not marked as eaten, so lunch is taken later in its window or honestly skipped.
  The earlier `max(least, N(mu, sd))` floors piled draws on the least length; now 2.0 % of
  breakfasts sit on their 8 minutes and 5.8 % of household dinners on their 20 (400 x 4 seed 1).
  Shorter meals buy check 8e minutes, and a previous round took the lunch to 19 and the household
  dinner to 21 for them: that put one lunch in nine at 13-14 minutes and a fifth of shared dinners
  under 20 minutes after an hour of cooking, so the lengths are back.  Logged, that is a median
  lunch of 23 minutes and a median household dinner of 27 (400 x 4 seed 1) against the design's
  `N(25,8)` and `N(32,10)`: still short of the shared dinner, and 8e is 9 minutes over already.  Meal
  days are keyed to the day that ends at 05:00 (`meal_day`), so an evening shift's dinner after
  midnight belongs to that shift (it used to count as the next day's and cancel it); **the breakfast
  belongs to the wake it follows** (`last_meal_day["breakfast"] = p.woke_at`), so a wake before
  05:00 is not refused its breakfast on the strength of the one eaten 23 hours earlier (on 400 x 4
  seed 1 all 349 pre-05:00 wakes of non-skippers are followed by a breakfast within three hours, as
  are all 8,891 later ones).
- Snacks (`snack_due`): 5 h since a meal, 3 h since a snack or the work break, 90 minutes since
  waking, an hour or more before bed, and never within 70 minutes before a meal window opens or
  while one is open and uneaten.  0.29-0.37 a person-day over 400 x 4 seeds 1-8; snacks between
  23:00 and 05:00 are 2.5 % of person-days on seed 1 (late shifts).
- Habits, each at a minute drawn per person on the quarter hour: gym 17:00-19:00, club
  19:00-20:00, laundry at the weekend 09:00-16:00.  A non-worker also draws 1-3 of class
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
  meeting/appointment/class 4 (spec 15 and 6): at the spec's sleep mean of 15, check 20a reads
  0.949, 0.957 and 0.905 on 400 x 4 seeds 1-3 and fails two of the three; at its meeting mean of 6,
  check 20b reads 12, 10 and 8 minutes and fails seed 1 on its bound of 10.  A reply
  deferred to a boundary that turns out to be bedtime waits for the wake-up.  A call never
  splits an activity in its first minute (`started_at < t`).  Heap `version` is checked only on
  `activity_end` and `phone_end`; `reply_due` entries carry the ping id as their owner.  A call
  taken on a commute is logged in transit.
- Sleep windows for `request_slot`, `observe` and the invite verdict: the night being slept
  runs from when the person went to bed to the expected wake plus prep plus 30 minutes; a night
  already slept is over; tonight starts at `bed_tonight` exactly, later nights an hour before the
  trait bedtime; the wake side carries `need + 90 + debt // 2 + 35 on Fri/Sat`.  In the invite
  probe (400 people, three times of day, seeds 1-3) 10 of 1,768 counters, one in 177, still overlap
  the sleep the person later logs (the `N(0,40)` bedtime draw of a later night plus a lie-in);
  covering that would push every morning counter an hour later.
- `free_windows` returns gaps inside `[t, t + horizon)` only (it used to run past the horizon
  with no nights removed), and a gap open now while the person is away ends when they must leave
  where they are: the next commitment's start less the trip from there, or bed less the trip home
  and the wind-down (open-now windows used to promise time the person spent on the
  way to a cook at home).  `Observation.next_free_window.place` is where the person will be:
  their current place when the window is open now, else `home`.
- `request_slot` offers start at least 30 minutes after the reply the person would give now (its
  fixed wait plus three times the mean of its random part), padded by the trip there and back plus 5
  minutes (from the person's current place for a window open now, else from home), so a first offer
  invited straight back is still answerable: 1-3 % of such invites still come back `too_late` on
  the exponential tail of the random part (390 offers of 400 people and 7 too_late on seed 1 Tue
  09:00; 390-399 offers and 4-12 too_late over seeds 1-3 at three times of day); a duration that is
  not an `int` of at least a minute (`bool` included), an inverted window, a window already over or
  an unknown place raise `ValueError`.  Offers and counters are not held.  A counter is the first
  offer not overlapping the refused slot.
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
- Known leftovers: 0.6 % of waking periods hold five or more hours of `personal` (the day's cap is
  three hours, but a pick started just under it runs its own length past it: 64 of 11,529 on 400 x 4
  seed 1, none over 5.8 h); a 10-14 minute wait at `out` before a commitment there, split by a phone
  call, leaves 1-4 minute `idle` stubs in that person's log, as any activity a call splits does; a
  free `errands` pick can run straight into a household `errands` block (17 times in 11,200
  person-days on seed 1); an errands pick can also run to the table's 180-minute cap (179 of the
  4,392 free errands blocks on seed 1 are 150 minutes or longer), and 70 person-days hold three
  walks, up to three hours of walking (a third helping only halves the row's weight, and nothing
  counts a day's minutes by row); non-worker days are still 20 awake segments with 8 of them
  tv/read/personal (the three home labels and "never the same thing twice" shuffle rather than
  settle; longer medians would push 13a, at 20.81-21.02 of 22, and tv is already over the weekday
  reference); 8 % of employed weekdays hold two or more free trips out, over half of them days not
  worked (220 of 402 on seed 1; the pick is made afresh at every boundary and nothing counts a day's
  trips); partners at home in the evening do the same thing side by side for 15 minutes or more on
  62 % of couple evenings with no `with_ids` (only the table joins people, see README); a non-worker
  married to a pre-07:00 starter is pulled by the partner average to a 22:56 median trait bedtime, a
  tenth of them before 22:10 (seeds 1-3); on 6 % of person-days someone eats lunch at home alone
  while a housemate is home and awake; 6 % of person-days have no lunch (short shifts without a cut,
  weekend outings over noon); a late shift or an evening habit ending after `bed_tonight` less the
  trip and the wind-down still goes from the commute straight to sleep (2.0 % of nights, a third of
  them clubs); 1.9 % of person-days wait 10+ minutes at work (arrivals 10-13 minutes early on long
  commutes).  All of these are 400 x 4 seed 1 unless another run is named.

## Check definitions

- 22a asked that the appointment segment *cover* the booked slot exactly, which measured
  punctuality rather than keeping.  With departure slack and commute hold-ups a person can reach a
  booked slot a few minutes into it: on 81 accepted invites, none was missed altogether, the median
  arrival was on the minute and p90 was 7 minutes late.  22a now asks that an appointment overlap
  the slot (still 1.000), and the new 22c reports the share attending at least 80 % of it
  (0.84-0.93, bound 0.75).  The old form would have made lateness impossible to model at all.


- 6b counts only sleep segments split at exactly midnight; two work blocks meeting at 00:00 on
  a night shift are two blocks, not a split.
- 8b, 8c and 8f count `gym` as leisure (the reference's leisure and sports bucket) and `dishes`
  as household; 8c's bucket includes `errands` (the reference's shopping, 20 min, is not in its
  75), so like for like the model's household minutes are 48 against 75 and its errands 16 on
  seed 1 against 20.  Taken together the bucket is 61-64 against the reference's 95: short on both
  sides, and shortest on the cooking, cleaning and garden the model does not have.
- 11b is the median over (workplace, day, shift) groups with at least three lunches at work.
- 13b is the median over persons of their weekday wake sd.
- 16a orders two peaks the reference calls equal ("about 3 in 10" at noon and at 18:00); at
  400 x 4 lunch wins on seeds 1-8, at 200 x 2 and 60 people the dinner peak is a few household
  minutes drawn once and the order is a coin toss (200 x 2 seed 5 and 60 x 1 seed 9 fail it).
  A definition question, not a mechanism; nothing is tuned to make lunch win.
- 18a compares all commuting (trips out included) in the 11:00 bin with the morning peak; the
  reference has no time-of-day travel figure and the bound is the design's guess, over a
  denominator of 77-101 person-minutes a weekday over 400 x 4 seeds 1-8 (5-7 of 400 people in
  transit).  The 11:00 bin is non-workers back from a morning errand or leaving for one before a
  12:30+ lunch, the 12:00 workplaces' commutes (seed 3 has 15 members at one, 6 % of its employed
  against the table's 0.05) and the earliest lunches out.  The morning peak quarter-hour holds
  382-559 person-minutes a weekday (the ACS-shaped start table, 0.57 leaving 06:00-08:29), so the
  ratio sat at 4.32-6.30 on seeds 1-8 before day-to-day variation was added; spreading arrivals and
  then the work schedule itself lowered the peak, and it is now 3.44-5.7, failing on seeds 2 and 3.  The check rewards a sharper
  peak, i.e. the very synchronisation the slack removes, so it is left failing rather than widened:
  its bound is a guess with no reference, over a denominator of 77-101 person-minutes.  The weekday
  09-12 errands weight is what feeds the 11:00 bin.
  A start table with more weight in 07:30-08:30 would lift it, but the three checks 18a, 18c and
  18d share that table and 18c/18d already sit above their references, so it stays.  I think
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

- 400 x 4: seeds 1 and 4-8 pass 53/53; seeds 2 and 3 fail 18a only (3.77, 3.44).  Across the eight: 8d 58.7-62.7 (bound 55, reference 78),
  8c 61.2-63.9 (bound 50-100), 8b 233.0-241.0 (bound 260), 8e 66.1-67.3 (bound 80), 15 0.776-0.798
  (bound 0.75), 18a 4.32-6.30 (bound 4), 18b 64-70 (bound 62-73), 18c 0.572-0.641 (reference 0.57),
  18d 0.577-0.656 (0.58), 7b 0.258-0.295 (0.30), 3b 81.8-93.0 (bound 95), 3a 419-432 (bound 440),
  1a 8.00-8.25 h, 1b 38-45 (bound 30), 4 61-75 (bound 40-90), 19 68.5-83.5 (bound 90), 6a
  0.750-0.789 (bound 0.70), 8f 381-395 (bound 420), 13a 20.81-21.02 (bound 22), 14a 0.351-0.373
  (bound 0.45), 14b 0.516-0.540 (bound 0.55), 16b 0.289-0.327 (bound 0.22), 20b 5-9 (bound 10).
  1,000 x 4 seed 1 passes 52/52; its four weeks run in 8.5-9.1 s (575,615 heap pops of the 800,000
  budget) and the whole `checks` command in 11.4-12.4 s over four runs.
- 200 x 2: seeds 1-3 pass; seed 4 fails 18c (0.683).
- 60 x 1: seed 1 fails 7a (0.730), 7b (0.432), 8a (329), 8b (260.1), 18a (3.99) and 18c (0.718);
  seed 2 fails 7b (0.167), 8f (425) and 19 (93.5); seed 3 fails 3a (441) and 5b (13.0).  60 people
  give 4 workplaces and 30-37 employed on seeds 1-3: the seven-day share, the roster, the start
  mix, the lie-in and the housework share are one or two draws.  Sampling; the
  calibration surface is 400 x 4.
- 3b (weekday wake sd 40-95, reference 70 "guess") is the one bound I still think is wrong for this
  start distribution (the start table puts 15 % of workplaces at 12:00 or later and 8 % at 06:00 or
  earlier; member-weighted that is 12-18 % and 7-9 % on 400-person populations, seeds 1-3): it lands
  at 81.8-93.0 over 400 x 4 seeds 1-8, seed 3 highest at 93.0 whatever the non-workers' need (93.7
  at `N(520, 55)`).  The reference's 70 describes a population whose late starters it does not
  count.  It passes on all 400 x 4 runs but has two points of room on seed 3.
- 1b (weekend nights 30+ minutes longer) sits at 38-45 against the reference's +66: the
  reference's own timing deltas (wake +53..75, bedtime +26) imply
  +27..+49, and its 558-492 includes weekend naps the model does not have.  **1b and check 4
  (weekend wake later by 40-90) move together minute for minute**: a night's sleep length does not
  depend on when it started, so anything that lengthens a weekend night moves the weekend wake by
  the same amount.  The employed are at +39..+52 (seed 1: 51 minutes on the medians); the pooled
  figure is held down by the non-employed at +30..+34, who have no alarm and so no debt, only the
  35-minute weekend lie-in.
- Employed sleep runs 2-4 % under the reference on weekdays and 5-7 % at the weekend (weekday
  472-484 against 492, weekend 517-531 against 558): inside the reference's own uncertainty, left
  as is; non-workers are at 492-507 / 525-540 (see item 4).
- Employed weekday eating (8e) is 66.1-67.3 against the 58 reference (bound 80).  Per employed
  weekday on seed 1: dinner 28.1 minutes on 0.99 sittings, breakfast 15.7 on 0.82, desk lunch
  23.9 on 0.51, lunch at home 23.9 on 0.31, lunch out 30.6 on 0.09, snack 11.5 on 0.34.  It is 9
  minutes over the reference, all of it in the sittings themselves; trimming them is what the
  meals paragraph above says it costs, so they stay at the design's lengths.
- Employed weekday tv is 125-131 against the 110 reference (400 x 4 seeds 1-8): check 15 (0.75 of
  person-minutes at home 20:00-22:00, measured 0.776-0.798) is what stops a trip out taking more,
  since 33 of those tv minutes fall inside 20:00-22:00 on seed 1 and any trip that reaches into
  that window is charged against it.  An errand picked by its 18:30 latest start is home before
  20:00 and costs check 15 nothing, which is the only reason there is room for it at all.  Leisure
  as a whole (8b) is 233-241 against 212 and the non-tv part of it is 105-111 against 102, so the
  whole of the leisure excess is tv.
- 20b (median reply delay after a meeting ends, bound 10) is drawn from 23 samples on seed 4 and
  41-54 on the other seven, because the ping loop only catches people who happen to be in a
  meeting at a five-minute poll.  It reads 5-9 over 400 x 4 seeds 1-8 with seed 4 at 9: on that
  seed the number is a coin toss, not a mechanism.
