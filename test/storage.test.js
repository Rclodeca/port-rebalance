import test from 'node:test';
import assert from 'node:assert/strict';
import { STORE_KEY, loadStore, saveStore, getPortfolio, withPortfolio, applyPlan } from '../storage.js';

function fake(initial) {
  const m = new Map(initial === undefined ? [] : [[STORE_KEY, initial]]);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
const EMPTY = { portfolios: {}, selected: null };

test('missing -> empty store', () => assert.deepEqual(loadStore(fake()), EMPTY));
test('corrupt JSON -> empty store', () => assert.deepEqual(loadStore(fake('{oops')), EMPTY));
test('wrong shape -> empty store', () => assert.deepEqual(loadStore(fake('[1,2]')), EMPTY));
test('throwing storage -> empty store, save false', () => {
  assert.deepEqual(loadStore(throwing), EMPTY);
  assert.equal(saveStore(throwing, EMPTY), false);
});
test('null storage -> empty store', () => assert.deepEqual(loadStore(null), EMPTY));

test('round trip', () => {
  const s = fake();
  const store = withPortfolio({ ...EMPTY, selected: 'haa' }, 'haa', { holdings: { BIL: 4 }, cash: 3 });
  assert.equal(saveStore(s, store), true);
  assert.deepEqual(loadStore(s), store);
});

test('getPortfolio defaults for unknown id', () => {
  assert.deepEqual(getPortfolio(EMPTY, 'nope'),
    { holdings: {}, cash: 0, last_rebalanced: null, state_at_last_rebalance: null });
});

test('withPortfolio does not mutate', () => {
  const before = structuredClone(EMPTY);
  withPortfolio(before, 'x', { cash: 1 });
  assert.deepEqual(before, EMPTY);
});

test('applyPlan records holdings, cash, state, date', () => {
  const s = applyPlan(loadStore(fake()), 'sp_stair',
    { newHoldings: { VOO: 3 }, leftoverCash: 12.345, trades: [], notes: [] }, 'partial', '2026-11-20');
  assert.deepEqual(getPortfolio(s, 'sp_stair'),
    { holdings: { VOO: 3 }, cash: 12.35, last_rebalanced: '2026-11-20', state_at_last_rebalance: 'partial' });
});

test('getPortfolio sanitizes a malformed saved entry', () => {
  const store = { portfolios: { haa: { holdings: null, cash: '100' }, tri: { holdings: { A: 3, B: -2, C: 'x', D: 1.5 }, cash: -4 } }, selected: 'haa' };
  assert.deepEqual(getPortfolio(store, 'haa').holdings, {});
  assert.equal(getPortfolio(store, 'haa').cash, 0);
  assert.deepEqual(getPortfolio(store, 'tri').holdings, { A: 3, D: 1.5 });
  assert.equal(getPortfolio(store, 'tri').cash, 0);
});

test('getPortfolio tolerates a non-object entry', () => {
  assert.deepEqual(getPortfolio({ portfolios: { x: 'junk' }, selected: null }, 'x').holdings, {});
});
