import { categoryById } from './categories.js';
import { detectGroups, hasIngredientData } from './ingredients.js';
import { eligibility, strongActives, useFirstCompare, effectiveExpiry, isMask } from './product.js';
import { checkCombos, considerPairs } from './interactions.js';
import { similarClusters } from './duplicates.js';
import { addDays, weekdayOf } from './dates.js';

/*
 * 루틴 생성 엔진 (보유 제품만 사용).
 * - 사용 순서: 사용자 순서 조정 > 카테고리(제형) 기본 순서 > 제형(texture)
 * - 시간대: 라벨/사용자 입력 > 자극 가능 활성 성분은 저녁 > 카테고리 기본값
 * - 빈도: 라벨/사용자 입력. 자극 가능 활성 성분은 빈도가 입력되지 않으면 루틴에서 제외하고 확인을 요청
 * - 같은 종류가 여러 개면 "먼저 쓸 제품"(개봉·기한 임박·잔량 적음)을 우선
 */
const MAX_TREATMENTS = 2;
const TREATMENT = new Set(['essence', 'serum', 'ampoule', 'spot']);
const TEXTURE_RANK = { water: 0, gel: 1, milk: 2, cream: 3, oil: 4 };
const CONFLICTS = {
  retinoid: ['aha', 'bha', 'benzoyl_peroxide', 'retinoid'],
  aha: ['retinoid', 'aha', 'bha'],
  bha: ['retinoid', 'aha', 'bha'],
  benzoyl_peroxide: ['retinoid'],
  hydroquinone: [],
};

function spread(k, offset) {
  const days = new Set();
  for (let i = 0; i < k; i++) days.add((Math.round((i * 7) / k) + offset) % 7);
  return [...days];
}

function analyze(p) {
  const cat = categoryById(p.category);
  const actives = strongActives(p);
  let slots;
  let slotWhy = null;
  if (p.timeOfUse && p.timeOfUse !== 'auto') {
    slots = p.timeOfUse === 'both' ? ['am', 'pm'] : [p.timeOfUse];
    slotWhy = 'labelTime';
  } else if (actives.length && cat.id !== 'sunscreen') {
    slots = ['pm'];
    slotWhy = 'activePm';
  } else {
    slots = cat.slot === 'both' ? ['am', 'pm'] : [cat.slot];
  }
  const perWeek = isMask(p) ? null : Math.min(7, Math.max(1, Number(p.frequencyPerWeek) || 7));
  return { p, cat, actives, slots, slotWhy, perWeek, days: null };
}

/** 주 n회 제품을 요일에 배치. 서로 자극 가능성이 있는 활성 성분은 다른 날로 분산 */
function assignDays(infos) {
  const dayGroups = Array.from({ length: 7 }, () => []);
  const partial = infos.filter((i) => i.perWeek && i.perWeek < 7)
    .sort((a, b) => (b.actives.some((x) => x.group === 'retinoid') - a.actives.some((x) => x.group === 'retinoid')) || (b.actives.length - a.actives.length) || (a.p.id < b.p.id ? -1 : 1));
  for (const info of partial) {
    const groups = info.actives.map((a) => a.group);
    let best = null;
    for (let offset = 0; offset < 7; offset++) {
      const days = spread(info.perWeek, offset);
      const cost = days.reduce((sum, d) => sum + dayGroups[d].filter((g) => groups.some((x) => CONFLICTS[x]?.includes(g))).length, 0);
      if (!best || cost < best.cost) best = { days, cost };
    }
    info.days = best.days.sort((a, b) => a - b);
    for (const d of info.days) dayGroups[d].push(...groups);
  }
}

function sortKey(info, orderOverrides) {
  const o = orderOverrides?.[info.p.id];
  return [o ?? info.cat.order * 10, TEXTURE_RANK[info.p.texture] ?? 2, info.p.name];
}

function compareSteps(a, b) {
  for (let i = 0; i < a.key.length; i++) {
    if (a.key[i] < b.key[i]) return -1;
    if (a.key[i] > b.key[i]) return 1;
  }
  return 0;
}

