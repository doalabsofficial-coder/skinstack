import { detectGroups } from './ingredients.js';

/*
 * 상품 DB (docs/data/*.json, scripts/build-catalog.mjs 로 생성).
 * 서버 없이(GitHub Pages)도 같은 데이터를 읽기 때문에 PC·모바일 어디서나 동일하게 보입니다.
 */
let products = null;
let ingredientsById = null;
let loading = null;

export function loadCatalog() {
  loading ??= Promise.all([
    fetch('data/products.json').then((r) => { if (!r.ok) throw new Error('catalog_load_failed'); return r.json(); }),
    fetch('data/ingredients.json').then((r) => { if (!r.ok) throw new Error('catalog_load_failed'); return r.json(); }),
  ]).then(([p, i]) => {
    setCatalog(p, i);
    return products;
  }).catch((err) => { loading = null; throw err; });
  return loading;
}

/** 테스트·서버에서 직접 데이터를 넣을 때 사용 */
export function setCatalog(p, i) {
  products = p.products.map(toAnalysisProduct);
  ingredientsById = new Map(i.ingredients.map((x) => [x.id, x]));
}

export const catalogProducts = () => products;
export const catalogProduct = (id) => products?.find((p) => p.id === id) || null;
export const ingredient = (id) => ingredientsById?.get(id) || null;

/** 분석·화면에서 쓰는 공통 형태 (화장대 제품과 같은 필드명) */
function toAnalysisProduct(c) {
  return {
    ...c,
    source: 'catalog',
    catalogId: c.id,
    ingredientsText: c.ingredientsRaw || '',
    usageText: c.usageOfficial || '',
    warningsText: (c.cautionsOfficial || []).join(' '),
  };
}

/** 대표 성분 그룹 (전성분에서 확인된 것만) */
export const keyGroups = (p) => detectGroups(p).filter((g) => g.source === 'ingredients' && !['fragrance', 'uv_filter'].includes(g.group)).map((g) => g.group);

/**
 * 검색 + 필터. q 는 브랜드(영/한), 제품명, 성분 그룹 이름(현재 언어)과 비교.
 * @param {{q?:string, category?:string, brand?:string, texture?:string, slot?:'am'|'pm'}} f
 * @param {(group:string)=>string} groupLabel
 */
export function searchCatalog(f = {}, groupLabel = (g) => g) {
  if (!products) return [];
  const q = (f.q || '').trim().toLowerCase();
  return products.filter((p) => {
    if (f.category && p.category !== f.category) return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.texture && p.texture !== f.texture) return false;
    if (f.slot && p.timeOfUse && p.timeOfUse !== 'both' && p.timeOfUse !== f.slot) return false;
    if (!q) return true;
    const hay = [p.brand, p.brandKo, p.name, ...keyGroups(p).map(groupLabel)].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}

/** XLogP → 수용성/지용성 경향 (추정치임을 화면에 함께 표시) */
export function polarity(xlogp) {
  if (xlogp == null) return null;
  if (xlogp < 0) return 'water';
  if (xlogp <= 3) return 'mid';
  return 'oil';
}

/*
 * 제형 분석(앱 추정): 전성분 순서 기준. 함량은 알 수 없으므로 '경향'으로만 표시.
 */
const OILY = /oil|butter|squalane|triglyceride|palmitate|carbonate|dimethicone|isododecane|ethylhexanoate|malate/i;
const FILM = /dimethicone|polymer|acrylates|carbomer|cellulose|gum|pvp|polyacrylate/i;
const OCCLUSIVE = /petrolatum|dimethicone|butter|squalane|mineral oil|paraffin|wax|lanolin/i;
export function textureAnalysis(p) {
  const all = (p.ingredientIds || []).map((id) => ingredient(id)).filter(Boolean);
  const top = all.slice(0, 10);
  return {
    waterFirst: /^water$/i.test(top[0]?.inci || ''),
    oilyTop: top.filter((i) => OILY.test(i.inci)).map((i) => i.inci),
    filmFormers: all.filter((i) => FILM.test(i.inci)).map((i) => i.inci),
    occlusives: all.filter((i) => OCCLUSIVE.test(i.inci)).map((i) => i.inci),
  };
}
