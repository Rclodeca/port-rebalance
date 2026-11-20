// UI: loads the notifier's published targets/prices, renders holdings vs
// target for the selected portfolio, and turns button presses into plans.

import { planInitial, planAddFunds, planFullRebalance, missingPrices } from './rebalance.js';
import { loadStore, saveStore, getPortfolio, withPortfolio, applyPlan } from './storage.js';
import { parseMoney, fmtMoney } from './money.js';

const DATA_URL = 'https://raw.githubusercontent.com/Rclodeca/letf-lab-standalone/main/notify/state/portfolios.json';
const STALE_DAYS = 4;

// Used only when the data file can't be loaded, so saved holdings stay reachable.
const FALLBACK_PORTFOLIOS = [
  ['sp_stair', 'S&P Stair'], ['haa', 'HAA'], ['triplet', 'Triplet'], ['golden_ratio', 'Golden Ratio'],
  ['static_sso', 'Static SSO'], ['return_stacked', 'Return Stacked'], ['static_tech', 'Static Tech'],
].map(([id, name]) => ({ id, name, state: null, state_label: null, targets: {} }));

const STATE_LABELS = { on: 'Risk-On', partial: 'Partial Risk-Off', off: 'Risk-Off', static: 'Static' };

const storage = (() => {
  try { return window.localStorage; } catch { return null; }
})();

const app = document.getElementById('app');

let data = null;
let fetchError = null;
let store = loadStore(storage);
let priceOverrides = {}; // ticker -> price, this visit only
let current = null; // { kind, plan } awaiting "Mark as done"
let formError = null;
let missing = [];
let amountText = '';
let saveFailed = false;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const today = () => new Date().toLocaleDateString('en-CA');

function portfolios() {
  return data ? data.portfolios : FALLBACK_PORTFOLIOS;
}

function selected() {
  const list = portfolios();
  return list.find((p) => p.id === store.selected) || list[0];
}

function prices() {
  return { ...(data ? data.prices : {}), ...priceOverrides };
}

function persist(next) {
  store = next;
  saveFailed = !saveStore(storage, store);
}

function badgeClass(p) {
  if (p.state === null) return 'none';
  if (p.state in STATE_LABELS) return p.state;
  return 'dynamic';
}

function stateText(p) {
  if (p.state === null) return 'State unavailable';
  if (p.state in STATE_LABELS) return p.state_label || STATE_LABELS[p.state];
  return `${p.state_label || 'Monthly allocation'} · ${p.state}`;
}

function daysOld(isoDate) {
  return Math.floor((new Date(today()) - new Date(isoDate)) / 86400000);
}

function banners(p, saved) {
  const out = [];
  if (fetchError) {
    out.push(['error', `Couldn't load today's targets and prices (${esc(fetchError)}). Holdings are still editable; plans are disabled.`]);
  } else {
    if (data.price_date && daysOld(data.price_date) > STALE_DAYS) {
      out.push(['warn', `Price data is from ${esc(data.price_date)} — the daily update may have stalled. Check prices before trading.`]);
    }
    if (p.state === null) {
      out.push(['error', 'This portfolio\'s rule state is unavailable today, so there is no target. Plans are disabled.']);
    } else if (saved.state_at_last_rebalance && saved.state_at_last_rebalance !== p.state) {
      const was = STATE_LABELS[saved.state_at_last_rebalance] || saved.state_at_last_rebalance;
      out.push(['warn', `Rule state changed since your last rebalance (was <b>${esc(was)}</b> on ${esc(saved.last_rebalanced)}). Run a full rebalance to move to the new target.`]);
    }
  }
  if (saveFailed) out.push(['error', 'Couldn\'t save to this browser\'s storage — changes will be lost on reload.']);
  return out.map(([cls, html]) => `<div class="banner ${cls}">${html}</div>`).join('');
}

