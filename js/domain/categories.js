/*
 * 지원 카테고리: 기초 스킨케어 ~ 선크림까지. 메이크업은 지원 대상 아님.
 * order: 제형 기준의 일반적인 바르는 순서 (낮을수록 먼저). 제조사 사용 지침/사용자 순서 조정이 우선.
 * slot: 라벨에 사용 시간이 없을 때의 기본값 (am | pm | both)
 * group: 중복 비교용 상위 분류
 */
export const CATEGORIES = [
  { id: 'cleanser', order: 10, slot: 'both', group: 'cleanse' },
  { id: 'wash_off_mask', order: 15, slot: 'pm', group: 'mask', scheduled: true },
  { id: 'toner', order: 20, slot: 'both', group: 'prep' },
  { id: 'pad', order: 25, slot: 'both', group: 'prep' },
  { id: 'sheet_mask', order: 35, slot: 'pm', group: 'mask', scheduled: true, countable: true },
  { id: 'essence', order: 30, slot: 'both', group: 'treatment' },
  { id: 'serum', order: 40, slot: 'both', group: 'treatment' },
  { id: 'ampoule', order: 42, slot: 'both', group: 'treatment' },
  { id: 'spot', order: 45, slot: 'pm', group: 'treatment' },
  { id: 'eye', order: 50, slot: 'both', group: 'eye' },
  { id: 'emulsion', order: 60, slot: 'both', group: 'moisturizer' },
  { id: 'gel', order: 65, slot: 'both', group: 'moisturizer' },
  { id: 'cream', order: 70, slot: 'both', group: 'moisturizer' },
  { id: 'balm', order: 75, slot: 'pm', group: 'moisturizer' },
  { id: 'oil', order: 80, slot: 'pm', group: 'oil' },
  { id: 'sunscreen', order: 90, slot: 'am', group: 'sun' },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || null;

/** 제품명/라벨 텍스트로 카테고리 "힌트"를 찾는다. 확정이 아니라 사용자가 확인할 제안값. */
const NAME_HINTS = [
  ['sheet_mask', /마스크\s?팩|시트\s?마스크|sheet\s?mask|마스크시트/i],
  ['wash_off_mask', /워시\s?오프|클레이\s?마스크|wash[-\s]?off|clay mask/i],
  ['sunscreen', /선\s?크림|선\s?스크린|선\s?젤|선\s?밀크|선\s?스틱|썬\s?크림|sunscreen|sun\s?cream|spf\s?\d+/i],
  ['cleanser', /클렌징|클렌저|폼|cleans|face wash/i],
  ['pad', /패드|pad\b|pads\b/i],
  ['toner', /토너|(^|\s)스킨(\s|$)|toner/i],
  ['ampoule', /앰플|ampoule|ampule/i],
  ['serum', /세럼|serum/i],
  ['essence', /에센스|essence/i],
  ['eye', /아이\s?크림|eye\s?cream/i],
  ['emulsion', /로션|에멀전|에멀젼|lotion|emulsion/i],
  ['gel', /수딩\s?젤|젤(\s|$)|gel\b/i],
  ['balm', /(^|\s)밤(\s|$)|balm/i],
  ['cream', /크림|cream/i],
  ['oil', /페이스\s?오일|오일|face oil/i],
  ['spot', /스팟|spot/i],
];

const MAKEUP_HINTS = /파운데이션|쿠션|팩트|립스틱|립\s?틴트|틴트|립밤|마스카라|아이\s?섀도|아이섀도우|아이라이너|블러셔|치크|컨실러|하이라이터|파우더|비비\s?크림|BB\s?크림|CC\s?크림|foundation|cushion|lipstick|lip\s?tint|mascara|eyeshadow|eyeliner|blush|concealer|highlighter|\bbb cream|\bcc cream/i;

export function guessCategory(text) {
  if (!text) return null;
  for (const [id, re] of NAME_HINTS) if (re.test(text)) return id;
  return null;
}

export function looksLikeMakeup(text) {
  return Boolean(text && MAKEUP_HINTS.test(text));
}

export const REGULATORY = ['cosmetic', 'functional_cosmetic', 'quasi_drug', 'drug', 'unknown'];
/** 루틴에 자동 포함 가능한 규제 분류. drug / unknown(제약사 등 확인 필요) 은 제외 */
export const ROUTINE_ALLOWED_REGULATORY = new Set(['cosmetic', 'functional_cosmetic', 'quasi_drug']);
