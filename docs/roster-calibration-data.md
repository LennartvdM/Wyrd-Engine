# Real-world data to tare the roster generator against

Companion to `roster-generation-research.md`.  That note lists mechanisms; this one lists the
empirical data each mechanism can be calibrated to, how to get it, and what new checks it would
support.  Written October 2026.  Hosts marked *blocked* could not be opened from the session
sandbox, so their details come from search snippets and secondary sources and should be confirmed
on first download; items marked *(verify)* are specific numbers in that position.

## 1. What flock is tared against today, and the gap

The 52 checks in `flock/report.py` compare the population to figures copied by hand from ATUS
summary tables: median sleep, work, leisure, household and eating minutes per employed weekday,
participation rates, the share of commuters leaving 06:00-08:29, the share at work at 11:00, the
eating peak bin.  These are **daily totals and a few point-in-time shares**.  They say nothing
about the *shape* of a day: how long an activity runs, what follows what, who is present, where it
happens, how one person's Tuesday differs from their Wednesday.  That is exactly where the notes
admit the generator shuffles rather than settles, and it is where the richer mechanisms would
change the output.  Every data source below adds a shape measurement the totals cannot see.

## 2. Sources by what they tare

### 2.1 Tempograms: the share of the population in each activity per ten-minute slot

This is the cheapest large step up, and the one Dutch source is free and machine-readable.

- **Eurostat HETUS daily-rhythm tables** (`tus_00startime` for the 2000 and 2010 waves,
  `tus_20startime` for the 2020 wave; the Netherlands is in the 2010 wave through the Dutch
  TBO 2011, and has 2020 metadata).  Participation rate in the main activity by sex per ten-minute
  slot, 144 slots, by country.  Free, CC BY 4.0, TSV/CSV/SDMX from the Eurostat data browser and
  REST API (`https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/tus_00startime?format=TSV`),
  mirrored on db.nomics.world with a JSON API.  The exact dataset codes were seen only on mirrors
  and should be confirmed in the browser *(verify)*.  Companion tables `tus_00week` (by day of
  week) and `tus_00selfstat` (by labour status) split the totals the way checks 7 and 8 already do.
  *blocked here*
- **BLS ATUS Table A-3**, "Percent of the population engaging in selected activities by time of
  day", hourly, weekday and weekend, single years 2021-2025 and pooled five-year files back to
  2003.  HTML and PDF only, so it is copied by hand once.  *blocked here*
- **SCP "Een week in kaart" / "Time use in the Netherlands"** (2017, 2019) has daily-rhythm
  charts from TBO 2016, but no machine-readable table was found.

What it tares: the band weights (or, after the redesign, the affordance windows and need
thresholds) per activity class, per weekday and weekend, for a Dutch population instead of a US
one.  New check: summed absolute slot error between flock's `histogram` and the reference
tempogram per activity group, with a bound per group.  `print_histogram` already computes the
flock side at hourly resolution; the reference is a 144-slot table in JSON.

### 2.2 Durations, transitions, where and with whom: episode microdata

