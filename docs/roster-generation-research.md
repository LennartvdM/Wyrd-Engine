# Beyond weighted picks: richer ways to generate a synthetic person's day

Research notes for `flock/`, October 2026.  The question was: the free-time generator is a weighted
pick by hour band, commitments are posted a week ahead by workplace and household, and sleep is an
alarm plus a bedtime draw.  What do activity-based travel models, time-use research, game NPC
systems and the generative-agents literature do instead, and which of it is worth borrowing in
standard-library Python with no model at runtime?

Sources are cited inline; a few parameter values are marked *(verify)* where they come from search
snippets rather than the paper itself, because full-text fetches were blocked for several sites.

## 1. What is rudimentary about the current generator, precisely

Reading `free_time.py`, `sleep_and_meals.py`, `commitments.py`, `people.py` and `world.py`:

- **Free time is memoryless beyond today.**  `pick_free_activity` draws one of eight rows with a
  weight per five-hour band, zeroes the row just finished and halves a third helping.  Nothing
  carries over to tomorrow, so there is no "I have not seen anyone all week" or "the flat needs
  cleaning".  Weekly rhythms (laundry, the gym) exist only as `Habit` tuples at fixed minutes.
  `NOTES.md` already names the symptom: non-worker days are twenty awake segments, eight of them
  tv/read/personal, and the rules "shuffle rather than settle".
- **Every activity is a label with a duration.**  There is no reason to be doing it, so there is
  nothing an interruption, a disruption or an invitation can trade against except the
  `INTERRUPTIBLE` constant and the sociability draw.
- **Commitments have one planning horizon.**  Everything shared is posted on Sunday for the week
  after next; everything free is decided at the boundary.  Real days have things planned months,
  days and minutes ahead, and the difference is exactly what an agent asking for a slot should
  run into.
- **People meet only inside commitments and at the household table.**  `social` at `out` is with
  nobody; there is no friend graph, no place where two people from different households can be at
  once, and `with_ids` on side-by-side tv is empty (62 % of couple evenings, per the notes).
- **The world has three places.**  `home`, `work`, `out`; 20 minutes to anywhere.  Nothing has
  opening hours or capacity.
- **Every week is the same shape.**  No illness, holidays, weather, seasons or visitors; the
  "Not modelled" list in the README is the list of everything that makes one week differ from
  another.
- **Sleep is a trait plus jitter.**  The alarm-and-debt mechanism is good, but chronotype,
  weekend catch-up and the Friday late night are separate constants rather than one trait.
- **Replies are an exponential with an activity-specific mean.**  No notion of checking the
  phone, of a message seen but not answered, or of answers clustering at block boundaries.

The event heap, the determinism-by-stream design, the commitment list with `fits`/`free_until`,
the household table and the 52 realism checks are all worth keeping.  Everything below slots in
underneath them.

## 2. The techniques, by what they change

### A. Motivation: needs, advertisements and response curves

**Need-based activity generation** (Arentze & Timmermans, *A need-based model of multi-day,
multi-person activity generation*, Transportation Research B 43(2), 2009; Nijland, Arentze &
Timmermans, Transportation 39, 2012).  Each discretionary activity class is a need that grows
along a logistic curve at its own rate since the activity was last done, is reset by doing it, and
is scheduled when the utility of doing it (need reduction per minute) crosses a person-specific
time-pressure threshold.  Activities serving the same need substitute for each other; household
needs (groceries) can be met by any competent member.  This is the single idea that most changes
the generator: laundry every five or six days, friends every ten, the gym three times a week and
"errands have piled up" all come out of growth rates instead of hand-written frequencies.  The
same mechanism, with the same name, is what the LLM-agent papers rediscovered: *Humanoid Agents*
(Wang et al., 2023, five needs on 0-10 that decay hourly and rewrite the day plan when low) and
*D2A* (Wang et al., ICLR 2025, eleven Maslow-style desires).

