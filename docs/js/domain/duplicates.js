import { categoryById, guessCategory } from './categories.js';
import { detectGroups, KEY_GROUPS } from './ingredients.js';
import { isEmpty } from './product.js';

/*
 * 중복(비슷한 제품) 판단. 삭제/사용 금지는 하지 않고, 비교 근거만 제공한다.
 * strength: 'strong' (같은 분류 + 주요 성분 겹침), 'category' (같은 종류), 'ingredient' (다른 종류지만 주요 성분 겹침)
 */
export function compareProducts(candidate, owned) {
  const catA = candidate.category || candidate.categoryHint || guessCategory(candidate.name);
  const catB = owned.category || owned.categoryHint || guessCategory(owned.name);
  const groupA = categoryById(catA)?.group;
  const groupB = categoryById(catB)?.group;
  const reasons = [];

  const sameCategory = catA && catA === catB;
  const sameGroup = groupA && groupA === groupB;
  if (sameCategory) reasons.push({ type: 'same_category', category: catA, confirmed: Boolean(candidate.categoryConfirmed && owned.categoryConfirmed) });
  else if (sameGroup && groupA !== 'mask') reasons.push({ type: 'same_group', group: groupA });

  const ga = detectGroups(candidate).filter((g) => KEY_GROUPS.includes(g.group));
  const gb = detectGroups(owned).filter((g) => KEY_GROUPS.includes(g.group));
  const shared = ga.filter((x) => gb.some((y) => y.group === x.group)).map((x) => {
    const y = gb.find((g) => g.group === x.group);
    return { type: 'shared_ingredient', group: x.group, fromIngredients: x.source === 'ingredients' && y.source === 'ingredients' };
  });
  reasons.push(...shared);

  if (!reasons.length) return null;
  let strength = 'ingredient';
  if ((sameCategory || sameGroup) && shared.length) strength = 'strong';
  else if (sameCategory) strength = 'category';
  else if (!shared.length) return null; // 같은 상위 분류만 겹치는 경우는 너무 약하므로 제외
  return { strength, reasons };
}

export function findSimilar(candidate, products) {
  return products
    .filter((p) => p.id !== candidate.id && !isEmpty(p))
    .map((p) => ({ product: p, result: compareProducts(candidate, p) }))
    .filter((x) => x.result)
    .sort((a, b) => rank(a.result.strength) - rank(b.result.strength));
}

const rank = (s) => ({ strong: 0, category: 1, ingredient: 2 }[s] ?? 3);

/** 보관함 전체의 비슷한 제품 묶음 (루틴 하단 표시용, strong/category 만) */
export function similarClusters(products) {
  const seen = new Set();
  const clusters = [];
  for (const p of products) {
    if (seen.has(p.id) || isEmpty(p)) continue;
    const sims = findSimilar(p, products).filter((x) => x.result.strength !== 'ingredient' && !seen.has(x.product.id));
    if (!sims.length) continue;
    seen.add(p.id);
    sims.forEach((s) => seen.add(s.product.id));
    clusters.push({ anchor: p, others: sims });
  }
  return clusters;
}
