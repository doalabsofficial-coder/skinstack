import { update } from './store.js';
import { loadCatalog, catalogProduct, catalogToVanity } from './domain/catalog.js';

/*
 * 시연용 데이터 (데모 저장 공간에만 씀). 공식 출처로 확인한 상품 DB 제품만 사용.
 * - 아침 루틴: 제형·공식 순서에 맞아 "그대로 사용 가능"
 * - 저녁 루틴: AHA/BHA 토너 + 레티놀 크림 → 제조사가 함께 쓰지 말라고 한 조합이라 "확인 필요"
 */
const VANITY = [
  ['cosrx-snail-gel-cleanser'], ['torriden-divein-toner'], ['cosrx-snail-essence'], ['torriden-divein-serum'],
  ['cosrx-ceramide-moisturizer', { openedAt: 'today' }], ['cosrx-vite-sunscreen'], ['cosrx-retinol-03-cream'], ['cosrx-aha-bha-toner'],
  ['torriden-divein-mask', { sheetCount: 8 }], ['cosrx-pdrn-hydrogel-mask', { sheetCount: 3 }],
];

export async function seedDemo(today) {
  await loadCatalog();
  const now = new Date().toISOString();
  const products = VANITY.map(([id, extra = {}]) => catalogToVanity(catalogProduct(id), {
    verified: true, regulatory: 'cosmetic', ...extra, ...(extra.openedAt ? { openedAt: today } : {}),
  }));
  const byCat = (id) => products.find((p) => p.catalogId === id).id;
  const routine = (name, slot, ids, log) => ({
    id: crypto.randomUUID(), name, slot, createdAt: now, updatedAt: now, versions: [],
    items: ids.map((id) => ({ type: 'catalog', id, amount: '', memo: '' })),
    logs: log ? [{ id: crypto.randomUUID(), date: today, period: '2주', good: '아침에 당김이 덜해요', bad: '', reaction: '이상 없음', satisfaction: 4, keep: 'yes', productMemos: {} }] : [],
  });
  update((s) => {
    s.settings.onboarded = true;
    s.profile.skinType = 'combination';
    s.products = products;
    s.maskPlan = { days: [1, 3, 5], picks: {} };
    s.customRoutines = [
      routine('평일 아침', 'am', ['cosrx-snail-gel-cleanser', 'torriden-divein-toner', 'cosrx-snail-essence', 'cosrx-ceramide-moisturizer', 'cosrx-vite-sunscreen'], true),
      routine('레티놀 데이 저녁', 'pm', ['cosrx-snail-gel-cleanser', 'cosrx-aha-bha-toner', 'cosrx-retinol-03-cream', 'cosrx-ceramide-moisturizer'], false),
    ];
    s.done = { [`${today}:am`]: [byCat('cosrx-snail-gel-cleanser'), byCat('torriden-divein-toner')] };
  }, { silent: true });
}