**Advertisements and smart objects** (The Sims; Forbus & Wright, *Some Notes on Programming
Objects in The Sims*).  Intelligence lives in the objects, not the people: every interaction at a
place advertises a vector of promised need gains, the person multiplies each by a per-need
weighting curve evaluated at their current level and picks the best, with mild randomness.  The
Sims 3 made the pick a softmax whose temperature rises when the Sim is unhappy, so content people
are predictable and miserable ones erratic.  For flock: `Place.affordances` replaces the `ROWS`
table, and a kitchen at 18:00, a canteen at 12:00 or a pub on Friday at 20:00 advertise different
things; availability windows do the work the band weights do now.

**Response curves and product scoring** (Dave Mark, *Behavioral Mathematics for Game AI*, 2009;
Infinite Axis Utility System, GDC 2013/2015).  Each candidate action has a handful of
considerations (hunger, minutes since social contact, minutes to the next commitment, distance),
each mapped through a four-parameter curve to 0..1, and the score is their product with a
compensation factor.  Continuous, explainable, and tiny to implement.  It is the glue between a
need vector and a choice.

**Tolerance and variety** (RimWorld joy tolerance: each recreation kind builds a tolerance of two
thirds of the joy gained that decays over days).  The "never twice running" rule becomes a
per-kind counter and the six-nights-of-tv problem disappears without a cap.

**Needs derived from personality** (Dwarf Fortress needs, since 0.44; Big Five in *Talk of the
Town*).  A trait vector decides which needs a person has and how fast they grow: extraversion sets
the social growth rate, conscientiousness the punctuality jitter and plan adherence, openness the
novelty weight, neuroticism the interrupt sensitivity.  Flock's `sociability` and
`responsiveness` are two coordinates of this already.

**Block-typed days that shift thresholds** (Oxygen Not Included: a day of 24 blocks typed
bathtime/work/downtime/bedtime; a block changes the *thresholds* at which a need is acted on rather
than forcing activities; a short ordered emergency list can still interrupt).  This is how to keep
the alarm, the lunch cut and the bedtime limit while letting needs drive everything in between.

### B. Structure: skeleton first, then fill, at several resolutions

**Skeleton-then-fill** is the shape every serious activity-based model takes.  ALBATROSS (Arentze &
Timmermans, 2000/2004) runs a fixed sequence of about 27 decision steps, each a decision tree
induced from diaries: do the skeleton activities (work, school) occur, with whom, how long, when,
where; then flexible activities are fitted into the windows left.  CEMDAP (Bhat et al., 2004)
frames a worker's day as before-work, commute, work-based and after-work periods, each with its own
menu.  Flock does the skeleton part (commitments) but fills every gap with the same table; the
cheap upgrade is a menu per window type.

**Household-coordinated day types** (ActivitySim CDAP, the Bowman/Bradley day-pattern family).
Before any time is placed, every household member is given one of three day types (mandatory,
non-mandatory, home) by scoring all combinations jointly, so a parent's home day is chosen with
the child's.  Flock's `home_days` is drawn per person; a household-level day-type draw would let
"we are both off on Friday" happen on purpose.

**Hierarchical task networks for a day** (Kelly, Botea & Koenig, *Offline Planning with HTNs in
Video Games*, AIIDE 2008; the same coarse-to-fine shape in Park et al.'s Generative Agents: 5-8
broad strokes, then hours, then 5-15 minute chunks).  `Day -> MorningRoutine, Work, Evening`, each
with alternative methods (`Evening: cook | eat out | order in`) with preconditions, sub-tasks and
duration draws.  The plan tree is loggable, explains itself, and can be re-expanded from an
interrupt point.  This is the structural upgrade to the `decide` function: the minute-level roster
reads as intentional because it was derived from a coarse intention.

**Plan memory with mutate-score-keep** (MATSim, Charypar & Nagel 2005; Arup's pure-Python `pam`
library does the plan surgery).  Each person keeps two to four whole-day plans with a score
(log-of-duration utility around a typical duration, penalties for late arrival and early
departure); each day one is mutated (shift a start by 15 minutes, swap the evening activity, drop a
trip), executed, scored, kept or discarded.  Routines emerge as personal equilibria with day-to-day
variation that is still coherent.

