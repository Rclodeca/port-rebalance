// Lenient money input: "$10k", "10,000", " 2500.50 ". Returns null for
// anything that isn't a positive number.
export function parseMoney(input) {
  if (typeof input !== 'string') return null;
  let s = input.replace(/[$,\s]/g, '');
  let mult = 1;
  if (/[kK]$/.test(s)) {
    mult = 1000;
    s = s.slice(0, -1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s) * mult;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function fmtMoney(n) {
  return USD.format(n);
}
