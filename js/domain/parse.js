import { guessCategory, looksLikeMakeup } from './categories.js';

/*
 * OCR(또는 붙여넣은) 라벨 텍스트 → 제품 정보 초안.
 * 텍스트에 있는 내용만 옮기며, 없는 정보는 빈 값으로 둔다.
 */
const SECTION_MARKERS = [
  ['ingredients', /(전\s?성분|성분명|ingredients?|inci)\s*[:：]?/i],
  ['usage', /(사용\s?방법|사용법|사용\s?순서|directions(?: for use)?|how to use)\s*[:：]?/i],
  ['warnings', /(사용\s?시의?\s?주의\s?사항|주의\s?사항|cautions?|warnings?)\s*[:：]?/i],
  ['stop', /(제조\s?(번호|일자|업자|판매업자)|책임판매업자|용량|내용량|사용기한|유통기한|net\s?(wt|vol)|manufactured|made in|distributed by)/i],
];

function sliceSections(text) {
  const hits = [];
  for (const [name, re] of SECTION_MARKERS) {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(text))) hits.push({ name, start: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);
  const out = {};
  hits.forEach((h, i) => {
    if (h.name === 'stop' || out[h.name]) return;
    const next = hits.slice(i + 1).find((x) => x.start > h.end);
    out[h.name] = text.slice(h.end, next ? next.start : undefined).trim();
  });
  return out;
}

const VOLUME_RE = /(\d+(?:[.,]\d+)?)\s*(ml|mL|ML|g|kg|fl\.?\s?oz|oz|매|장|sheets?|ea)\b/;

export function parseLabelText(frontText = '', backText = '') {
  const all = `${frontText}\n${backText}`.replace(/[ \t]+/g, ' ');
  const sections = sliceSections(all);
  const firstLines = frontText.split('\n').map((s) => s.trim()).filter((s) => s.length > 1);
  const volume = all.match(VOLUME_RE);
  const markings = [];
  if (/기능성\s?화장품|functional cosmetic/i.test(all)) markings.push('기능성화장품');
  if (/의약외품|quasi[-\s]?drug/i.test(all)) markings.push('의약외품');
  if (/일반\s?의약품|전문\s?의약품|drug facts|active ingredients?\s*[:：]/i.test(all)) markings.push('의약품 표시');
  const spf = all.match(/SPF\s?\d+\+?/i);
  if (spf) markings.push(spf[0]);
  const pa = all.match(/PA\+{1,4}/);
  if (pa) markings.push(pa[0]);

  let regulatory = '';
  if (markings.includes('의약품 표시')) regulatory = 'unknown';
  else if (markings.includes('의약외품')) regulatory = 'quasi_drug';
  else if (markings.includes('기능성화장품')) regulatory = 'functional_cosmetic';

  return {
    brand: '',
    name: firstLines.slice(0, 2).join(' ').slice(0, 80),
    volume: volume ? `${volume[1]} ${volume[2]}` : '',
    categoryHint: guessCategory(frontText) || guessCategory(all) || (spf ? 'sunscreen' : null),
    ingredientsText: (sections.ingredients || '').replace(/\n/g, ' ').trim(),
    usageText: sections.usage || '',
    warningsText: sections.warnings || '',
    regulatoryMarkings: markings,
    regulatory,
    isMakeup: looksLikeMakeup(frontText),
  };
}