**Time-of-day Markov router plus explicit durations** (Richardson, Thomson & Infield, Energy and
Buildings 2008: a transition matrix per ten-minute slot from the UK time-use survey; Dube et al.,
*Hierarchical Semi-Markov Models with Duration-Aware Dynamics*, 2025/26; Wang & Osaragi 2023 show a
plain time-varying chain matches neural nets).  `router[time_bucket][state] -> next_state`, then a
lognormal duration for the successor, optionally competing-risk (draw a duration per possible
successor, take the earliest).  Flock's hour-band weights are a degenerate router with no
`state` dimension; adding it is a few dozen lines and removes the geometric-duration artefact.

**Universal chain sampler** (Ectors et al., TRR 2022: across fifteen surveys, out-of-home activity
chains come from two near-universal distributions, the number of out-of-home activities per day
and the type given position; Ectors et al., Transportation 2019: chain frequencies follow Zipf's
law).  A fallback generator for days out, and a sanity check on any generator's chain histogram.

### C. Time horizon: when a thing was decided

**Planning-horizon tagging** (ADAPTS, Auld & Mohammadian, Transportation Research A 2012; the
empirical basis is Mohammadian & Doherty 2006 on the CHASE week-long scheduling survey: roughly a
third of activities impulsive, a fifth planned the same day, a quarter planned days ahead, the rest
routine or far ahead *(verify)*).  Every activity class carries a lead-time distribution.  Simulate
the planning timeline, not just the execution timeline: on day d, draw the future commitments that
enter the calendar for day d+k; on the day, impulsive activities fill the gaps.  For an agent
asking for a slot this is the difference between "free" and "free but will probably be taken by
Thursday", and it makes declines and counters come from the same mechanism as the person's own
booking.

**Projects and the shift/shorten/reject ladder** (TASHA, Miller & Roorda, TRR 1831, 2003).
Episodes belong to projects (work, shopping, joint-other); each project draws frequency, start and
duration from joint distributions by person type; episodes are inserted into the roster in
priority order and a conflict is resolved by shifting, shortening or rejecting the lower-priority
one, with travel gaps inserted.  Joint projects are generated once at household level and mirrored
into each participant's roster.  Flock's `plan_week` is a special case with two project types and
no conflict ladder.

**Rescheduling under disruption** (Aurora, Joh, Arentze & Timmermans, 2003-2009).  Under time
pressure people first compress discretionary durations toward a minimum (diminishing-returns
utility), then drop, postpone to a later day, substitute or chain.  Give every activity a minimum,
preferred and maximum length and a priority, and a late train, a long meeting or a sick child
ripples believably; what is postponed raises its need level for tomorrow.

**Pre-planned events pull related activities forward** (Nijland et al., 2012).  A birthday on
Saturday spawns gift shopping on Thursday and cleaning on Friday.  One rule, large narrative
payoff.

### D. Other people: households, friends, places

**Practices with roles** (Versu, Evans & Short, 2013/2014).  A shared activity (dinner, stand-up,
school run, pub night) is a social practice with roles and slots.  A household or workplace
instantiates the practice; members join or decline by their own utility; several practices can be
active at once.  Flock's `join_table` is a hand-written practice for one activity.  Generalising it
gives the shared tv, the walk together and the Friday drinks that `with_ids` currently never show.

**Coverage-first household scheduling** (Presser, *Working in a 24/7 Economy*, 2003: about a third
of two-earner US couples with a child under five are split-shift; Lesnard, *Off-scheduling within
dual-earner couples*, AJS 2008: a fifth of dual-full-time couples are strongly desynchronised, and
it is imposed by employers more than chosen).  Assign each household a sync class; solve coverage
needs (someone home with the child every minute) before personal fill; joint activities only in the
overlap of free windows.  Children are the biggest missing thing in flock and this is the shape
they would take.

**Household task allocation** (Recker's Household Activity Pattern Problem, 1995: the household
day as a pickup-and-delivery routing problem).  Not the solver, but the framing: a household task
list with time windows, allocated greedily to the member whose roster has the cheapest insertion.
The cook rota becomes one instance.

