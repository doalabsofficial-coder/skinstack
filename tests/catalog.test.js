import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setCatalog, catalogProduct, searchCatalog } from '../docs/js/domain/catalog.js';
import { analyzeRoutine, recommendOrder } from '../docs/js/domain/routineAnalysis.js';
import { splitIngredients } from '../docs/js/domain/ingredients.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../docs/data/${f}`, import.meta.url), 'utf8'));
setCatalog(read('products.json'), read('ingredients.json'));
const P = (id) => { const p = catalogProduct(id); assert.ok(p, id); return p; };

test('ingredient split keeps 1,2-Hexanediol intact', () => {
  assert.deepEqual(splitIngredients('Water, 1,2-Hexanediol, Glycerin'), ['Water', '1,2-Hexanediol', 'Glycerin']);
});

test('catalog data has verified source and no fabricated images', () => {
  for (const p of read('products.json').products) {
    assert.ok(p.sourceUrl.startsWith('https://'), p.id);
    assert.equal(p.imageUrl, null);
    if (p.verificationStatus === 'official_verified') assert.ok(p.ingredientsRaw && p.usageOfficial, p.id);
  }
});

test('search matches brand in Korean and ingredient group label', () => {
  assert.ok(searchCatalog({ q: '토리든' }).length >= 1);
  assert.ok(searchCatalog({ q: 'retinoid' }).some((p) => p.id === 'cosrx-retinol-05-oil'));
  assert.ok(searchCatalog({ category: 'sunscreen' }).every((p) => p.category === 'sunscreen'));
});

test('official "follow with moisturizer" puts retinol oil before cream', () => {
  const order = recommendOrder([P('cosrx-snail-cream'), P('cosrx-retinol-05-oil')]).map((r) => r.product.id);
  assert.deepEqual(order, ['cosrx-retinol-05-oil', 'cosrx-snail-cream']);
});

test('manufacturer avoid note is reported as avoid with source', () => {
  const r = analyzeRoutine([P('cosrx-aha-bha-toner'), P('cosrx-retinol-03-cream')], 'pm');
  const avoid = r.combos.find((c) => c.level === 'avoid');
  assert.ok(avoid && avoid.source.includes('cosrx.com'));
  assert.equal(r.verdict, 'adjust');
});

test('simple hydrating routine in good order keeps its order', () => {
  const r = analyzeRoutine([P('cosrx-snail-gel-cleanser'), P('torriden-divein-toner'), P('cosrx-snail-essence'), P('cosrx-ceramide-moisturizer'), P('cosrx-vite-sunscreen')], 'am');
  assert.equal(r.sameOrder, true);
  assert.equal(r.conflicts.length, 0);
  assert.ok(r.pros.some((p) => p.key === 'ra.pro.sunscreen'));
});

test('sunscreen placed early is flagged against official last-step instruction', () => {
  const r = analyzeRoutine([P('cosrx-vite-sunscreen'), P('cosrx-snail-cream')], 'am');
  assert.ok(r.conflicts.length >= 1);
  assert.equal(r.recommended.at(-1).product.id, 'cosrx-vite-sunscreen');
});
