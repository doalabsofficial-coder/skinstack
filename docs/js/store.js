import { createProduct } from './domain/product.js';
import { DEMO_PRODUCTS } from './domain/demo.js';

/*
 * 사용자 데이터는 기기(localStorage)에만 저장합니다.
 * 피부 정보·임신/수유 여부 같은 민감 정보는 서버로 전송하지 않습니다.
 */
const KEY = 'skinstack:v1';

const defaults = () => ({
  version: 1,
  settings: {
    lang: null,
    region: null,
    onboarded: false,
    duplicateAlerts: true,
    showPurchaseLinks: true,
    shareContributions: true, // 확인한 제품 정보(브랜드·제품명·종류·전성분·사용법)를 검색용 누적 데이터로 공유
    notifications: { enabled: false, am: '07:30', pm: '22:00' },
  },
  profile: { skinType: '', sensitivity: '', pregnancy: '', concerns: [] },
  products: [],
  maskPlan: { days: [], picks: {} },
  orderOverrides: {},
  usageLog: [],
  wishlist: [],
  // 사용자가 직접 만든 루틴 (이 기기에만 저장 · 서버 상품 DB와 분리)
  customRoutines: [],
});

let state = defaults();
const listeners = new Set();

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const d = defaults();
      state = { ...d, ...saved, settings: { ...d.settings, ...saved.settings, notifications: { ...d.settings.notifications, ...saved.settings?.notifications } }, profile: { ...d.profile, ...saved.profile }, maskPlan: { ...d.maskPlan, ...saved.maskPlan } };
    }
  } catch {
    state = defaults();
  }
  return state;
}

export const getState = () => state;

let storageOk = true;
export const storageAvailable = () => storageOk;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false; // 사생활 보호 모드 등: 이번 세션 동안만 유지
  }
}

const savers = new Set();
/** 로컬 변경이 저장될 때마다 호출 (기기 간 동기화 업로드용) */
export const onSaved = (fn) => { savers.add(fn); };

function persist() {
  state.meta = { ...state.meta, updatedAt: new Date().toISOString() };
  save();
  savers.forEach((fn) => fn(state));
}

/* ---------- 기기 간 동기화 대상: 피부 정보(profile)와 기기 설정(settings)은 이 기기에만 ---------- */
export const SYNC_KEYS = ['products', 'customRoutines', 'maskPlan', 'usageLog', 'wishlist', 'done', 'orderOverrides'];
export const syncableData = () => Object.fromEntries(SYNC_KEYS.map((k) => [k, state[k]]));

/** 클라우드 데이터를 이 기기에 적용 (업로드를 다시 일으키지 않음) */
export function applyRemote(data, updatedAt, syncUser) {
  for (const k of SYNC_KEYS) if (data?.[k] !== undefined) state[k] = data[k];
  state.meta = { ...state.meta, updatedAt, syncUser };
  save();
  listeners.forEach((fn) => fn(state));
}

/** 이 기기를 특정 계정과 연결했다고 표시 (저장 시각은 바꾸지 않음) */
export function setSyncUser(syncUser) {
  state.meta = { ...state.meta, syncUser };
  save();
}

/** 상태 변경: update(s => { s.x = 1 }) */
export function update(mutator, { silent = false } = {}) {
  mutator(state);
  persist();
  if (!silent) listeners.forEach((fn) => fn(state));
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function upsertProduct(input) {
  update((s) => {
    const i = s.products.findIndex((p) => p.id === input.id);
    if (i >= 0) s.products[i] = { ...s.products[i], ...input, updatedAt: new Date().toISOString() };
    else s.products.push(createProduct(input));
  });
}

export function removeProduct(id) {
  update((s) => {
    s.products = s.products.filter((p) => p.id !== id);
    delete s.orderOverrides[id];
    for (const k of Object.keys(s.maskPlan.picks)) if (s.maskPlan.picks[k] === id) delete s.maskPlan.picks[k];
  });
}

export function logUsage(entry) {
  update((s) => {
    s.usageLog.push({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  });
}

export function loadDemo(region) {
  update((s) => {
    const existing = new Set(s.products.map((p) => `${p.brand}|${p.name}`));
    for (const d of DEMO_PRODUCTS) {
      if (existing.has(`${d.brand}|${d.name}`)) continue;
      s.products.push(createProduct({
        brand: d.brand,
        name: d.name,
        region,
        sheetCount: d.sheetCount ?? null,
        volume: d.volumeText || '',
        pharmaFlag: Boolean(d.pharmaMaker),
        regulatory: d.pharmaMaker ? 'unknown' : undefined,
        dataSource: 'demo',
      }));
    }
  });
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.products)) throw new Error('invalid_backup');
  state = { ...defaults(), ...parsed };
  persist();
  listeners.forEach((fn) => fn(state));
}

export function resetAll() {
  state = defaults();
  persist();
  listeners.forEach((fn) => fn(state));
}