**Relationship-sourced appointments** (Watch Dogs: Legion "Census", Dragert, GDC 2021).  A
profile generator produces an internally consistent person, a relationship generator links them
to specific others, and the schedule is derived from both: home, workplace, leisure spots, and
scheduled meetings with named people at named places.  With a friend graph (Watts-Strogatz ring
over the population, k about 6, rewiring 0.1, as SynthPops does for community layers) and a
per-edge "visit" need, `social` at `out` becomes "coffee with person 41 at the cafe", and an invite
that collides with it is declined for a reason an agent can read.

**Volition rules for who invites whom** (Comme il Faut / Prom Week, McCoy et al., AIIDE 2011).
Scores for (actor, social exchange, target) from trait and relationship predicates, acceptance from
influence rules, effects appended to a social-facts history.  A few dozen rules are enough to
generate the population's own invitations, which is exactly the traffic the agents are competing
with.

**Places with hours and capacity** (S.T.A.L.K.E.R. A-Life smart terrains: places own job slots
with capacity and hours; people claim a slot for a while and move on).  Three places become a
small set per person: a gym, a cafe, two friends' homes, a supermarket, each with opening hours
and a capacity, so two friends can be at the same bar and a shop can be shut.

**Personal geography** (Song, Koren, Wang & Barabási, *Modelling the scaling properties of human
mobility*, Nature Physics 2010: explore a new place with probability proportional to S^-0.2 where
S is the number of known places, otherwise return to a known one weighted by past visits;
Schneider et al., J. R. Soc. Interface 2013: seventeen daily place-network motifs cover about 90 %
of days and each person's motif is stable for months).  Twenty lines give each person a stable set
of haunts and the occasional new one.

### E. The body: sleep, hunger, variability

**The two-process model** (Borbély 1982; Daan, Beersma & Borbély 1984; reappraisal in Borbély et
al., J Sleep Res 2016).  Sleep pressure S rises during wake toward 1 with a time constant of about
18 hours and falls during sleep with one of about 4 hours; two circadian thresholds oscillate with
a 24-hour period; sleep starts when S crosses the upper threshold and ends when it crosses the
lower *(parameter values: verify against Daan 1984)*.  Per-person time constants, phase and
amplitude give chronotype, long sleep after a late night, short sleep after a nap and the "second
wind" past the trough.  An alarm is a forced wake while S is still high, so weekend catch-up falls
out instead of being `debt // 2`.  Flock's debt mechanism is a one-parameter approximation of
this; the full thing is about thirty lines.

**Chronotype as one trait** (Roenneberg et al., *Epidemiology of the human circadian clock*, Sleep
Med Rev 2007; Wittmann et al., *Social jetlag*, Chronobiol Int 2006).  Mid-sleep on free days,
corrected for weekend oversleep, is roughly Gaussian in a population, latest around age twenty and
earlier with age; social jetlag of an hour or more affects about 69 % of respondents and more than
80 % use an alarm on workdays.  Draw one trait and derive free-day bedtime and wake, workday wake
from obligations, and the weekend shift from the difference; the Friday-night delay and Saturday
lie-in are consequences, not constants.

**Sleep inertia and caffeine** (Tassi & Muzet 2000; Hilditch & McHill 2020; Sleep Foundation
2022 on caffeine timing).  A grogginess scalar decaying over 20-30 minutes after waking, higher
after an alarm or short sleep, that lengthens reply delays and biases the first pick toward coffee
or nothing; caffeine as a counter with a five-hour half-life that subtracts from sleep pressure,
with a per-person last-cup hour.

**Anticipatory hunger** (LeSauter et al. 2009; Mistlberger 2013).  Ghrelin rises before the
*habitual* mealtime, not after a fixed fast.  Keep minutes-since-meal and add a per-person moving
average of when meals actually happen; hunger is fasting time times anticipation of the usual
time.  People on a new shift are hungry at the old time for days.

**Eating occasions and cultures** (USDA ERS, ATUS Eating and Health module: primary eating peaks
12:00-13:00 and 18:00-19:00, secondary eating by 5 % or more of people every hour 09:00-21:00;
NHANES: about 90 % report four or more eating occasions a day, median three snacks; EFCOVAL: eating
frequency 4.3 a day in France against 7.1 in the Netherlands; EPIC: a strong south-north gradient
in meal timing).  Secondary eating as a flag over another activity rather than a block; a
`culture` record with meal-time means and frequencies so a Dutch population and a Spanish one are
different worlds from the same code.

**Variability as a trait** (Bei et al., *Beyond the mean*, Sleep Med Rev 2016: night-to-night
variability of bed and wake time is itself a stable per-person trait, wider for the young, those
living alone and evening types; Van Dongen et al., Sleep 2004: 58-68 % of variance in impairment
from sleep loss is stable within person; Schlich & Axhausen, Transportation 2003, six-week
Mobidrive diary: day-to-day variation exceeds half of total variation for everything except
mandatory activities).  Draw per-person standard deviations instead of one global `N(0,40)`;
split every jitter into a person offset drawn once and a day draw whose width depends on the
activity class.  Ten lines, and the population stops looking uniform.

### F. Exceptions and arcs: why this week is not last week

**Key-cascade overrides** (Stardew Valley schedule data: per NPC a dictionary of schedules whose
key is resolved in a fixed order, marriage and date before weather before weekday before season
before default, with "arrive by" times back-computed from travel).  A resolver that checks date,
weather, relationship state, weekday and season before any generation.  Trivial to add on top of
whatever generates the default, and immediately produces the exceptions an agent has to cope with.

**Packages and phases** (Oblivion/Skyrim Radiant AI packages: an ordered list of goals each with a
time window, day-of-week class, season and condition functions; first passing package wins and is
re-evaluated on events; The Witcher 3 communities: timetables grouped into phases that a quest
swaps wholesale).  A person's routine as an ordered package list, and life events (new job, a
cold, holiday, a visitor) as a phase switch that replaces part of it.

