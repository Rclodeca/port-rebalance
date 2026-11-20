// Holdings persistence. Everything stays in this browser's localStorage;
// every accessor tolerates missing, corrupt or blocked storage.

export const STORE_KEY = 'port-rebalance:v1';

const emptyStore = () => ({ portfolios: {}, selected: null });

export function loadStore(storage) {
  try {
    const raw = storage && storage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.portfolios !== 'object') {
      return emptyStore();
    }
    return { portfolios: data.portfolios || {}, selected: data.selected ?? null };
  } catch {
    return emptyStore();
  }
}

export function saveStore(storage, store) {
  try {
    storage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

const isCount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isPlainObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// Saved entries are validated field by field, so one bad value (a hand-edited
// or older store) can't blank the page or turn cash into string concatenation.
export function getPortfolio(store, id) {
  const raw = isPlainObject(store.portfolios[id]) ? store.portfolios[id] : {};
  const holdings = {};
  if (isPlainObject(raw.holdings)) {
    for (const [t, n] of Object.entries(raw.holdings)) if (isCount(n)) holdings[t] = n;
  }
  return {
    holdings,
    cash: isCount(raw.cash) ? raw.cash : 0,
    last_rebalanced: typeof raw.last_rebalanced === 'string' ? raw.last_rebalanced : null,
    state_at_last_rebalance: typeof raw.state_at_last_rebalance === 'string' ? raw.state_at_last_rebalance : null,
  };
}

export function withPortfolio(store, id, patch) {
  return {
    ...store,
    portfolios: { ...store.portfolios, [id]: { ...getPortfolio(store, id), ...patch } },
  };
}

export function applyPlan(store, id, plan, state, isoDate) {
  return withPortfolio(store, id, {
    holdings: { ...plan.newHoldings },
    cash: Math.round(plan.leftoverCash * 100) / 100,
    last_rebalanced: isoDate,
    state_at_last_rebalance: state,
  });
}
