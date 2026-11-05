import { categoryById } from './categories.js';
import { detectGroups, ACTIVE_STRONG } from './ingredients.js';
import { checkCombos } from './interactions.js';
import { compareProducts } from './duplicates.js';

/*
 * 사용자가 만든 루틴 분석 (규칙 기반 앱 분석 — 제조사 공식 정보와 구분해 표시).
 * 근거(basis): official = 제조사 공식 사용법 문장, ingredient = 전성분에서 확인, general = 일반적인 제형 순서 규칙
 * 분자량은 순서 판단에 쓰지 않습니다(제형·농도·용해도·전달 시스템 영향이 커서 단정할 수 없음).
 */
const TEXTURE_RANK = { water: 0, gel: 1, milk: 2, cream: 3, oil: 4 };
const MAX_STEPS = 7;

const rank = (p) => {
  if (p.officialOrder?.first) return -1000;
  if (p.officialOrder?.last) return 1000;
  return (categoryById(p.category)?.order ?? 50) * 10 + (TEXTURE_RANK[p.texture] ?? 2);
};

/** a 가 b 보다 앞에 와야 하는 공식 근거가 있으면 그 문장 반환 */
function mustPrecede(a, b) {
  const oa = a.officialOrder;
  const ob = b.officialOrder;
  if (oa?.before?.includes(b.category)) return { by: a, quote: oa.quote };
  if (ob?.after?.includes(a.category)) return { by: b, quote: ob.quote };
  if (oa?.first && !ob?.first) return { by: a, quote: oa.quote };
  if (ob?.last && !oa?.last) return { by: b, quote: ob.quote };
  return null;
}