**Storylets** (quality-based narrative, Failbetter's Fallen London; Emily Short, *Beyond
Branching*, 2016).  A storylet is preconditions over numeric qualities plus effects.  Thirty to
fifty authored life events (dentist, sick child, friend visiting from abroad, overtime crunch,
moving house, exam week) with trait, season and relationship preconditions and effects that inject
commitments, switch phases or rewrite need rates.  Selection is weighted random over the eligible
set.  This is the cheapest way to make weeks differ in believable ways, and it is already the
shape of the old prototype's `unique_events.py`, which flock dropped.

**Week arcs** (the structural idea of Generative Agents without the model).  An arc object (a
deadline week, a cold with a five-to-seven-day severity curve that raises sleep need, kills social
plans and lengthens replies, and spreads through the household with a two-to-three-day lag; a
holiday; the DST week) that temporarily rewrites need rates, budgets and responsiveness, plus a
nightly "plan tomorrow" pass that lays fixed blocks before the minute-level fill.

**Weather and season** (Chan & Ryan, IJERPH 2009: each 10 mm of rain cuts physical-activity
sessions 2-4 %; Kantermann et al., Current Biology 2007: free-day mid-sleep tracks sunrise across
the year under standard time and loses the tracking under DST).  A daily weather state as a
three-state Markov chain scaling outdoor utility; sunrise by latitude and day of year nudging
free-day mid-sleep.

**A pre-run life history** (Talk of the Town, Ryan et al., 2015-2018: a cheap yearly simulation
of births, jobs, marriages, moves and friendships over decades gives every resident a biography
and a social network before the daily simulation starts; Dwarf Fortress legends: full detail for
"historical figures", aggregates for everyone else).  Running a few simulated years of coarse
life events before week 1 is how the friend graph, the relationship-sourced appointments and the
trait correlations (partners with similar chronotypes, colleagues who are friends) get populated
coherently instead of being drawn independently.

### G. Attention and replies