function holdingsTable(p, saved, px) {
  const targets = p.targets;
  const held = Object.keys(saved.holdings).filter((t) => saved.holdings[t] > 0);
  const tickers = [...Object.keys(targets), ...held.filter((t) => !(t in targets)).sort()];
  const values = Object.fromEntries(tickers.map((t) => [t, (saved.holdings[t] || 0) * (px[t] || 0)]));
  const total = Object.values(values).reduce((a, b) => a + b, 0) + saved.cash;

  const rows = tickers.map((t) => {
    const w = targets[t] || 0;
    const cur = total > 0 ? values[t] / total : 0;
    const drift = Math.abs((cur - w) * 100) < 0.05 ? 0 : (cur - w) * 100;
    const off = Math.abs(drift) >= 1;
    const priceCls = ['num', t in priceOverrides ? 'edited' : '', missing.includes(t) ? 'missing' : ''].join(' ');
    return `<tr>
      <td>${esc(t)}${t in targets ? '' : '<span class="tag">not in target</span>'}<span class="sub">${fmtMoney(values[t])}</span></td>
      <td><input class="num" type="number" step="1" min="0" inputmode="numeric" data-shares="${esc(t)}" value="${saved.holdings[t] || 0}"></td>
      <td class="${off ? 'cur-off' : ''}">${pct(cur)}</td>
      <td>${pct(w)}</td>
      <td class="wide ${off ? 'drift' : 'muted'}">${drift > 0 ? '+' : ''}${drift.toFixed(1)}</td>
      <td class="wide">${fmtMoney(values[t])}</td>
      <td><input class="${priceCls}" type="number" step="0.01" min="0" inputmode="decimal" data-price="${esc(t)}" value="${px[t] != null ? Number(px[t].toFixed(2)) : ''}" placeholder="price"></td>
    </tr>`;
  }).join('');

  return `<div class="table-scroll"><table>
    <thead><tr><th>Fund</th><th>Shares</th><th>Current</th><th>Target</th><th class="wide">Drift (pts)</th><th class="wide">Value</th><th>Price</th></tr></thead>
    <tbody>
      ${rows || '<tr><td colspan="7" class="muted">No target and no holdings.</td></tr>'}
      <tr><td>Cash</td><td><input class="num" type="number" step="0.01" min="0" inputmode="decimal" data-cash value="${saved.cash}"></td><td>${pct(total > 0 ? saved.cash / total : 0)}</td><td></td><td class="wide"></td><td class="wide">${fmtMoney(saved.cash)}</td><td></td></tr>
      <tr class="total"><td>Total</td><td colspan="3">${fmtMoney(total)}</td><td class="wide"></td><td class="wide"></td><td></td></tr>
    </tbody>
  </table></div>
  <p class="muted small">Price, shares and cash are editable. Edited prices (highlighted) last for this visit only.</p>`;
}

function actions(p, saved) {
  const empty = Object.values(saved.holdings).every((s) => !s) && !saved.cash;
  const disabled = fetchError || p.state === null ? 'disabled' : '';
  const primaryLabel = empty ? 'Initial invest' : 'Add funds';
  return `<div class="actions">
      <input type="text" id="amount" inputmode="decimal" placeholder="${empty ? 'Amount to invest, e.g. 10k' : 'New money, e.g. 2,500'}" value="${esc(amountText)}" ${disabled}>
      <button class="primary" data-action="${empty ? 'initial' : 'add'}" ${disabled}>${primaryLabel}</button>
      ${empty ? '' : `<button data-action="full" ${disabled}>Full rebalance</button>`}
    </div>
    ${formError ? `<p class="error-text">${formError}</p>` : ''}
    ${empty ? '' : '<p class="small"><button class="link" data-action="reset">Start over</button> <span class="muted">clears this portfolio\'s saved holdings and cash</span></p>'}`;
}

