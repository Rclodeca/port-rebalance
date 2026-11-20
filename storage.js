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

export function getPortfolio(store, id) {
  return {
    holdings: {},
    cash: 0,
    last_rebalanced: null,
    state_at_last_rebalance: null,
    ...(store.portfolios[id] || {}),
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