**Bursty attention** (Barabási, *The origin of bursts and heavy tails in human dynamics*, Nature
2005: a priority queue where the top item is served with probability about 0.9 and a random one
otherwise gives power-law waiting times; Malmgren, Stouffer, Motter & Amaral, PNAS 2008: the
heavy tail is largely a circadian and weekly rate plus "sessions", a primary Poisson process that
opens a session inside which a cascade of replies happens at a higher rate).  Malmgren's model is
the natural fit for a minute-by-minute roster: the circadian rate *is* the roster, a session is a
"phone block" state, replies inside a session are quick and between sessions they wait.

**Checks and noticing** (Andrews et al., PLoS ONE 2015: about 85 phone checks a day, most under
30 seconds, more in the afternoon and evening; Pielot et al., *Didn't you see my message?*, CHI
2014: half of messages seen within about six minutes, predicted by screen activity and ringer
mode).  Model checks as a Poisson process whose rate depends on the current activity and hour
(near zero asleep, in a meeting or driving; high while idle, watching tv or on transit); a ping is
noticed at the next check and then answered after a queue delay.  Flock currently conflates
noticing and answering in one exponential.

**Who is slow and when** (Kooti et al., *Evolution of Conversations in the Age of Email
Overload*, WWW 2015: median reply just under an hour, teens about 13 minutes and over-51s about
47, faster in working hours and on weekdays, shorter and later in the evening; overloaded users
reply to a smaller fraction, not more slowly).  A per-person base lognormal scaled by age and by
hour-of-day and weekday factors, and a daily load counter that lowers reply *probability* rather
than speed.  Flock's nag counter is a special case of the load counter.

**Interruptibility predictors** (Fogarty et al., TOCHI 2005; Horvitz & Apacible, ICMI 2003:
whether someone is talking is the strongest predictor of non-interruptibility, a scheduled meeting
the next; Mehrotra et al., UbiComp 2016: response time depends on task type, how complete the task
is and the sender relationship).  Tag activities with `talking` and `task_depth`; multiply the
delay by three when talking and by one plus depth, and halve it near the activity's end, which is
the cheap realistic touch: people answer when a block finishes.

**Conversation volleys** (Masuda et al., self-exciting point processes on conversation logs,
2013).  A Hawkes thinning sampler in fifteen lines so that one message makes the next from either
side more likely for a few minutes; relevant once agents hold exchanges rather than single pings.

### H. Validation to borrow, and what the ML and LLM work is good for

The 52 checks compare marginals.  Three more views would catch the "shuffle rather than settle"
problem that marginals miss:

- **Tempograms** (stacked share of each activity by ten-minute slot; the flowingdata *A Day in the
  Life of Americans* animation is one over ATUS).  Flock's `histogram` is a coarse tempogram
  already; per persona and per weekday it becomes a diagnostic.
- **Day typologies by dynamic Hamming distance** (Lesnard, Sociological Methods and Research 2010:
  slot-by-slot comparison with substitution costs that vary by time of day, then clustering).
  ATUS clusters into a handful of day types (work day, housework day, tv day, leisure day); a
  generator that produces the same handful in the same proportions, with the same within-cluster
  spread, is settled rather than shuffled.
- **Chain histogram against Zipf** (Ectors 2019) and **first-order transition-matrix distance**
  against a reference, which is what the time-use Markov papers report.

The deep generative models (Shone & Hillel, *caveat* and ActVAE, 2025; Liao et al., *Deep Activity
Model*, 2024; SAND, Yuan et al., 2023, where needs are latent SDEs) and the LLM agents (Generative
Agents, LLMob, AgentSociety, MobileCity) all need a model at runtime, which flock rules out.  Two
things from them are still useful.  First, their findings: Shone & Hillel report that unexplained
variance dominates schedules even with demographics, which argues for sampling over rules, and
every LLM-diary study finds the same failure mode, over-estimated travel durations and
under-estimated counts, which is a warning about where authored tables beat generated ones.
Second, an LLM used **once, offline** is a good author of the tables the stdlib generator then
samples from: persona day-type libraries, place affordance lists, storylet sets, cultural
mealtime records.  MobileCity's result that 4,000 agents can run on a *pre-generated action space*
with needs, habits and obligations is the same conclusion from the other direction.

## 3. One design that combines them

