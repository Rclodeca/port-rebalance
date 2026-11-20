import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planInitial, planAddFunds, planFullRebalance, missingPrices, MissingPriceError,
} from '../rebalance.js';

const round2 = (n) => Math.round(n * 100) / 100;

test('initial invest: floors then greedy', () => {
  const p = planInitial({ targets: { A: 0.7, B: 0.2, C: 0.1 }, prices: { A: 100, B: 30, C: 7 }, amount: 1000 });
  assert.deepEqual(p.newHoldings, { A: 7, B: 6, C: 15 });
  assert.equal(round2(p.leftoverCash), 15);
  assert.ok(p.trades.every((t) => t.action === 'BUY'));
});

test('initial invest: nothing affordable', () => {
  const p = planInitial({ targets: { A: 1 }, prices: { A: 500 }, amount: 100 });
  assert.deepEqual(p.trades, []);
  assert.equal(p.leftoverCash, 100);
});

test('add funds: buy-only, scaled deficits, non-target untouched', () => {
  const p = planAddFunds({
    targets: { A: 0.5, B: 0.5 }, holdings: { A: 10, Z: 3 },
    prices: { A: 10, B: 10, Z: 10 }, cash: 0, amount: 100,
  });
  assert.deepEqual(p.newHoldings, { A: 11, B: 9, Z: 3 });
  assert.ok(p.trades.every((t) => t.action === 'BUY'));
  assert.ok(p.notes.some((n) => n.startsWith('Z ')));
});

test('add funds: includes saved leftover cash', () => {
  const p = planAddFunds({ targets: { A: 1 }, holdings: { A: 1 }, prices: { A: 10 }, cash: 5, amount: 15 });
  assert.deepEqual(p.newHoldings, { A: 3 });
  assert.equal(round2(p.leftoverCash), 0);
});

test('full rebalance: state change sells dropped fund', () => {
  const p = planFullRebalance({ targets: { X: 1 }, holdings: { Y: 10 }, prices: { X: 50, Y: 20 }, cash: 5 });
  assert.deepEqual(p.trades.map((t) => [t.action, t.ticker, t.shares]), [['SELL', 'Y', 10], ['BUY', 'X', 4]]);
  assert.deepEqual(p.newHoldings, { X: 4 });
  assert.equal(round2(p.leftoverCash), 5);
});

test('full rebalance: already on target -> no trades', () => {
  const p = planFullRebalance({ targets: { A: 0.5, B: 0.5 }, holdings: { A: 5, B: 5 }, prices: { A: 10, B: 10 }, cash: 0 });
  assert.deepEqual(p.trades, []);
});

test('full rebalance: trims overweight and buys underweight', () => {
  const p = planFullRebalance({ targets: { A: 0.5, B: 0.5 }, holdings: { A: 15, B: 5 }, prices: { A: 10, B: 10 }, cash: 0 });
  assert.deepEqual(p.trades.map((t) => [t.action, t.ticker, t.shares]), [['SELL', 'A', 5], ['BUY', 'B', 5]]);
});

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

test('never overspends (seeded random)', () => {
  const rnd = lcg(42);
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  for (let i = 0; i < 300; i++) {
    const n = int(2, 10);
    const tickers = Array.from({ length: n + 2 }, (_, k) => `T${k}`);
    const prices = Object.fromEntries(tickers.map((t) => [t, round2(1 + rnd() * 899)]));
    const raw = tickers.slice(0, n).map(() => rnd() + 0.01);
    const sum = raw.reduce((a, b) => a + b, 0);
    const targets = Object.fromEntries(tickers.slice(0, n).map((t, k) => [t, raw[k] / sum]));
    const holdings = Object.fromEntries(tickers.filter(() => rnd() < 0.5).map((t) => [t, int(0, 40)]));
    const cash = round2(rnd() * 500);
    const amount = int(50, 50000);
    const value = (h) => Object.entries(h).reduce((a, [t, s]) => a + s * prices[t], 0);
    const cases = [
      [planInitial({ targets, prices, amount }), {}, amount],
      [planAddFunds({ targets, holdings, prices, cash, amount }), holdings, cash + amount],
      [planFullRebalance({ targets, holdings, prices, cash }), holdings, cash],
    ];
    for (const [plan, before, available] of cases) {
      const spentNet = value(plan.newHoldings) - value(before);
      assert.ok(spentNet <= available + 1e-6, `overspent case ${i}`);
      assert.ok(plan.leftoverCash >= -1e-6, `negative leftover case ${i}`);
      assert.ok(Math.abs(plan.leftoverCash - (available - spentNet)) < 1e-6, `cash mismatch case ${i}`);
      for (const s of Object.values(plan.newHoldings)) assert.ok(Number.isInteger(s) && s > 0);
    }
  }
});

test('missing price blocks with named tickers', () => {
  assert.throws(
    () => planFullRebalance({ targets: { A: 1 }, holdings: { Q: 5 }, prices: { A: 10 }, cash: 0 }),
    (e) => e instanceof MissingPriceError && e.missing.join() === 'Q',
  );
  assert.deepEqual(missingPrices(['A', 'B', 'C'], { A: 1, B: 0 }), ['B', 'C']);
});
