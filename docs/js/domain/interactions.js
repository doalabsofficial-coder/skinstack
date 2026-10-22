import { detectGroups, hasIngredientData, statedPercent } from './ingredients.js';

/*
 * 함께 쓸 때 확인할 조합.
 * level:
 *  - 'avoid'   : 관리자가 검증한 출처(제조사 지침 등)가 등록된 경우에만 사용 (catalog interactionNotes)
 *  - 'caution' : 성분이 확인되었고 일반적으로 자극 가능성이 알려진 조합 → "주의가 필요할 수 있음"
 *  - 'check'   : 근거가 제품명뿐이거나 불확실 → "제품 지침 확인 필요"
 * 안전하다는 판정은 내리지 않는다. 판단 자료가 없으면 'no_data' 로 알린다.
 */
const PAIR_RULES = [
  { id: 'retinoid_exfoliant', a: ['retinoid'], b: ['aha', 'bha'] },
  { id: 'retinoid_bpo', a: ['retinoid'], b: ['benzoyl_peroxide'] },
  { id: 'vitc_exfoliant', a: ['vitamin_c'], b: ['aha', 'bha'] },
];
const DUPLICATE_ACTIVE_RULES = [
  { id: 'multi_retinoid', groups: ['retinoid'] },
  { id: 'multi_exfoliant', groups: ['aha', 'bha', 'pha'] },
];

function evidenceFor(product, hits) {
  return hits.map((h) => ({ productId: product.id, productName: product.name, group: h.group, source: h.source, match: h.match }));
}

/**
 * @param {object[]} products 같은 시간대(같은 루틴)에 쓰는 제품들
 * @param {object} ctx {slot:'am'|'pm', profile, allSlotProducts:{am:[],pm:[]}}
 */
export function checkCombos(products, ctx = {}) {
  const items = products.map((p) => ({ p, groups: detectGroups(p) }));
  const out = [];

  for (const rule of PAIR_RULES) {
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const ha = items[i].groups.filter((g) => rule.a.includes(g.group));
        const hb = items[j].groups.filter((g) => rule.b.includes(g.group));
        if (!ha.length || !hb.length) continue;
        if (out.some((o) => o.id === rule.id && o.productIds.includes(items[i].p.id) && o.productIds.includes(items[j].p.id))) continue;
        const allFromIngredients = [...ha, ...hb].every((h) => h.source === 'ingredients');
        out.push({
          id: rule.id,
          level: allFromIngredients ? 'caution' : 'check',
          productIds: [items[i].p.id, items[j].p.id],
          evidence: [...evidenceFor(items[i].p, ha), ...evidenceFor(items[j].p, hb)],
        });
      }
    }
  }

  // 같은 계열 활성 성분이 여러 제품에 있을 때
  for (const rule of DUPLICATE_ACTIVE_RULES) {
    const hits = items.map(({ p, groups }) => ({ p, h: groups.filter((g) => rule.groups.includes(g.group)) })).filter((x) => x.h.length);
    if (hits.length >= 2) {
      out.push({
        id: rule.id,
        level: hits.every((x) => x.h.every((h) => h.source === 'ingredients')) ? 'caution' : 'check',
        productIds: hits.map((x) => x.p.id),
        evidence: hits.flatMap((x) => evidenceFor(x.p, x.h)),
      });
    }
  }

  // 관리자 검증 출처가 있는 조합 (catalog interactionNotes: [{group, level:'avoid'|'caution', source}])
  for (const { p } of items) {
    for (const note of p.interactionNotes || []) {
      for (const other of items) {
        if (other.p.id === p.id) continue;
        const hit = other.groups.find((g) => g.group === note.group && g.source === 'ingredients');
        if (hit) {
          out.push({
            id: 'verified_note',
            level: note.level === 'avoid' && note.source ? 'avoid' : 'caution',
            productIds: [p.id, other.p.id],
            evidence: evidenceFor(other.p, [hit]),
            source: note.source || '',
          });
        }
      }
    }
  }

  // 고농도 표기 + 민감 피부
  if (ctx.profile?.sensitivity === 'sensitive' || ctx.profile?.sensitivity === 'very_sensitive') {
    for (const { p } of items) {
      const pct = statedPercent(p);
      if (pct != null && pct >= 10) {
        out.push({ id: 'high_percent_sensitive', level: 'check', productIds: [p.id], evidence: [{ productId: p.id, productName: p.name, source: 'name', match: `${pct}%` }] });
      }
    }
  }

  // 저녁에 각질/레티노이드 성분을 쓰는데 아침 루틴에 자외선 차단제가 없음
  if (ctx.slot === 'pm' && ctx.hasSunscreenAm === false) {
    const act = items.filter(({ groups }) => groups.some((g) => ['retinoid', 'aha', 'bha'].includes(g.group)));
    if (act.length) {
      out.push({ id: 'no_sunscreen', level: 'check', productIds: act.map((x) => x.p.id), evidence: act.flatMap(({ p, groups }) => evidenceFor(p, groups.filter((g) => ['retinoid', 'aha', 'bha'].includes(g.group)))) });
    }
  }

  // 성분 정보가 없어 조합 판단 불가
  const noData = items.filter(({ p }) => !hasIngredientData(p)).map(({ p }) => p.id);
  if (noData.length) out.push({ id: 'no_data', level: 'info', productIds: noData, evidence: [] });

  return out;
}

/*
 * 함께 고려할 수 있는 조합: 효과를 보장하지 않으며, 성분이 전성분에서 확인된 경우에만 표시.
 */
export function considerPairs(products, ctx = {}) {
  const items = products.map((p) => ({ p, groups: detectGroups(p).filter((g) => g.source === 'ingredients') }));
  const out = [];
  const irritating = items.filter(({ groups }) => groups.some((g) => ['retinoid', 'aha', 'bha'].includes(g.group)));
  const barrier = items.filter(({ groups }) => groups.some((g) => ['ceramide', 'panthenol', 'hyaluronic'].includes(g.group)));
  if (irritating.length && barrier.length) {
    out.push({
      id: 'active_plus_barrier',
      productIds: [irritating[0].p.id, barrier[0].p.id],
      evidence: [
        ...evidenceFor(irritating[0].p, irritating[0].groups.filter((g) => ['retinoid', 'aha', 'bha'].includes(g.group))),
        ...evidenceFor(barrier[0].p, barrier[0].groups.filter((g) => ['ceramide', 'panthenol', 'hyaluronic'].includes(g.group))),
      ],
    });
  }
  if (ctx.slot === 'am') {
    const sun = items.find(({ p }) => p.category === 'sunscreen');
    if (sun && ctx.pmHasActives) out.push({ id: 'pm_active_am_sunscreen', productIds: [sun.p.id], evidence: [] });
  }
  return out;
}