What I would build, keeping the heap, the streams, the commitment list and the checks:

1. **Traits to parameters.**  Replace the flat `Traits` draw with a small trait vector (chronotype
   mid-sleep, Big Five, variability width, culture) from which bedtime, alarm behaviour, need
   growth rates, punctuality jitter, novelty weight and reply base are derived.  Partners and
   colleagues get correlated draws from a short pre-run of life events (jobs, moves, friendships)
   that also produces the friend graph.
2. **Needs and places.**  `p.needs` as a dict of logistic-growth needs; `Place` objects (home,
   workplace, two to six personal haunts) with affordances, hours and capacity.  `pick_free_activity`
   becomes: list reachable affordances, score each by response curves over the need vector, the
   time to the next commitment and the trip, draw by softmax with mood-dependent temperature.
   The `ROWS` band weights survive only as availability windows on affordances.  Tolerance
   counters replace "never twice running".
3. **Sleep from the two-process model** with the alarm as a forced wake.  Keep `bed_tonight` as
   the draw the rest of the code reads, but derive it from S and C rather than a trait plus
   `N(0,40)`.
4. **Three planning horizons.**  `plan_week` keeps posting the far-ahead skeleton (work, rosters,
   household dinners).  A nightly pass adds days-ahead items drawn from needs over threshold with
   lead-time tags (gym, groceries, a friend visit through a volition rule), resolved by the TASHA
   ladder.  The boundary decision handles the impulsive rest.  Agent invites then compete with
   the person's own bookings on equal terms.
5. **Practices** generalise `join_table`: dinner, shared tv, the walk, the Friday drink, the
   school run, each with roles and a join rule, instantiated by households, workplaces and friend
   edges.
6. **Storylets and arcs** on a key-cascade resolver: a few dozen authored life events with
   preconditions and effects, a weather chain, a season, an illness arc that spreads in the
   household.
7. **Attention sessions** in `agent_api`: a check rate by activity and hour, a priority queue of
   unanswered pings, a session state in which replies are quick.

Every part is independently testable against the existing checks, and each adds a reason to a
segment that an agent could in principle ask about.

## 4. What this does to determinism and the checks

Needs, places and practices are all state advanced from per-person streams, so the "person n+1
changes nobody" guarantee holds as long as the friend graph and the pre-run are keyed by id the
way workplaces are (the Watts-Strogatz ring can be built by id order; the pre-run must draw only
from the streams of the people it touches).  The checks are calibrated marginals, and a need-based
generator will move several of them at once (8b leisure, 8c household, 14 chores participation,
15 at-home share in the evening), so the growth rates and thresholds become the new tuning surface
in place of the band weights.  That is a fair trade: a growth rate is a claim about a person,
a band weight is a claim about a histogram.

## 5. Suggested order of work

Each stage is a measurable change and leaves the suite passing.

1. **Variability traits and tolerance counters** (a day).  Per-person jitter widths, per-kind
   tolerance.  Expect 13a and the "twenty segments" leftover to move first.
2. **Needs over the existing table** (a few days).  Add the need vector and curve scoring while
   keeping the eight rows as the action set; laundry, errands and social stop being fixed
   habits.  Add tempogram and day-typology diagnostics to `report.py` before tuning.
3. **Places, friend graph and practices** (a week).  Two to six haunts per person, a
   Watts-Strogatz friend ring, `social` becomes a visit to a named person at a named place,
   shared tv and walks carry `with_ids`.
4. **Two-process sleep and attention sessions** (a few days each).  Independent of the above.
5. **Horizons, storylets and arcs** (a week).  The nightly planning pass, lead-time tags, the
   conflict ladder, a first set of thirty storylets, an illness arc, weather.

## Sources

