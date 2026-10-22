import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProduct, eligibility } from '../docs/js/domain/product.js';
import { buildWeek, dayReport } from '../docs/js/domain/routine.js';
import { checkCombos } from '../docs/js/domain/interactions.js';
import { findSimilar } from '../docs/js/domain/duplicates.js';
import { parseLabelText } from '../docs/js/domain/parse.js';
import { DEMO_PRODUCTS } from '../docs/js/domain/demo.js';
import { guessCategory } from '../docs/js/domain/categories.js';

const TODAY = '2026-10-14';
const verified = (o) => createProduct({ categoryConfirmed: true, verified: true, ...o });

test('demo products are not routine-eligible until verified', () => {
  const products = DEMO_PRODUCTS.map((d) => createProduct({ ...d, dataSource: 'demo', pharmaFlag: d.pharmaMaker }));
  const week = buildWeek({ products, weekStart: '2026-10-12', todayISO: TODAY });
  assert.equal(week.noRoutineReason, 'none_eligible');
  assert.equal(week.excluded.length, DEMO_PRODUCTS.length);
});

test('pharma-maker products need regulatory confirmation', () => {
  const p = createProduct({ brand: '동아제약', name: '멜라토닝 크림', category: 'cream', categoryConfirmed: true, verified: true });
  assert.equal(p.regulatory, 'unknown');
  assert.ok(eligibility(p, {}, TODAY).reasons.includes('regulatory_check'));
});

test('category hints from names', () => {
  assert.equal(guessCategory('세라마이드 아토 수딩젤'), 'gel');
  assert.equal(guessCategory('블랙슈가 퍼펙트 퍼스트 세럼'), 'serum');
  assert.equal(guessCategory('익스트림 로션'), 'emulsion');
  assert.equal(guessCategory('당근 마스크팩'), 'sheet_mask');
  assert.equal(guessCategory('더 레티놀 0.3'), null);
});

test('retinoid without frequency is excluded; with frequency goes PM only', () => {
  const r = verified({ name: '더 레티놀 0.3', category: 'serum' });
  assert.ok(eligibility(r, {}, TODAY).reasons.includes('frequency_unknown'));
  r.frequencyPerWeek = 2;
  const cream = verified({ name: 'Cream', category: 'cream' });
  const week = buildWeek({ products: [r, cream], weekStart: '2026-10-12', todayISO: TODAY });
  const amIds = week.days.flatMap((d) => d.am.map((s) => s.productId));
  const pmDays = week.days.filter((d) => d.pm.some((s) => s.productId === r.id));
  assert.ok(!amIds.includes(r.id));
  assert.equal(pmDays.length, 2);
});

test('retinoid and exfoliant scheduled on different days when possible', () => {
  const r = verified({ name: 'A', category: 'serum', ingredientsText: 'Water, Glycerin, Retinol, Butylene Glycol', frequencyPerWeek: 3 });
  const a = verified({ name: 'B', category: 'toner', ingredientsText: 'Water, Glycolic Acid, Glycerin', frequencyPerWeek: 2 });
  const week = buildWeek({ products: [r, a], weekStart: '2026-10-12', todayISO: TODAY });
  const overlap = week.days.filter((d) => d.pm.some((s) => s.productId === r.id) && d.pm.some((s) => s.productId === a.id));
  assert.equal(overlap.length, 0);
});

test('combo level: caution only when both come from ingredient lists', () => {
  const r = verified({ name: 'Serum', ingredientsText: 'Water, Retinol, Glycerin' });
  const a = verified({ name: 'Toner', ingredientsText: 'Water, Salicylic Acid, Glycerin' });
  assert.equal(checkCombos([r, a]).find((c) => c.id === 'retinoid_exfoliant').level, 'caution');
  const rn = verified({ name: '레티놀 앰플' });
  assert.equal(checkCombos([rn, a]).find((c) => c.id === 'retinoid_exfoliant').level, 'check');
  assert.ok(!checkCombos([r, a]).some((c) => c.level === 'avoid'));
});

test('similar products by category and shared ingredient', () => {
  const a = verified({ name: '세라마이드 크림', category: 'cream' });
  const b = verified({ name: '약콩 세라마이드 크림', category: 'cream' });
  const c = verified({ name: '토너', category: 'toner' });
  const sims = findSimilar(a, [a, b, c]);
  assert.equal(sims.length, 1);
  assert.equal(sims[0].result.strength, 'strong');
});

test('mask days use stock and picks', () => {
  const m1 = verified({ name: '당근 마스크팩', category: 'sheet_mask', sheetCount: 1 });
  const m2 = verified({ name: 'Other mask', category: 'sheet_mask', sheetCount: 5 });
  const week = buildWeek({ products: [m1, m2], maskPlan: { days: [1, 3, 5] }, weekStart: '2026-10-12', todayISO: '2026-10-12' });
  const used = week.days.filter((d) => d.maskDay).map((d) => d.maskProductId);
  assert.equal(used.filter((id) => id === m1.id).length, 1);
  assert.equal(used.length, 3);
  const report = dayReport(week.days[0], [m1, m2]);
  assert.ok(report.today.length >= 1);
});

test('label parser extracts sections without inventing data', () => {
  const parsed = parseLabelText('BRAND\nHydra Serum 50 mL', '전성분: 정제수, 글리세린, 나이아신아마이드\n사용법: 토너 후 적당량을 바릅니다.\n주의사항: 상처가 있는 부위 사용 금지');
  assert.equal(parsed.volume, '50 mL');
  assert.match(parsed.ingredientsText, /나이아신아마이드/);
  assert.match(parsed.usageText, /토너 후/);
  assert.equal(parseLabelText('Serum', '').ingredientsText, '');
});