function useFirstReason(p, others) {
  const o = others[0];
  if (!o) return null;
  if (p.openedAt && !o.openedAt) return 'opened';
  const pe = effectiveExpiry(p);
  const oe = effectiveExpiry(o);
  if (pe && (!oe || pe < oe)) return 'expiry';
  const pr = isMask(p) ? p.sheetCount : p.remainingPct;
  const or = isMask(o) ? o.sheetCount : o.remainingPct;
  if (pr < or) return 'remaining';
  return 'order';
}

function makeStep(info, { why = [], profile, todayISO }) {
  const p = info.p;
  const tips = [];
  const warnings = [];
  if (p.usageText) tips.push({ key: 'tip.label', params: { text: p.usageText.length > 160 ? `${p.usageText.slice(0, 160)}…` : p.usageText } });
  else tips.push({ key: 'tip.noUsage' });
  tips.push({ key: `tip.cat.${info.cat.id}` });
  if (info.actives.length && ['sensitive', 'very_sensitive'].includes(profile?.sensitivity)) tips.push({ key: 'tip.sensitiveActive' });

  if (!hasIngredientData(p)) warnings.push({ key: 'warn.noIngredients' });
  const nameOnly = detectGroups(p).filter((g) => g.source === 'name');
  if (nameOnly.length) warnings.push({ key: 'warn.nameOnly', params: { groups: nameOnly.map((g) => g.group) } });
  if (p.regulatory === 'quasi_drug') warnings.push({ key: 'warn.quasiDrug' });
  const exp = effectiveExpiry(p);
  if (exp && todayISO && exp <= addDays(todayISO, 30)) warnings.push({ key: 'warn.expiringSoon', params: { date: exp } });

  const allWhy = [{ key: 'why.category', params: { category: info.cat.id } }];
  if (info.slotWhy) allWhy.push({ key: `why.${info.slotWhy}` });
  if (info.perWeek && info.perWeek < 7) allWhy.push({ key: 'why.scheduled', params: { n: info.perWeek } });
  allWhy.push(...why);
  return { productId: p.id, category: info.cat.id, perWeek: info.perWeek, why: allWhy, tips, warnings };
}

/**
 * @param {object} args
 * @param {object[]} args.products 보관함 제품
 * @param {object} args.profile 피부 정보 (선택)
 * @param {object} args.maskPlan {days:number[] (0=일), picks:{[date]:productId}}
 * @param {object} args.orderOverrides {[productId]: number}
 * @param {string} args.weekStart 주 시작일 YYYY-MM-DD
 * @param {string} args.todayISO
 */
