// Persistent progress, stored in localStorage. Every access is guarded so the
// game still runs (without saving) in private windows or when storage is blocked.

const KEY = 'sledmaster.save.v1';

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
    levels: {},
    wingsOwned: [],
    wingEquipped: null,
    best: 0,
    runs: 0,
    totalCoins: 0,
    totalDistance: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const save = { ...defaultSave(), ...data };
    save.levels = { ...(data.levels || {}) };
    save.wingsOwned = Array.isArray(data.wingsOwned) ? data.wingsOwned : [];
    return save;
  } catch {
    return defaultSave();
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // storage unavailable; progress lasts for this session only
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
