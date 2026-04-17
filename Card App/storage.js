const STORAGE_KEY = "sports-card-scanner-mvp-web/v2";
const SAVE_TIMEOUT_MS = 80;

const defaultState = {
  catalogCards: [],
  scanSessions: [],
  collectionCards: [],
  priceSnapshots: [],
  correctionEvents: [],
  appSettings: {
    lastCatalogImportAt: null,
    lastScanMode: "page",
  },
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

let pendingState = null;
let saveScheduled = false;

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneDefaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaultState(),
      ...parsed,
      appSettings: {
        ...cloneDefaultState().appSettings,
        ...(parsed.appSettings || {}),
      },
    };
  } catch (error) {
    console.warn("Failed to load saved state. Starting fresh.", error);
    return cloneDefaultState();
  }
}

export function saveState(state) {
  pendingState = state;
  if (saveScheduled) {
    return;
  }

  saveScheduled = true;
  scheduleSaveFlush();
}

export function resetCatalog(state) {
  state.catalogCards = [];
  state.appSettings.lastCatalogImportAt = null;
  saveState(state);
}

export function resetCollection(state) {
  state.collectionCards = [];
  state.priceSnapshots = [];
  saveState(state);
}

export function resetSessions(state) {
  state.scanSessions = [];
  saveState(state);
}

export function createId(prefix) {
  const randomPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${randomPart}`;
}

export function latestSession(state) {
  return state.scanSessions[state.scanSessions.length - 1] || null;
}

function scheduleSaveFlush() {
  const flush = () => {
    saveScheduled = false;
    const snapshot = pendingState;
    pendingState = null;

    if (!snapshot) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Could not save the latest app state.", error);
    }

    if (pendingState) {
      saveScheduled = true;
      scheduleSaveFlush();
    }
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(flush, { timeout: SAVE_TIMEOUT_MS });
    return;
  }

  window.setTimeout(flush, SAVE_TIMEOUT_MS);
}
