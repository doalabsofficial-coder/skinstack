/*
 * 성분 키워드 사전 (한국어 표기 / INCI 영문).
 * - 전성분 텍스트에서 찾으면 source='ingredients' (사용자·OCR·관리자가 라벨에서 옮긴 정보)
 * - 제품명에서만 찾으면 source='name' → "제품명 기반, 성분 확인 필요"로 낮은 신뢰도로 다룸
 * 국가마다 성분 표기가 다를 수 있으므로 패턴을 추가해 확장하세요.
 */
export const ACTIVE_GROUPS = {
  retinoid: /레티놀|레티날|레티닐|레티노이드|레티노에이트|트레티노인|아다팔렌|retinol|retinal\b|retinaldehyde|retinyl|retinoate|retinoid|tretinoin|adapalene/i,
  aha: /글라이콜릭\s?애씨드|글리콜산|락틱\s?애씨드|젖산|만델릭\s?애씨드|시트릭\s?애씨드|glycolic acid|lactic acid|mandelic acid|\baha\b/i,
  bha: /살리실릭\s?애씨드|살리실산|베타인\s?살리실레이트|salicylic acid|betaine salicylate|\bbha\b/i,
  pha: /글루코노락톤|락토바이오닉\s?애씨드|gluconolactone|lactobionic acid|\bpha\b/i,
  vitamin_c: /아스코빅\s?애씨드|아스코빌|에틸\s?아스코빌|ascorbic acid|ascorbyl|ethyl ascorbic|비타민\s?c|vitamin\s?c/i,
  benzoyl_peroxide: /벤조일\s?퍼옥사이드|과산화\s?벤조일|benzoyl peroxide/i,
  hydroquinone: /하이드로퀴논|hydroquinone/i,
  niacinamide: /나이아신아마이드|niacinamide/i,
  ceramide: /세라마이드|ceramide/i,
  hyaluronic: /하이알루로닉|히알루론|하이알루로네이트|hyaluronic|hyaluronate/i,
  panthenol: /판테놀|panthenol/i,
  centella: /병풀|마데카소사이드|아시아티코사이드|센텔라|시카|centella|madecassoside|asiaticoside|\bcica\b/i,
  pdrn: /소듐\s?디엔에이|pdrn|피디알엔|sodium dna|polydeoxyribonucleotide/i,
  copper_peptide: /구리\s?펩타이드|코퍼\s?펩타이드|copper tripeptide|copper peptide/i,
  peptide: /펩타이드|peptide/i,
  tranexamic: /트라넥사믹|tranexamic/i,
  arbutin: /알부틴|arbutin/i,
  collagen: /콜라겐|collagen/i,
  aloe: /알로에|aloe/i,
  uv_filter: /징크\s?옥사이드|티타늄\s?디옥사이드|에칠헥실메톡시신나메이트|호모살레이트|옥토크릴렌|부틸메톡시디벤조일메탄|zinc oxide|titanium dioxide|avobenzone|octocrylene|homosalate|ethylhexyl methoxycinnamate|butyl methoxydibenzoylmethane/i,
  fragrance: /향료|fragrance|parfum/i,
};

/** 자극 가능성 있는 활성 성분 (빈도/시간대 확인이 필요한 그룹) */
export const ACTIVE_STRONG = new Set(['retinoid', 'aha', 'bha', 'benzoyl_peroxide', 'hydroquinone']);
/** 중복 비교에 쓰는 "주요 성분" 그룹 */
export const KEY_GROUPS = Object.keys(ACTIVE_GROUPS).filter((g) => g !== 'fragrance' && g !== 'uv_filter');

/** 전성분 텍스트를 개별 성분 배열로 */
export function splitIngredients(text) {
  if (!text) return [];
  return text
    .replace(/\r/g, '')
    .replace(/(\d),(\d)/g, '$1\u0001$2') // "1,2-Hexanediol" 같은 성분명 안의 쉼표는 구분자가 아님
    .split(/[,，、;\n]+/)
    .map((s) => s.replace(/\u0001/g, ',').replace(/^[\s\-•·*]+|[\s.]+$/g, '').trim())
    .filter((s) => s.length > 0 && s.length < 120);
}

/**
 * 제품의 성분 그룹을 근거와 함께 찾는다.
 * @returns {{group:string, source:'ingredients'|'name', match:string}[]}
 */
export function detectGroups(product) {
  const found = new Map();
  for (const ing of splitIngredients(product.ingredientsText)) {
    for (const [group, re] of Object.entries(ACTIVE_GROUPS)) {
      if (!found.has(group) && re.test(ing)) found.set(group, { group, source: 'ingredients', match: ing });
    }
  }
  const nameText = product.name || ''; // 브랜드명(예: "…알로에")은 성분 근거로 쓰지 않음
  for (const [group, re] of Object.entries(ACTIVE_GROUPS)) {
    if (found.has(group)) continue;
    const m = nameText.match(re);
    if (m) found.set(group, { group, source: 'name', match: m[0] });
  }
  return [...found.values()];
}

export const hasIngredientData = (product) => splitIngredients(product.ingredientsText).length >= 3;

/** 제품명/라벨에 표기된 농도(%) 추출. 예: "나이아신아마이드 20%" → 20 */
export function statedPercent(product) {
  const m = `${product.name || ''}`.match(/(\d+(?:\.\d+)?)\s?%/);
  return m ? Number(m[1]) : null;
}
