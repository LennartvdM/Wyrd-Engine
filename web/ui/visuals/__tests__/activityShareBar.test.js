import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareActivityShareSegments } from '../ActivityShareBar.js';

test('prepareActivityShareSegments ignores empty values and normalises percentages', () => {
  const { segments, totalMinutes } = prepareActivityShareSegments([
    { id: 'work', label: 'Work', minutes: 300, color: '#123456' },
    { id: 'sleep', label: 'Sleep', minutes: 420, color: '#654321' },
    { id: 'zero', label: 'Zero', minutes: 0, color: '#000000' },
  ]);

  assert.equal(segments.length, 2);
  assert.equal(totalMinutes, 720);
  const work = segments.find((segment) => segment.id === 'work');
  const sleep = segments.find((segment) => segment.id === 'sleep');
  assert(work);
  assert(sleep);
  assert.ok(Math.abs(work.percentage - 300 / 720) < 1e-9);
  assert.ok(Math.abs(sleep.percentage - 420 / 720) < 1e-9);
});

test('prepareActivityShareSegments returns empty state when no minutes available', () => {
  const { segments, totalMinutes } = prepareActivityShareSegments([
    { id: 'breakfast', label: 'Breakfast', minutes: 0, color: '#fff' },
  ]);
  assert.equal(totalMinutes, 0);
  assert.deepEqual(segments, []);
});
