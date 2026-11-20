import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, fmtMoney } from '../money.js';

test('parseMoney accepts common formats', () => {
  assert.equal(parseMoney('10,000'), 10000);
  assert.equal(parseMoney('$10k'), 10000);
  assert.equal(parseMoney(' 2500.50 '), 2500.5);
  assert.equal(parseMoney('1.5K'), 1500);
});

test('parseMoney rejects invalid or non-positive', () => {
  for (const bad of ['-5', 'abc', '', '0', '10k5', null, undefined]) assert.equal(parseMoney(bad), null, String(bad));
});

test('fmtMoney formats USD', () => {
  assert.equal(fmtMoney(1234.5), '$1,234.50');
});
