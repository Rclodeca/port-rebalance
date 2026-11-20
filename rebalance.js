// Whole-share rebalance math. Pure functions, no DOM.
//
// targets  {ticker: weight}  weights sum to 1
// holdings {ticker: shares}  may include funds not in targets
// prices   {ticker: price}
//
// Every plan* function returns a Plan:
//   { trades: [{ticker, action: 'BUY'|'SELL', shares, price, amount}],
//     newHoldings: {ticker: shares}, leftoverCash, notes: [string] }

const EPS = 1e-9;

export class MissingPriceError extends Error {
  constructor(missing) {
    super(`Missing price for: ${missing.join(', ')}`);
    this.name = 'MissingPriceError';
    this.missing = missing;
  }
}

export function missingPrices(tickers, prices) {
  return tickers.filter((t) => {
    const p = prices[t];
    return !(typeof p === 'number' && Number.isFinite(p) && p > 0);
  });
}

function heldTickers(holdings) {
  return Object.keys(holdings).filter((t) => holdings[t] > 0);
}

function checkPrices(targets, holdings, prices) {
  const tickers = [...new Set([...Object.keys(targets), ...heldTickers(holdings)])].sort();
  const missing = missingPrices(tickers, prices);
  if (missing.length) throw new MissingPriceError(missing);
}

function value(holdings, prices) {
  return heldTickers(holdings).reduce((sum, t) => sum + holdings[t] * prices[t], 0);
}

// Buy one share at a time of the affordable target fund furthest below its
// target weight, until no affordable fund is still below target. Mutates
// `shares`; returns the cash left.
function greedyFill(shares, targets, prices, total, remaining) {
  for (;;) {
    let best = null;
    let bestScore = 0;
    for (const t of Object.keys(targets).sort()) {
      if (prices[t] > remaining + EPS) continue;
      const score = targets[t] - ((shares[t] || 0) * prices[t]) / total;
      if (score > bestScore + EPS) {
        best = t;
        bestScore = score;
      }
    }
    if (!best) return remaining;
    shares[best] = (shares[best] || 0) + 1;
    remaining -= prices[best];
  }
}

// Buy-only: direct `cash` at the target funds' shortfalls vs. `total`.
function buyFill(targets, holdings, prices, cash) {
  const shares = { ...holdings };
  const total = value(holdings, prices) + cash;
  if (total <= EPS) return { shares, remaining: cash };
  const deficits = {};
  let deficitSum = 0;
  for (const t of Object.keys(targets)) {
    const d = Math.max(0, targets[t] * total - (holdings[t] || 0) * prices[t]);
    deficits[t] = d;
    deficitSum += d;
  }
  const scale = deficitSum > cash ? cash / deficitSum : 1;
  let remaining = cash;
  for (const t of Object.keys(targets)) {
    const n = Math.floor((deficits[t] * scale) / prices[t] + EPS);
    if (n > 0) {
      shares[t] = (shares[t] || 0) + n;
      remaining -= n * prices[t];
    }
  }
  remaining = greedyFill(shares, targets, prices, total, remaining);
  return { shares, remaining };
}

function buildPlan(before, after, prices, leftoverCash, notes = []) {
  const trades = [];
  const tickers = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const t of tickers) {
    const diff = (after[t] || 0) - (before[t] || 0);
    if (diff === 0) continue;
    const shares = Math.abs(diff);
    trades.push({ ticker: t, action: diff > 0 ? 'BUY' : 'SELL', shares, price: prices[t], amount: shares * prices[t] });
  }
  trades.sort((a, b) => (a.action === b.action ? 0 : a.action === 'SELL' ? -1 : 1));
  const newHoldings = {};
  for (const t of Object.keys(after).sort()) if (after[t] > 0) newHoldings[t] = after[t];
  return { trades, newHoldings, leftoverCash: Math.max(0, leftoverCash), notes };
}

export function planInitial({ targets, prices, amount }) {
  checkPrices(targets, {}, prices);
  const { shares, remaining } = buyFill(targets, {}, prices, amount);
  return buildPlan({}, shares, prices, remaining);
}

export function planAddFunds({ targets, holdings, prices, cash, amount }) {
  checkPrices(targets, holdings, prices);
  const { shares, remaining } = buyFill(targets, holdings, prices, cash + amount);
  const notes = heldTickers(holdings)
    .filter((t) => !(t in targets))
    .sort()
    .map((t) => `${t} is not in the current target — run a full rebalance to sell it.`);
  return buildPlan(holdings, shares, prices, remaining, notes);
}

export function planFullRebalance({ targets, holdings, prices, cash }) {
  checkPrices(targets, holdings, prices);
  const total = value(holdings, prices) + cash;
  const shares = {};
  let remaining = total;
  for (const t of Object.keys(targets)) {
    const n = Math.floor((targets[t] * total) / prices[t] + EPS);
    shares[t] = n;
    remaining -= n * prices[t];
  }
  if (total > EPS) remaining = greedyFill(shares, targets, prices, total, remaining);
  return buildPlan(holdings, shares, prices, remaining);
}