/** 일반 순서로 정렬한 뒤 공식 사용법 제약을 반영 */
export function recommendOrder(products) {
  const list = [...products].sort((a, b) => rank(a) - rank(b));
  const official = new Map();
  for (let pass = 0; pass < list.length * list.length; pass++) {
    let moved = false;
    for (let i = 0; i < list.length && !moved; i++) {
      for (let j = i + 1; j < list.length && !moved; j++) {
        const rule = mustPrecede(list[j], list[i]);
        if (rule) {
          const [item] = list.splice(j, 1);
          list.splice(i, 0, item);
          official.set(rule.by.id, rule.quote);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return list.map((p) => ({
    product: p,
    reasons: [
      official.has(p.id) || p.officialOrder?.first || p.officialOrder?.last
        ? { key: 'ra.reason.official', params: { quote: official.get(p.id) || p.officialOrder.quote }, basis: 'official' }
        : null,
      { key: 'ra.reason.category', params: { category: p.category }, basis: 'general' },
      p.texture ? { key: 'ra.reason.texture', params: { texture: p.texture }, basis: 'general' } : null,
    ].filter(Boolean),
  }));
}

/** 사용자의 현재 순서에서 공식 사용법과 어긋나는 쌍 */
export function officialConflicts(products) {
  const out = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const rule = mustPrecede(products[j], products[i]); // j 가 i 보다 앞이어야 하는데 뒤에 있음
      if (rule) out.push({ first: products[j], second: products[i], by: rule.by, quote: rule.quote });
    }
  }
  return out;
}

const strongGroups = (p) => detectGroups(p).filter((g) => ACTIVE_STRONG.has(g.group)).map((g) => g.group);

/**
 * @param {object[]} products 사용자가 정한 순서의 제품들 (catalog/화장대 공통 형태)
 * @param {'am'|'pm'} slot
 * @param {object} profile
 */
export function analyzeRoutine(products, slot, profile = {}) {
  const recommended = recommendOrder(products);
  const sameOrder = recommended.every((r, i) => r.product.id === products[i]?.id);
  const conflicts = officialConflicts(products);
  const combos = checkCombos(products, { slot, profile }).filter((c) => c.id !== 'no_sunscreen');
  const pros = [];
  const cons = [];
  const notes = [];

  const groupsOf = (p) => detectGroups(p).filter((g) => g.source === 'ingredients').map((g) => g.group);
  const hydrators = products.filter((p) => groupsOf(p).some((g) => ['hyaluronic', 'panthenol'].includes(g)) || /\bglycerin\b/i.test(p.ingredientsText || ''));
  const moisturizers = products.filter((p) => categoryById(p.category)?.group === 'moisturizer');
  const barrier = products.filter((p) => groupsOf(p).includes('ceramide'));
  const sunscreen = products.find((p) => p.category === 'sunscreen');
  const actives = products.filter((p) => strongGroups(p).length);

  // 장점 (전성분·공식 정보로 확인되는 것만, 효과 보장 아님)
  if (hydrators.length && moisturizers.length) pros.push({ key: 'ra.pro.hydrateSeal', params: { a: hydrators[0].name, b: moisturizers[0].name }, basis: 'ingredient' });
  if (barrier.length) pros.push({ key: 'ra.pro.barrier', params: { names: barrier.map((p) => p.name).join(', ') }, basis: 'ingredient' });
  if (slot === 'am' && sunscreen) pros.push({ key: 'ra.pro.sunscreen', params: { name: sunscreen.name }, basis: sunscreen.officialOrder?.last ? 'official' : 'general' });
  if (actives.length === 1) pros.push({ key: 'ra.pro.oneActive', params: { name: actives[0].name }, basis: 'ingredient' });
  if (products.length && products.length <= 5) pros.push({ key: 'ra.pro.simple', params: { n: products.length }, basis: 'general' });
  if (products.length > 1 && sameOrder && !conflicts.length) pros.push({ key: 'ra.pro.orderOk', basis: 'general' });

  // 단점
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const r = compareProducts(products[i], products[j]);
      if (r?.strength === 'strong') cons.push({ key: 'ra.con.duplicate', params: { a: products[i].name, b: products[j].name }, basis: 'ingredient' });
    }
  }
  const distinctActives = new Set(actives.flatMap(strongGroups));
  if (distinctActives.size >= 2 || actives.length >= 2) cons.push({ key: 'ra.con.activesStack', params: { names: actives.map((p) => p.name).join(', ') }, basis: 'ingredient' });
  if (products.length > MAX_STEPS) cons.push({ key: 'ra.con.tooMany', params: { n: products.length }, basis: 'general' });
  if (!sameOrder && products.length > 1) cons.push({ key: 'ra.con.order', basis: conflicts.length ? 'official' : 'general' });
  for (const p of products) {
    if (p.timeOfUse === 'pm' && slot === 'am') cons.push({ key: 'ra.con.slotPm', params: { name: p.name }, basis: 'official' });
    if (p.timeOfUse === 'am' && slot === 'pm') cons.push({ key: 'ra.con.slotAm', params: { name: p.name }, basis: 'official' });
  }
  if (slot === 'am' && !sunscreen && actives.length) cons.push({ key: 'ra.con.noSunscreen', basis: 'official' });
  if (['pregnant', 'breastfeeding'].includes(profile.pregnancy)) {
    for (const p of products) {
      if (p.pregnancyAvoid || strongGroups(p).some((g) => g === 'retinoid' || g === 'hydroquinone')) {
        cons.push({ key: 'ra.con.pregnancy', params: { name: p.name }, basis: p.pregnancyAvoid ? 'official' : 'ingredient' });
      }
    }
  }

  // 빈도·참고 정보
  const frequency = products.filter((p) => p.frequencyPerWeek && p.frequencyPerWeek < 7)
    .map((p) => ({ product: p, n: p.frequencyPerWeek, quote: p.frequencyQuote || '' }));
  if (products.some((p) => groupsOf(p).some((g) => ['aha', 'bha', 'vitamin_c'].includes(g)))) notes.push({ key: 'ra.note.ph', basis: 'general' });
  notes.push({ key: 'ra.note.molecular', basis: 'general' });

  const blocking = combos.some((c) => ['avoid', 'caution', 'check'].includes(c.level));
  return {
    recommended,
    sameOrder,
    conflicts,
    combos,
    pros,
    cons,
    frequency,
    notes,
    verdict: !cons.length && !blocking ? 'keep' : 'adjust',
  };
}
