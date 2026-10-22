// 공식 상품 페이지 + PubChem → docs/data/products.json, docs/data/ingredients.json
// 실행: npm run build:catalog   (네트워크 필요. 원문에서 찾지 못한 값은 null = '미확인')
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE_GROUPS, splitIngredients } from '../docs/js/domain/ingredients.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'data');
const { templates, products } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'catalog-sources.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&times;/g, '×').replace(/&lsquo;|&rsquo;|&#39;|&#x27;/g, "'")
  .replace(/&ldquo;|&rdquo;|&quot;/g, '"').replace(/&bull;/g, '•').replace(/&amp;/g, '&');
const pageText = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n'))
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n');
function cut(text, [start, end] = []) {
  if (!start) return null;
  const i = text.indexOf(start);
  if (i < 0) return null;
  const from = i + start.length;
  const j = text.indexOf(end, from);
  const s = text.slice(from, j < 0 ? from + 1500 : j).replace(/\s+/g, ' ').replace(/^[:\s]+/, '').trim();
  return s || null;
}

/** 표준 성분명: 함량 표기 제거, Water/Aqua 표기 통일 */
function standardName(raw) {
  let s = raw.replace(/\(\s*[\d.]+\s*%\s*\)/g, '').replace(/\s+/g, ' ').trim();
  if (/^(water|aqua|watet)(\s*\/\s*(aqua|water|eau))*$/i.test(s)) s = 'Water';
  return s;
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// 단일 화합물이 아닌 원료(고분자·추출물·혼합물)는 분자량이 의미 없거나 오해를 줄 수 있어 조회하지 않음
const NOT_SINGLE = /poly|copolymer|carbomer|hyaluron|cellulose|gum|extract|filtrate|water|oil|butter|wax|ferment|lysate|dimethicone|methicone|siloxane|silica|crosspolymer|hydrolyzed|peptide|dna|pdrn|collagen|protein|peg-|ppg-|lecithin|starch|glucan|ceramide|cholesterol|fruit|leaf|root|seed|flower|bark|juice|powder|alcohol denat|fragrance|parfum|tocotrienol|lactobacillus|bacillus|yeast|mica|oxide|stearate|acrylate|sorbeth|glyceryl|polysorbate|sucrose|triglyceride|alkyl|c\d+-\d+|dimethiconol|cetearyl|dextrin|agar|malachite|metaphosphate|coco|isostearyl|sesquioleate/i;

async function pubchem(name) {
  if (NOT_SINGLE.test(name)) return { status: 'not_single_compound' };
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularWeight,XLogP/JSON`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { status: 'not_found' };
    const p = (await res.json()).PropertyTable.Properties[0];
    return { status: 'ok', cid: p.CID, mw: Number(p.MolecularWeight), xlogp: p.XLogP ?? null, source: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}` };
  } catch {
    return { status: 'error' };
  } finally {
    await sleep(250); // PubChem 요청 제한(초당 5회) 준수
  }
}

const shopify = async (url) => {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}.json`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.ok ? (await res.json()).product : null;
  } catch { return null; }
};

const outProducts = [];
const ingredients = new Map();

for (const src of products) {
  const tpl = templates[src.template];
  const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = pageText(await res.text());
  const meta = await shopify(src.url);
  const ingredientsRaw = cut(text, tpl.ing);
  const usage = cut(text, tpl.use);
  const facts = cut(text, tpl.facts) || '';
  const volume = (facts.match(/Volume (.+?) Key Ingredients/)?.[1] || (/\d/.test(facts) && facts.length < 40 ? facts : '') || '').trim() || null;
  const shelfLife = facts.match(/Expiration (.+?)(?: Allergens|$)/)?.[1]?.trim() || null;
  const description = meta?.body_html ? decode(meta.body_html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 240) : null;
  // 공식 사용법 중 주의 문장만 원문 그대로
  const cautions = (usage || '').split(/(?<=[.!])\s+|\s(?=\*)/).map((s) => s.replace(/^\*+\s*/, '').trim())
    .filter((s) => /avoid|caution|do not|don't|keep refrigerated|sunscreen|spf|patch test|external use|pregnan|sensitivity/i.test(s));

  const list = splitIngredients(ingredientsRaw || '');
  const ingredientIds = [];
  for (const raw of list) {
    const name = standardName(raw);
    const id = slug(name);
    ingredientIds.push(id);
    if (!ingredients.has(id)) ingredients.set(id, { id, inci: name, aliases: new Set(), products: new Set() });
    const ing = ingredients.get(id);
    if (raw !== name) ing.aliases.add(raw);
    ing.products.add(src.id);
  }

  const notes = (src.interactionNotes || []).flatMap((n) => n.groups.map((group) => ({ group, level: n.level, source: `${src.url} — "${n.quote}"` })));
  outProducts.push({
    id: src.id,
    brand: src.brand,
    brandKo: src.brandKo,
    name: meta?.title || null,
    volume,
    category: src.category,
    texture: src.texture,
    textureSource: src.texture ? 'product_name' : null,
    ingredientsRaw,
    ingredientIds,
    description,
    usageOfficial: usage,
    timeOfUse: src.timeOfUse ?? null,
    frequencyPerWeek: src.frequencyPerWeek ?? null,
    frequencyQuote: src.frequencyQuote ?? null,
    officialOrder: src.officialOrder ?? null,
    cautionsOfficial: cautions,
    interactionNotes: notes,
    pregnancyAvoid: Boolean(src.pregnancyAvoid),
    shelfLife,
    imageUrl: null,
    imageStatus: 'rights_unconfirmed',
    region: 'GLOBAL',
    sourceUrl: src.url,
    sourceNote: 'official_global_store',
    verifiedAt: today,
    verificationStatus: ingredientsRaw && usage ? 'official_verified' : 'partial',
  });
  console.log(`${src.id}: ${res.status} ingredients=${list.length} usage=${usage ? 'yes' : 'NO'} volume=${volume ?? '-'}`);
}

const outIngredients = [];
for (const ing of ingredients.values()) {
  const chem = await pubchem(ing.inci);
  const groups = Object.entries(ACTIVE_GROUPS).filter(([, re]) => re.test(ing.inci)).map(([g]) => g);
  outIngredients.push({
    id: ing.id,
    inci: ing.inci,
    nameKo: null, // 한글 표준명은 공식 자료 확인 후 입력
    aliases: [...ing.aliases],
    groups,
    molecularWeight: chem.status === 'ok' ? chem.mw : null,
    xlogp: chem.status === 'ok' ? chem.xlogp : null,
    pubchemCid: chem.cid ?? null,
    chemStatus: chem.status,
    sources: chem.source ? [chem.source] : [],
    productIds: [...ing.products],
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'products.json'), JSON.stringify({ generatedAt: today, products: outProducts }, null, 1));
fs.writeFileSync(path.join(OUT, 'ingredients.json'), JSON.stringify({ generatedAt: today, ingredients: outIngredients }, null, 1));
console.log(`\nproducts=${outProducts.length} ingredients=${outIngredients.length} withMW=${outIngredients.filter((i) => i.molecularWeight).length}`);
