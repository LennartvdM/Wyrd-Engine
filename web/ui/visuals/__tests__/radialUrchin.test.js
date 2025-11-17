import test from 'node:test';
import assert from 'node:assert/strict';
import { createBalanceHistoryEntry } from '../RadialUrchin.js';

test('createBalanceHistoryEntry uses lossless totals for MK2.1 schedules', () => {
  const schedule = {
    metadata: { engine_version: 'mk2_1' },
    events: [
      { label: 'Sleep', minute_range: [0, 420] },
      { label: 'Work', minute_range: [480, 960] },
      { label: 'Sleep', minute_range: [1440, 1860] },
      {
        label: 'Night Shift',
        day_index: 2,
        start_minutes: 1320,
        end_minutes: 60,
        duration_minutes: 180,
      },
      {
        label: 'Lunch',
        day: 'thursday',
        start: '12:00',
        end: '13:30',
        duration_minutes: 90,
      },
    ],
  };

  const entry = createBalanceHistoryEntry(schedule);
  assert.ok(entry);
  assert.equal(entry.variant, 'mk2_1');
  assert.equal(entry.totalMinutes, 1590);

  const sleep = entry.activities.find((activity) => activity.label === 'Sleep');
  const work = entry.activities.find((activity) => activity.label === 'Work');
  const nightShift = entry.activities.find((activity) => activity.label === 'Night Shift');
  const lunch = entry.activities.find((activity) => activity.label === 'Lunch');

  assert.ok(sleep);
  assert.ok(work);
  assert.ok(nightShift);
  assert.ok(lunch);
  assert.equal(sleep.minutes, 840);
  assert.equal(work.minutes, 480);
  assert.equal(nightShift.minutes, 180);
  assert.equal(lunch.minutes, 90);
});

test('createBalanceHistoryEntry preserves legacy MK2 aggregation when requested', () => {
  const longEvent = {
    label: 'Sabbatical',
    minute_range: [0, 15000],
    start: '00:00',
    end: '00:00',
  };
  const anchorEvent = {
    label: 'Work',
    start: '01:00',
    end: '02:00',
  };

  const mk2Entry = createBalanceHistoryEntry(
    { events: [longEvent, anchorEvent] },
    { variant: 'mk2' }
  );
  assert.ok(mk2Entry);
  assert.equal(mk2Entry.variant, 'mk2');
  const mk2Activity = mk2Entry.activities.find((activity) => activity.label === 'Sabbatical');
  assert.ok(mk2Activity);
  assert.equal(mk2Activity.minutes, 0);
  assert.equal(mk2Entry.totalMinutes, 60);

  const mk21Entry = createBalanceHistoryEntry({ metadata: { engine_version: 'mk2_1' }, events: [longEvent, anchorEvent] });
  assert.ok(mk21Entry);
  assert.equal(mk21Entry.variant, 'mk2_1');
  const mk21Activity = mk21Entry.activities.find((activity) => activity.label === 'Sabbatical');
  assert.ok(mk21Activity);
  assert.equal(mk21Activity.minutes, 15000);
  assert.equal(mk21Entry.totalMinutes, 15060);
});