- **ATUS raw files** (BLS, public domain, no registration): one 24-hour diary per respondent,
  episodes with minute start and stop, about 400 activity codes, a `TEWHERE` location code
  (home, workplace, someone else's home, restaurant or bar, store, outdoors, car, bus, walking)
  and a **Who file** with one row per co-present person class per episode (alone, spouse, own
  child, housemate, friends, co-workers, customers, neighbours; not asked for sleep and
  grooming).  Yearly files from 2003, about 8-10 thousand diaries a year.  **IPUMS ATUS**
  (atus.ipums.org, free registration, `ipumspy` API) gives the same harmonised across years with
  `ACTIVITY`, `START`, `STOP`, `DURATION`, `WHERE`, `WHO` in one extract.  Microdata may not be
  redistributed; derived aggregates may.  *blocked here*
- **Eating and Health module** (2006-08, 2014-16, 2022-23): secondary eating while doing
  something else, meal preparation, grocery shopping.  **Well-Being module** (2010, 2012, 2013,
  2021): happiness, tiredness and stress for three sampled activities, which is a free source for
  a mood or energy scalar if one is added.
- **MTUS Harmonised Episode Files** (timeuse.org or IPUMS Time Use, free registration): 69
  harmonised activities, episode rows with location and who-present across 100+ surveys,
  including the Netherlands 1975-2005 with **seven diary days per respondent** (NL 2005: 15,428
  diaries, ten-minute slots).
- **HETUS 2010 scientific-use files** (Eurostat microdata access, institutional application,
  free): ten-minute slot microdata for 17 countries including the Netherlands, two diary days
  per person (one weekday, one weekend day), main and secondary activity, location, with whom.
- **UK TUS 2014-15** (UK Data Service SN 8128, free registration and end-user licence): the same
  design, but **every household member aged 8+ keeps a diary**, which is the one open source for
  intra-household coordination (who is home when the other is, who cooks when).

What it tares, from one pandas script over ATUS or MTUS:

- Duration distributions per activity class and start hour (the lognormal medians and sigmas in
  `free_time.py` and the meal lengths in `sleep_and_meals.py` become fitted rather than guessed).
- A **time-of-day transition matrix** (`router[slot_bucket][activity] -> next activity`), the
  reference for a transition-matrix distance check and the input to the Markov-router mechanism.
- **Where by activity** (share of social at someone else's home against a bar against outdoors),
  the reference for the places mechanism.
- **Who-with by activity and hour**: the share of tv, meals, walks and errands done with a
  household member, a friend or alone.  This is the measurement that would catch the "62 % of
  couple evenings side by side with empty `with_ids`" leftover.
- From the seven-day Dutch diaries in MTUS: **within-person variability**, the standard
  deviation of a person's own wake, lunch, dinner and bedtime across the week, and how often the
  same leisure activity repeats on consecutive days.  Check 13b and 13c already measure the flock
  side; they currently have no reference.

### 2.3 Ready-made transition data, no microdata application

- **CREST occupancy model** (Richardson, Thomson and Infield 2008; McKenna, Krawczynski and
  Thomson 2015; CREST Demand Model v2, 2016): Excel workbooks with ten-minute transition
  matrices for the number of active occupants by household size and weekday/weekend, from UK TUS
  2000.  Loughborough repository, free, CC BY.  Occupancy state, not detailed activity, so it
  tares the home/away/asleep envelope per household size.  *blocked here*
- **demod** (EPFL, GPLv3, github.com/epfl-herus/demod): parsed German time-use 2012/13 activity
  transition matrices in several state schemes shipped as numpy arrays, plus loaders for ATUS and
  CREST.  No longer maintained but the data files are there.
- **StROBe** (KU Leuven, github.com/open-ideas/StROBe): occupancy clusters and activity start and
  duration tables from the Belgian TUS 2005 (6,400 persons), ten-minute steps.  Belgium is the
  closest culture to the Netherlands among the open derived sets.

### 2.4 Co-presence and contacts

- **POLYMOD** (Mossong et al. 2008): 7,290 participants and 97,904 contacts in eight countries
  including the Netherlands (about 1,000 Dutch participants, 2006).  Per contact: age, location
  flags (home, work, school, transport, leisure, other), duration class (under 5 minutes to over
  4 hours) and frequency (daily, weekly, monthly, rarer, first time).  Zenodo
  10.5281/zenodo.1043437, CC BY 4.0, plain CSV; also in the R package `socialmixr`.  **CoMix**
  (2020-22) has Dutch waves in the same format on Zenodo.  *blocked here*
- **ESS round 10** and **EU-SILC `ilc_scp09`**: how often people meet friends and family
  (never 2 %, less than monthly 11 %, monthly 10 %, several times a month 23 %, weekly 16 %,
  several times a week 25 %, daily 13 % across ESS countries *(verify)*), by country, age and
  sex.  Free.

What it tares: the friend-graph degree and the per-edge visit need (how many distinct people a
person meets in a day and a week, at which places, for how long), and the share of each day's
waking minutes spent alone, with household, with friends, with colleagues.  New checks: mean
distinct contacts per day by setting against POLYMOD NL; share of leisure minutes with a
non-household person against the ATUS who-file.

### 2.5 Sleep

- **Fischer, Lombardi, Marucci-Wellman and Roenneberg 2017**, PLoS ONE: a table of mid-sleep by
  age group and sex for 53,689 ATUS respondents.  Open access.  The most directly copyable
  chronotype table; it replaces the single `bedtime_minute` draw with a trait that varies by age
  and sex the way the population does.
- **Roenneberg et al. 2019**, Biology 8:54 (open): the MCTQ mid-sleep histogram and the age and
  sex curves; social jetlag of an hour or more for about two thirds of respondents *(verify)*.
  The MCTQ raw database is not public.
- **Walch, Cochran and Forger 2016**, Science Advances (open): ENTRAIN app data, 20 countries
  including the Netherlands (longest planned sleep, about 8 h 12 min *(verify)*); supplementary
  tables give country, age and sex effects on bedtime and wake time.
- **Two-process parameters**: Daan, Beersma and Borbély 1984 (rise time constant 18.2 h, decay
  4.2 h, thresholds about 0.67 and 0.17 normalised *(verify)*); sleep inertia time constants 0.67 h
  and 1.17 h from Jewett et al. 1999.  Copied straight into code.
- **StudentLife** (Dartmouth, open): 48 students over ten weeks with inferred bedtime, wake and
  duration alongside phone lock and unlock events, the only open source that has sleep and phone
  attention on the same people.  Small and a student population, so a sanity check only.
- **NSRR** (sleepdata.org, free registration and data access request): large cohort studies with
  weekday and weekend bed and wake self-reports.

What it tares: checks 1-6 and 13b get age-stratified references; the weekend catch-up (1b, 4,
19) becomes a consequence of chronotype and alarm use that can be compared to social-jetlag
shares rather than tuned by constants.

### 2.6 Meals

- **NHANES What We Eat in America** (CDC, public, no registration, SAS transport files): every
  eating occasion of two recall days has a clock time (`DR1_020`) and an occasion name
  (`DR1_030Z`: breakfast, lunch, dinner, snack, and their Spanish-language variants), about 8-10
  thousand persons per two-year cycle since 2003.  The single best source for a histogram of
  meal and snack start times by occasion, weekday against weekend and age.  *blocked here*
- **RIVM Voedselconsumptiepeiling** factsheets: Dutch breakfast mostly 07:30-09:00, lunch
  12:00-13:00, dinner around 18:00, about nine eating moments a day (three meals and about six
  in-between occasions for adults) *(verify)*.  Aggregates on data.overheid.nl; microdata on
  request.
- **Huseinovic et al. 2019**, Public Health Nutrition (open): median clock time of eleven eating
  occasions by country and sex from EPIC, ten countries including the Netherlands.  One table to
  copy for a `culture` record.

What it tares: `MEAL_MINUTES`, the household dinner minute `N(1110, 45)`, the lunch window, the
snack rule in `snack_due` (NHANES gives the gap between occasions directly, about three hours
between any two and about five and a half between meals *(verify)*), and checks 9a, 16a-c.

### 2.7 Work day and commute

- **ATUS Tables A-4 and A-5**: share of the employed at work at each hour of a weekday, by
  occupation and industry.  Check 18d uses one point of this curve; the whole curve is a
  tempogram for `work`.
- **ACS B08302**, time leaving home for work in 30-minute bins (Census API, open).  `START_MINUTES`
  in `people.py` is already shaped on this; the API gives the current year and any state.
- **CBS StatLine 86254NED** (OData, open): Dutch employed by regular evening, night and weekend
  work (about 23 % regularly outside office hours, 14 % usually on Saturday in 2024 *(verify)*);
  the predecessor 83259NED has shift-work shares back to 2003.  **Eurofound EWCTS 2021**
  microdata at the UK Data Service (21 % do night work).  These tare the seven-day share and the
  roster in `plan_work`.
- **SWAA / WFH Research** (register, CC BY, monthly since 2020): days worked from home per week
  and which weekdays (Friday most common).  `home_days` is a fifth of people with one or two days,
  on random weekdays; the reference says which days.
- **Meeting telemetry**: Reclaim.ai 2024 (about 17 meetings a week attended, mean 51 minutes,
  about 15 hours a week *(verify)*), Microsoft Work Trend Index 2025 (half of meetings 09-11 and
  13-15, Tuesday peak, 60 % ad hoc).  Point estimates for the Poisson rate of 2.5 per member-week
  and the 30/45/60 split in `plan_work`, which are currently guesses; the ad-hoc share is a
  planning-horizon number.

### 2.8 Planning horizons and rescheduling

No microdata is public, but the published tables are enough for a parameter table:

- **Doherty 2005**, TRR 1926, "How far in advance are activities planned?": shares of activities
  that were impulsive, planned the same day, planned earlier in the week, routine, or planned
  far ahead, by activity type, from the one-week CHASE scheduling diaries.  Roughly a third
  impulsive, a fifth same-day, a quarter earlier, the rest routine or long-range *(verify)*.
- **Mohammadian and Doherty 2006**, Transportation Research A 40: the distribution of time
  between planning and execution.
- **Roorda and Miller 2005** and Doherty's rescheduling papers: how often planned activities are
  modified or deleted and by what (shorten, shift, drop).

### 2.9 Attention and replies

- **Kooti et al. 2015** (arXiv 1504.00704, open): median email reply time about 13 minutes for
  teenagers, 16 for 20-35, 24 for 36-50, 47 for over 50; mode about 2 minutes; half within an
  hour, 90 % within two days; faster on mobile; the fraction replied to, not the speed, falls
  with inbox load.
- **Barabási 2005**: reply-time tail exponent about 1.
- **Pielot, Church and de Oliveira 2014**: about 64 notifications a day; median time to attend
  3.5 minutes for messengers at the weekend to 28 minutes for email.  **Pielot et al. 2018**,
  "Dismissed!": 795 thousand notifications from 278 users, median 56 a day, with cumulative
  curves of time to click by category in the paper.  **Andrews et al. 2015**: about 85 phone
  checks a day, half under 30 seconds.
- **Fogarty et al. 2005** and **Horvitz and Apacible 2003**: talking and keyboard use as the
  strongest predictors of non-interruptibility; no activity-to-probability table is published,
  so `INTERRUPTIBLE` stays authored but the ordering can be checked against them.
- **Enron corpus** (open): reply latencies can be recomputed from raw mail if a second
  distribution is wanted.

What it tares: `LATENCY_MEAN` and `WAITS_FOR_END` in `agent_api.py`, and the shape of the reply
distribution (currently exponential; the references are heavy-tailed with a mode of minutes).
Checks 20-22 get references.

### 2.10 Households and the week

- **Lesnard 2008**, AJS (HAL, open): typology of couples' work-day arrangements; about 45-49 % of
  dual-earner couple workdays are both standard daytime *(verify)*.  Tares a household sync class.
- **Family dinner** surveys (Gallup 2013: US parents mean 5.1 nights a week together; Pew: UK
  38 %, Canada 40 % every night).  No Dutch nights-per-week figure was found.  Tares the 85 % and
  70 % posting rates in `plan_household` and check 10.
- **HETUS `tus_00week`** and **ATUS** by day of week: shopping, cleaning and childcare by weekday
  (CBS: Friday and Saturday about half of food spending).  Tares the weekend errands and chores
  weights and any day-of-week need multipliers.
- **CBS ziekteverzuim** (StatLine, open): 5.5 % sickness absence in 2024 by sector; common cold
  two to three episodes a year for adults.  Tares an illness arc.

## 3. How to tare: a reference directory and shape checks

The licences allow derived aggregates in the repository: Eurostat tables are CC BY 4.0, BLS
tables and NHANES are public domain, POLYMOD is CC BY 4.0, and the paper tables are facts.  ATUS,
MTUS and HETUS microdata may not be redistributed, but a transition matrix or a duration quantile
table computed from them may.  So:

1. **`flock/reference/`** holding small JSON tables with a `source` field each: a 144-slot
   tempogram per activity group for weekday and weekend (HETUS NL, with ATUS A-3 as a second
   column), a 24 x 9 x 9 transition table and duration quantiles by activity and hour (derived
   from ATUS), a who-with table by activity (ATUS who-file), contacts by setting (POLYMOD NL),
   meal-occasion start histograms (NHANES), the Fischer mid-sleep table, the Doherty horizon
   table, the Kooti reply quantiles, the CBS shift-work shares.  Checks then read a file instead
   of a literal, and the literal's provenance stops living in a comment.
2. **Shape checks** in `report.py`, each a distance with a bound: tempogram slot error per
   group; transition-matrix distance against the reference router; duration quantile error per
   activity; who-with shares; contacts per day by setting; within-person wake and dinner
   standard deviation against the seven-day Dutch diaries; chain-rank histogram against a Zipf
   fit (Ectors 2019); reply-time quantiles.  The current 52 stay as the totals layer.
3. **A derivation script** outside the package (`scripts/derive_reference.py`) that takes the
   raw ATUS, NHANES and POLYMOD files from a local directory and writes the JSON, so the tables
   are reproducible and the raw microdata never enters the repo.

Order of value for effort: HETUS tempograms and NHANES meal times first (free, small, Dutch or
directly relevant, and they tare the mechanisms already in the code); then ATUS episodes for
durations, transitions and who-with (free, one script, and it is the reference the need-based
and places mechanisms need before they are tuned); then POLYMOD for the friend graph; then the
MTUS Dutch seven-day diaries for within-person variability; the restricted sets (TBO 2016 via
DANS, HETUS 2010 microdata, MPN) only if the free ones leave a specific question open.

## 4. Caveats

- **One day per person** in ATUS, HETUS tables and NHANES.  Nothing there says how a person's
  Tuesday relates to their Wednesday; only the seven-day Dutch diaries (MTUS NL, TBO) and the
  six-week German travel diaries (Mobidrive, Thurgau, on request from ETH Zürich) do.  Checks
  13b and 13c should be tared on those, not on ATUS.
- **Diary surveys under-record short episodes** (a two-minute phone check, a snack at the desk)
  and **secondary activities** except where a module asks.  A generator that logs every snack
  will show more segments per day than a diary; compare at the diary's resolution, or compare
  only the primary activity.
- **Cultures differ by an hour or more** in meals and bedtime; a Dutch population tared on ATUS
  dinner times is wrong by about half an hour.  Keep the reference tables per country and pick
  one per world.
- **Nothing in these sources was fetched from this sandbox.**  The environment's network policy
  denied bls.gov, ec.europa.eu, zenodo.org, cbs.nl, atusdata.org, cdc.gov and dans.knaw.nl, so
  the derivation has to run on a machine with access, or those hosts have to be added to the
  environment's allowed domains.