Activity-based and need-based models: ActivitySim wiki and CDAP paper (arXiv 1807.01148);
Charypar & Nagel 2005 and Horni, Nagel & Axhausen (eds.) 2016 for MATSim; Arup `pam` (JOSS 2024);
Miller & Roorda, TRR 1831 (2003); Auld & Mohammadian, TR-A 46(8) (2012); Mohammadian & Doherty,
TR-A 40 (2006); Arentze & Timmermans TR-B 43(2) (2009); Nijland, Arentze & Timmermans,
Transportation 39 (2012); Joh, Arentze & Timmermans, Aurora (2003-2009); Bhat et al., CEMDAP
(2004); Recker, TR-B 29(1) (1995); Ectors et al., Transportation 46 (2019) and TRR 2676(4) (2022).

Time use: Lesnard, Sociological Methods and Research 38 (2010) and eIJTUR (2004), AJS (2008);
Richardson, Thomson & Infield, Energy and Buildings 40 (2008); Dube et al., arXiv 2509.18414;
Wang & Osaragi, Travel Behaviour and Society (2023); Lund, Gouripeddi & Facelli, OJPHI (2020);
Schlich & Axhausen, Transportation 30 (2003); Presser, *Working in a 24/7 Economy* (2003);
Voorpostel, van der Lippe & Gershuny, J Leisure Res (2009); USDA ERS ATUS Eating and Health
module; EFCOVAL and EPIC meal-timing studies.

Body: Borbély 1982, Daan, Beersma & Borbély 1984, Borbély et al. J Sleep Res 2016; Roenneberg et
al. Sleep Med Rev 2007; Wittmann et al. Chronobiol Int 2006; Kantermann et al. Current Biology
2007; Tassi & Muzet 2000; Hilditch & McHill 2020; Van Dongen et al. Sleep 2004; Bei et al. Sleep
Med Rev 2016; LeSauter et al. 2009; Mistlberger 2013; Chan & Ryan IJERPH 2009.

Attention: Barabási, Nature 435 (2005); Malmgren et al., PNAS 105 (2008); Kooti et al., WWW 2015
(arXiv 1504.00704); Andrews et al., PLoS ONE 2015; Pielot et al., CHI 2014; Fogarty et al., TOCHI
2005; Horvitz & Apacible, ICMI 2003; Mehrotra et al., UbiComp 2016; Masuda et al., 2013 (arXiv
1205.5109); Song et al., Nature Physics 2010; Schneider et al., J R Soc Interface 2013.

Games and interactive narrative: Forbus & Wright, *Some Notes on Programming Objects in The Sims*;
Sims 4 commodity documentation (lot51.cc); Dwarf Fortress wiki, Need and Historical figure;
RimWorld joy blog and Recreation wiki; Oxygen Not Included wiki, Cycles; Ultima VII SCHEDULE.DAT
(Ultima Codex); Gothic TA_ routines; UESP, How Are Packages Evaluated and Package (Form); Stardew
Valley wiki, Modding:Schedule data; CD Projekt REDkit communities; S.T.A.L.K.E.R. A-Life
(gamedeveloper.com); Dragert, *Census*, GDC 2021; Orkin, *Three States and a Plan*, GDC 2006;
Kelly, Botea & Koenig, AIIDE 2008; Mark, *Behavioral Mathematics for Game AI* (2009) and
gameai.com/iaus; Evans & Short, *Versu*, IEEE TCIAIG 2014; McCoy et al., CiF/Prom Week, AIIDE 2011;
Ryan et al., *Talk of the Town*, Game AI Pro 3 ch. 37 and Ryan's dissertation (eScholarship
1340j5h2); Short, *Beyond Branching* (2016).

Generative agents and deep models: Park et al., UIST 2023 (arXiv 2304.03442); Wang, Chiu & Chiu,
*Humanoid Agents* (arXiv 2310.05418); Kaiya et al., *Lyfe Agents* (arXiv 2310.02172); Wang et al.,
*D2A*, ICLR 2025 (arXiv 2412.06435); LLMob, NeurIPS 2024; AgentSociety (arXiv 2502.08691);
MobileCity (arXiv 2504.16946); Shone & Hillel (arXiv 2501.10221, 2512.04223); Liao et al., *Deep
Activity Model* (arXiv 2405.17468); Yuan et al., SAND, WWW 2023; Liu et al. (arXiv 2409.17495);
*Generating Individual Travel Diaries Using LLMs* (arXiv 2509.09710).
