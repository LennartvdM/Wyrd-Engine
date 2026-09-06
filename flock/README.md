# flock

flock simulates a population of synthetic people, each with a sleep rhythm, a job or not, a
household, meals, standing habits and free time, minute by minute over weeks.  Everything a person
does is logged as contiguous segments, and weeks are planned two weeks ahead so calendars can be
read before they happen.  Agents observe people, ask them questions, request free slots and send
invites, and get replies delayed by what the person is doing and how often they were pinged.

## Commands

    python -m flock day --person 17 --day tue        # one person's day (ids are 1-based)
    Tue  person 17
     21:29-04:02  sleep     home
     04:02-04:40  wash      home
     04:40-05:17  tv        home
     05:17-05:33  commute   transit
     05:33-05:45  snack     work
     05:45-06:40  work      work     focused
     ...

    python -m flock histogram --day weekday          # a letter per 2 % of person-minutes
    07  SSSSSSSSSSSSSSSSSSSSHHHHHHHHHHHHHHHHEEEKCCCWWWWWWO

    python -m flock checks --seed 1 --people 400 --weeks 4
    ok   1a weeknight sleep median h                             8.100  [7.6, 8.7]
    ...
    53/53 checks pass

    python -m flock demo-swarm --seed 1 --people 60   # three agents over two days, one line each
    Tue 09:00  scout   person  1: sleep         home    until 10:10, interruptible 0.00, with -, next commitment Tue 19:54, free Tue 11:27-19:54 home
    Tue 09:00  scout   person  2: chores        home    until 10:21, interruptible 0.70, with -, next commitment Tue 18:46, free Tue 09:00-18:46 home
    Tue 09:00  booker  person  2: offers Tue 10:11-10:56 out
    ...
    71 pings sent, 71 replies

## In the browser

The same package runs in the browser under Pyodide, at `web/flock/`.  `web/flock/bridge.py`
is the only browser-specific Python: it builds a world, keeps it, and turns segments,
observations and checks into plain dicts for the page.  Nothing in `flock/` knows about the
browser.

    node scripts/build_pyodide_manifest.mjs     # copies flock/*.py to web/py/ and hashes them
    cd web && python -m http.server 8000        # then open /flock/

Four views: one person's day and week, the population's day by hour, what an agent sees
(on its own world, since a ping splits the activity it interrupts), and the checks.  The
Pyodide runtime comes from a CDN; `?pyodide=<base-url>` points it at a self-hosted copy.

## Agent API

    from flock import World, Slot
    from flock.clock import DAY

    world = World(seed=1, n=200)                    # people are 1..200
    t = DAY + 9 * 60                                # minutes since Monday 00:00; Tue 09:00
    world.run_until(t)
    o = world.observe(17, t)                        # activity, place, since, expected_end, interruptible,
                                                    # with_ids, next_commitment_start, next_free_window
    world.ping(17, t, "asker", "question")          # -> PingHandle(ping_id, sent_at, ignored)
    slots = world.request_slot(17, t, 45, (t + 60, t + DAY), place="out")   # up to 3 Slots, no booking
    world.ping(17, t, "booker", "invite", slots[0])                        # or a (start, end, place) tuple
    world.run_until(t + DAY)
    for r in world.replies("booker", t):            # Reply(ping_id, person, delivered_at, decision, counter, agent_id, reason)
        print(r.person, r.decision, r.counter)      # decision: answered | accept | decline | counter
                                                    # reason (declines): asleep | busy | too_late | too_far | declined

Calls take the current time (`t == world.now`); ids outside `1..n`, a malformed slot or window, a
duration under a minute, an inverted window or an unknown place raise `ValueError` at the call, and
`run_until` takes a whole number of minutes and never moves backwards.  Person ids are 1-based in
every call and reply; `world.people`, `Commitment.with_ids` and `world.pings[i].person` are 0-based
inside.  A reply is computed when it is delivered, not when the ping is sent, and every reply is a
short phone call in the person's log; an accepted invite becomes an `appointment` at the slot and
drops the person's own habits it overlaps; an invite over sleep, over anything shared (work,
meetings, household dinners, cooking, dishes, outings, errands) or another appointment, one the
person could no longer set off for in time, or one past the two planned weeks
(`world.planned_until`) is declined with a reason, and with a counter slot when one fits (never the
refused slot; at the invite's place, else at `out`).  An offer or counter needs a free gap of
`duration + 2 x (trip + 5)` minutes inside the planned weeks, the trip measured from home (from
where the person is, for a gap open now): the pad is `commute + 5` at `work`, 25 at `out`, 5 at
`home`.  Offers start at least 30 minutes after the reply the person would give now (the fixed wait
for a running commute, meeting or wash, plus three times the mean of the random part), so a first
offer invited straight back is reachable on all but a few per cent of replies (`NOTES.md` counts
them).  Offers and counters are not held: a later invite is judged at delivery, so two agents can be
offered the same hour.  An agent whose pings come under six hours apart gets eight answers and then
silence (`PingHandle.ignored` says so at the call); a ping that lands on sleep or a meeting counts
as three, once per such activity.

## Day-to-day variation

Nobody keeps the same minutes twice.  Each morning a person draws the margin they leave themselves
before setting off, and a journey can run long (a hold-up on about one trip in twelve), so the same
person's arrival at work varies with a standard deviation of about 9 minutes across a month, and a
population's morning ramp is a smooth rise rather than a set of spikes at the workplace start
times.  This matters for what the package is for: an agent tested against people who arrive at the
same minute every day learns a schedule that no real population has.

## Determinism

Every person, household, workplace and reply has its own random stream keyed by the seed and
its id, so the same seed gives byte-identical logs.  Adding person n+1 in a new household and
workplace leaves persons 1..n unchanged.  Pings only draw from their own stream, so questions
to one person change nobody else's log, and only split that person's activities around the
phone calls.  Time is an integer minute count from Monday 00:00 of week 1; nothing is modular.

## Not modelled

No children, illness, holidays, weather, transport modes or money; no naps; no caring bucket (its
minutes sit in `personal`; shopping is `errands` and the weekly `shop` habit); travel is one trait
per person to work and a flat 20 minutes to anywhere else; agents cannot be seen by people, and
people only meet inside commitments and at the household table (housemates join each other's lunch
and dinner at run time; two people watching tv in the same room carry no `with_ids`).  The realism
checks (`checks`) are the only claims made about the numbers, and `NOTES.md` lists the seeds and
population sizes on which they fail.