export function buildWeek({ products, profile = {}, maskPlan = {}, orderOverrides = {}, weekStart, todayISO }) {
  const active = products.filter((p) => !p.archived);
  const excluded = [];
  const infos = [];
  for (const p of active) {
    const e = eligibility(p, profile, todayISO);
    if (e.ok) infos.push(analyze(p));
    else excluded.push({ product: p, reasons: e.reasons });
  }
  assignDays(infos);

  const masks = infos.filter((i) => i.cat.id === 'sheet_mask').sort((a, b) => useFirstCompare(a.p, b.p));
  const simulatedStock = Object.fromEntries(masks.map((m) => [m.p.id, m.p.sheetCount ?? 0]));
  const maskDays = new Set(maskPlan.days || []);

  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(weekStart, d);
    const day = { date, weekday: weekdayOf(date), am: [], pm: [], maskDay: maskDays.has(weekdayOf(date)), maskProductId: null, maskOutOfStock: false };

    if (day.maskDay && masks.length) {
      const pick = maskPlan.picks?.[date];
      const future = date >= todayISO;
      const chosen = masks.find((m) => m.p.id === pick && (!future || simulatedStock[m.p.id] > 0))
        || masks.find((m) => !future || simulatedStock[m.p.id] > 0);
      if (chosen) {
        day.maskProductId = chosen.p.id;
        if (future) simulatedStock[chosen.p.id] -= 1;
      } else day.maskOutOfStock = true;
    } else if (day.maskDay) day.maskOutOfStock = true;

    for (const slot of ['am', 'pm']) {
      const avail = infos.filter((i) => i.cat.id !== 'sheet_mask' && i.slots.includes(slot) && (!i.days || i.days.includes(d)));
      const byCat = new Map();
      for (const i of avail) {
        if (!byCat.has(i.cat.id)) byCat.set(i.cat.id, []);
        byCat.get(i.cat.id).push(i);
      }
      const chosen = [];
      // 일반 카테고리: 종류별 1개 (먼저 쓸 제품)
      for (const [catId, list] of byCat) {
        if (TREATMENT.has(catId)) continue;
        list.sort((a, b) => useFirstCompare(a.p, b.p));
        const [first, ...rest] = list;
        const why = [];
        if (rest.length) why.push({ key: 'why.useFirst', params: { reason: useFirstReason(first.p, rest.map((r) => r.p)), others: rest.length } });
        chosen.push({ info: first, why });
      }
      // 세럼·앰플·에센스: 활성 성분 예정일 제품 우선, 나머지는 먼저 쓸 제품 + 순환
      const treatments = [...byCat].filter(([c]) => TREATMENT.has(c)).flatMap(([, l]) => l);
      const scheduled = treatments.filter((i) => i.days || i.actives.length);
      const daily = treatments.filter((i) => !scheduled.includes(i)).sort((a, b) => useFirstCompare(a.p, b.p));
      for (const i of scheduled) chosen.push({ info: i, why: [] });
      let room = Math.max(0, MAX_TREATMENTS - scheduled.length);
      if (room && daily.length) {
        chosen.push({ info: daily[0], why: daily.length > 1 ? [{ key: 'why.useFirst', params: { reason: useFirstReason(daily[0].p, daily.slice(1).map((r) => r.p)), others: daily.length - 1 } }] : [] });
        room -= 1;
        const rest = daily.slice(1);
        if (room && rest.length) {
          const idx = (d * 2 + (slot === 'pm' ? 1 : 0)) % rest.length;
          chosen.push({ info: rest[idx], why: [{ key: 'why.rotation', params: { n: rest.length } }] });
        }
      }

      if (slot === 'pm' && day.maskProductId) {
        const m = masks.find((x) => x.p.id === day.maskProductId);
        chosen.push({ info: m, why: [{ key: 'why.maskDay' }] });
      }

      day[slot] = chosen
        .map(({ info, why }) => ({ ...makeStep(info, { why, profile, todayISO }), key: sortKey(info, orderOverrides) }))
        .sort(compareSteps)
        .map(({ key, ...step }, idx) => ({ ...step, index: idx + 1 }));
    }
    days.push(day);
  }

  let noRoutineReason = null;
  if (!active.length) noRoutineReason = 'no_products';
  else if (!infos.length) noRoutineReason = 'none_eligible';

  return { days, excluded, noRoutineReason, schedule: Object.fromEntries(infos.filter((i) => i.days).map((i) => [i.p.id, i.days])) };
}

/** 하루치 루틴 아래에 표시할 4개 섹션 데이터 */
export function dayReport(day, products, profile = {}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const am = day.am.map((s) => byId.get(s.productId)).filter(Boolean);
  const pm = day.pm.map((s) => byId.get(s.productId)).filter(Boolean);
  const hasSunscreenAm = am.some((p) => p.category === 'sunscreen');
  const pmHasActives = pm.some((p) => strongActives(p).length);
  return {
    today: [...new Set([...am, ...pm])],
    combos: {
      am: checkCombos(am, { slot: 'am', profile }),
      pm: checkCombos(pm, { slot: 'pm', profile, hasSunscreenAm }),
    },
    considers: [...considerPairs(am, { slot: 'am', pmHasActives }), ...considerPairs(pm, { slot: 'pm' })],
    similar: similarClusters(products.filter((p) => !p.archived)),
  };
}
