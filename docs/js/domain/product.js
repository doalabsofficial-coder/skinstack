import { categoryById, guessCategory, ROUTINE_ALLOWED_REGULATORY } from './categories.js';
import { detectGroups, ACTIVE_STRONG } from './ingredients.js';
import { addMonths } from './dates.js';

const PHARMA_RE = /제약|약품|pharm/i;

export function createProduct(input = {}) {
  const ts = new Date().toISOString();
  const name = (input.name || '').trim();
  const brand = (input.brand || '').trim();
  const category = input.category || null;
  return {
    id: input.id || (globalThis.crypto?.randomUUID?.() ?? `p_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    brand,
    name,
    region: input.region || '',
    category,
    categoryHint: input.categoryHint ?? guessCategory(name),
    categoryConfirmed: Boolean(input.categoryConfirmed && category),
    volume: input.volume || '',
    ingredientsText: input.ingredientsText || '',
    usageText: input.usageText || '',
    warningsText: input.warningsText || '',
    timeOfUse: input.timeOfUse || 'auto',
    frequencyPerWeek: input.frequencyPerWeek ?? null,
    texture: input.texture || '',
    openedAt: input.openedAt || '',
    expiresAt: input.expiresAt || '',
    paoMonths: input.paoMonths ?? null,
    remainingPct: input.remainingPct ?? 100,
    quantity: input.quantity ?? 1,
    sheetCount: input.sheetCount ?? (category === 'sheet_mask' ? 0 : null),
    regulatory: input.regulatory || (input.pharmaFlag || PHARMA_RE.test(brand) ? 'unknown' : 'cosmetic'),
    pharmaFlag: Boolean(input.pharmaFlag || PHARMA_RE.test(brand)),
    regulatoryMarkings: input.regulatoryMarkings || [],
    dataSource: input.dataSource || 'manual',
    catalogId: input.catalogId || null,
    interactionNotes: input.interactionNotes || [],
    // 상품 DB(공식 사용법)에서 온 정보: 공식 사용 순서, 임신·수유 중 사용 피하기 안내, 빈도 근거 문장
    officialOrder: input.officialOrder || null,
    pregnancyAvoid: Boolean(input.pregnancyAvoid),
    frequencyQuote: input.frequencyQuote || '',
    verified: Boolean(input.verified),
    notes: input.notes || '',
    createdAt: input.createdAt || ts,
    updatedAt: ts,
  };
}

export const isMask = (p) => p.category === 'sheet_mask';

export function isEmpty(p) {
  if (isMask(p)) return (p.sheetCount ?? 0) <= 0;
  return (p.remainingPct ?? 100) <= 0 && (p.quantity ?? 1) <= 1;
}

/** 개봉 후 사용기한(PAO) 또는 유통기한 중 빠른 날짜 */
export function effectiveExpiry(p) {
  const dates = [];
  if (p.expiresAt) dates.push(p.expiresAt);
  if (p.openedAt && p.paoMonths) dates.push(addMonths(p.openedAt, Number(p.paoMonths)));
  return dates.sort()[0] || null;
}

export function strongActives(p) {
  return detectGroups(p).filter((g) => ACTIVE_STRONG.has(g.group));
}

/**
 * 루틴 포함 가능 여부와 제외 사유.
 * 사유 코드는 i18n 키 `exclude.<code>` 로 표시.
 */
export function eligibility(p, profile = {}, todayISO) {
  const reasons = [];
  if (!p.category || !p.categoryConfirmed || !categoryById(p.category)) reasons.push('category_unconfirmed');
  if (!p.verified) reasons.push('unverified');
  if (p.regulatory === 'drug') reasons.push('drug');
  else if (!ROUTINE_ALLOWED_REGULATORY.has(p.regulatory)) reasons.push('regulatory_check');
  if (isEmpty(p)) reasons.push('empty');
  const exp = effectiveExpiry(p);
  if (exp && todayISO && exp < todayISO) reasons.push('expired');
  const actives = strongActives(p);
  if (profile.pregnancy === 'pregnant' || profile.pregnancy === 'breastfeeding') {
    if (p.pregnancyAvoid || actives.some((a) => a.group === 'retinoid' || a.group === 'hydroquinone')) reasons.push('pregnancy_consult');
  }
  const needsFreq = actives.length > 0 || categoryById(p.category)?.id === 'wash_off_mask';
  if (needsFreq && !p.frequencyPerWeek && !isMask(p)) reasons.push('frequency_unknown');
  return { ok: reasons.length === 0, reasons };
}

/** 같은 종류 중 무엇을 먼저 쓸지: 개봉한 것 → 기한 임박 → 남은 양 적은 것 */
export function useFirstCompare(a, b) {
  const ao = a.openedAt ? 0 : 1;
  const bo = b.openedAt ? 0 : 1;
  if (ao !== bo) return ao - bo;
  const ae = effectiveExpiry(a) || '9999-12-31';
  const be = effectiveExpiry(b) || '9999-12-31';
  if (ae !== be) return ae < be ? -1 : 1;
  const ar = isMask(a) ? a.sheetCount : a.remainingPct;
  const br = isMask(b) ? b.sheetCount : b.remainingPct;
  if (ar !== br) return (ar ?? 100) - (br ?? 100);
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}