function planPanel() {
  if (!current) return '';
  const { plan, kind } = current;
  const title = { initial: 'Initial invest', add: 'Add funds', full: 'Full rebalance' }[kind];
  const rows = plan.trades.map((t) => `<tr>
      <td class="action-${t.action.toLowerCase()}">${t.action}</td><td>${esc(t.ticker)}</td>
      <td>${t.shares}</td><td>${fmtMoney(t.price)}</td><td>${fmtMoney(t.amount)}</td></tr>`).join('');
  return `<section class="card">
    <h2>Plan · ${title}</h2>
    ${plan.trades.length ? `<div class="table-scroll"><table>
      <thead><tr><th>Action</th><th>Fund</th><th>Shares</th><th>Price</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<p class="muted">No trades needed — already as close to target as whole shares allow.</p>'}
    ${plan.notes.length ? `<ul class="notes">${plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p>Leftover cash: <b>${fmtMoney(plan.leftoverCash)}</b></p>
    <div class="actions">
      <button class="primary" data-action="done">Mark as done (save holdings)</button>
      <button data-action="discard">Discard</button>
    </div>
  </section>`;
}

// Re-rendering replaces the inputs, so remember which one had focus (e.g.
// tabbing from one share count to the next) and restore it afterwards.
function focusKey() {
  const el = document.activeElement;
  if (!el || !app.contains(el)) return null;
  if (el.id) return `#${el.id}`;
  for (const attr of ['price', 'shares']) {
    if (el.dataset[attr] !== undefined) return `[data-${attr}="${CSS.escape(el.dataset[attr])}"]`;
  }
  return el.dataset.cash !== undefined ? '[data-cash]' : null;
}

function render() {
  const key = focusKey();
  draw();
  if (key) app.querySelector(key)?.focus();
}

function draw() {
  const p = selected();
  const saved = getPortfolio(store, p.id);
  const px = prices();
  const options = portfolios().map((x) => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');

  app.innerHTML = `
    <h1>Portfolio Rebalancer</h1>
    <section class="card">
      <div class="top">
        <select id="portfolio" aria-label="Portfolio">${options}</select>
        <span class="badge ${badgeClass(p)}">${esc(stateText(p))}</span>
        <span class="muted small">${data ? `Prices as of ${esc(data.price_date || 'n/a')} (close)` : ''}</span>
      </div>
      ${saved.last_rebalanced ? `<p class="muted small">Last rebalanced ${esc(saved.last_rebalanced)}${saved.state_at_last_rebalance in STATE_LABELS && saved.state_at_last_rebalance !== 'static' ? ` in ${esc(STATE_LABELS[saved.state_at_last_rebalance])}` : ''}.</p>` : ''}
    </section>
    ${banners(p, saved)}
    <section class="card">${holdingsTable(p, saved, px)}</section>
    <section class="card">${actions(p, saved)}</section>
    ${planPanel()}`;
}

function clearPlan() {
  current = null;
  formError = null;
  missing = [];
}

function runPlan(kind) {
  const p = selected();
  const saved = getPortfolio(store, p.id);
  const px = prices();
  clearPlan();

  let amount = 0;
  if (kind !== 'full') {
    amount = parseMoney(amountText);
    if (amount === null) {
      formError = 'Enter a positive amount, e.g. 10000, 10,000 or 10k.';
      return render();
    }
  }
  const needed = [...new Set([...Object.keys(p.targets), ...Object.keys(saved.holdings).filter((t) => saved.holdings[t] > 0)])].sort();
  missing = missingPrices(needed, px);
  if (missing.length) {
    formError = `Enter a price for: ${missing.map(esc).join(', ')}`;
    return render();
  }

  const args = { targets: p.targets, holdings: saved.holdings, prices: px, cash: saved.cash, amount };
  const plan = kind === 'initial' ? planInitial(args) : kind === 'add' ? planAddFunds(args) : planFullRebalance(args);
  current = { kind, plan };
  render();
}

app.addEventListener('change', (e) => {
  const el = e.target;
  const p = selected();
  if (el.id === 'portfolio') {
    persist({ ...store, selected: el.value });
    clearPlan();
    amountText = '';
  } else if (el.dataset.price !== undefined) {
    const v = Number(el.value);
    const t = el.dataset.price;
    if (Number.isFinite(v) && v > 0) priceOverrides = { ...priceOverrides, [t]: v };
    else { const { [t]: _, ...rest } = priceOverrides; priceOverrides = rest; }
    if (data && priceOverrides[t] === data.prices[t]) { const { [t]: _, ...rest } = priceOverrides; priceOverrides = rest; }
    clearPlan();
  } else if (el.dataset.shares !== undefined) {
    const n = Math.max(0, Math.floor(Number(el.value) || 0));
    const saved = getPortfolio(store, p.id);
    persist(withPortfolio(store, p.id, { holdings: { ...saved.holdings, [el.dataset.shares]: n } }));
    clearPlan();
  } else if (el.dataset.cash !== undefined) {
    const c = Math.max(0, Math.round((Number(el.value) || 0) * 100) / 100);
    persist(withPortfolio(store, p.id, { cash: c }));
    clearPlan();
  } else {
    return;
  }
  // `change` fires before Tab moves focus; render once focus has landed so
  // focusKey() picks up the field the user tabbed into.
  setTimeout(render, 0);
});

app.addEventListener('input', (e) => {
  if (e.target.id === 'amount') amountText = e.target.value;
});

app.addEventListener('keydown', (e) => {
  if (e.target.id === 'amount' && e.key === 'Enter') {
    const btn = app.querySelector('button.primary[data-action="initial"], button.primary[data-action="add"]');
    if (btn && !btn.disabled) runPlan(btn.dataset.action);
  }
});

app.addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action) return;
  const p = selected();
  if (action === 'initial' || action === 'add' || action === 'full') runPlan(action);
  else if (action === 'discard') { clearPlan(); render(); }
  else if (action === 'done') {
    persist(applyPlan(store, p.id, current.plan, p.state, today()));
    clearPlan();
    amountText = '';
    render();
  } else if (action === 'reset') {
    if (!confirm(`Clear all saved holdings and cash for ${p.name}?`)) return;
    const { [p.id]: _, ...rest } = store.portfolios;
    persist({ ...store, portfolios: rest });
    clearPlan();
    render();
  }
});

async function init() {
  try {
    const resp = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } catch (err) {
    fetchError = err.message || String(err);
  }
  render();
}

init();
