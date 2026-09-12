import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDraft, isInPeriod, periodKey, readPeriodDraft, savePeriodDraft } from './selectionSession.js';

const policy = {
  start_date: '2026-09-14', end_date: '2026-09-18',
  carryover_coupons: [{ id: 7 }, { id: 8 }],
};
const current = '2026-09-14-LUNCH';
const old = '2026-06-01-DINNER';
const legacy = {
  lastCode: 'student-a', phone: '01000000000',
  selections: { 'student-a': { [old]: 'EXTRA', [current]: 'BASE' }, 'student-b': { [current]: 'EXTRA' } },
  coupons: { 'student-a': { [old]: 8, [current]: 7 } },
};

test('legacy migration keeps current selections and coupons, excluding previous dates', () => {
  const before = structuredClone(legacy);
  const draft = readPeriodDraft(legacy, 'student-a', policy);
  assert.deepEqual(draft, { selected: { [current]: 'BASE' }, coupons: { [current]: 7 } });
  const saved = savePeriodDraft(legacy, 'student-a', policy, draft);
  assert.deepEqual(legacy, before);
  assert.deepEqual(saved.selections, before.selections);
  assert.deepEqual(saved.coupons, before.coupons);
  assert.equal(saved.phone, before.phone);
});

test('a new period starts empty, even if its dates overlap the previous period', () => {
  const draft = readPeriodDraft(legacy, 'student-a', policy);
  const saved = savePeriodDraft(legacy, 'student-a', policy, draft);
  const next = { ...policy, end_date: '2026-09-25' };
  assert.deepEqual(readPeriodDraft(saved, 'student-a', next), { selected: {}, coupons: {} });
  assert.deepEqual(readPeriodDraft(saved, 'student-a', policy), draft);
});

test('extending the application deadline preserves the current draft', () => {
  const extended = { ...policy, application_end_at: '2026-09-13T23:59' };
  assert.equal(periodKey(extended), periodKey(policy));
});

test('reset clears only the current draft; coupons, other students and other periods survive', () => {
  const policyBefore = structuredClone(policy);
  const next = { ...policy, start_date: '2026-09-21', end_date: '2026-09-25' };
  const draft = readPeriodDraft(legacy, 'student-a', policy);
  let saved = savePeriodDraft(legacy, 'student-a', policy, draft);
  saved = savePeriodDraft(saved, 'student-a', next, { selected: { '2026-09-21-LUNCH': 'BASE' }, coupons: {} });
  saved = savePeriodDraft(saved, 'student-a', policy, { selected: {}, coupons: {} });
  assert.deepEqual(readPeriodDraft(saved, 'student-a', policy), { selected: {}, coupons: {} });
  assert.deepEqual(readPeriodDraft(saved, 'student-b', policy).selected, { [current]: 'EXTRA' });
  assert.deepEqual(readPeriodDraft(saved, 'student-a', next).selected, { '2026-09-21-LUNCH': 'BASE' });
  assert.deepEqual(policy, policyBefore);
  assert.deepEqual(filterDraft(draft, policy), draft); // the same coupon can be applied again
});

test('stale, duplicate and unselected coupon assignments cannot reserve a coupon', () => {
  const dinner = '2026-09-14-DINNER';
  const draft = filterDraft({
    selected: { [current]: 'BASE', [dinner]: true, [old]: 'EXTRA', invalid: 'BASE' },
    coupons: { [old]: 8, [current]: 7, [dinner]: 7, '2026-09-15-LUNCH': 8 },
  }, policy);
  assert.deepEqual(draft.selected, { [current]: 'BASE', [dinner]: true });
  assert.deepEqual(draft.coupons, { [current]: 7 });
});

test('period boundaries are inclusive and old/future carryover dates are excluded', () => {
  assert.equal(isInPeriod('2026-09-14', policy), true);
  assert.equal(isInPeriod('2026-09-18', policy), true);
  assert.equal(isInPeriod('2026-06-01', policy), false);
  assert.equal(isInPeriod('2026-09-21', policy), false);
  assert.equal(isInPeriod('2026-09-14', null), false);
});
