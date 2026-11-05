import { t, fmtDate } from '../i18n.js';
import { html, icon, info, openModal, toast } from '../ui.js';
import { CATEGORIES, categoryById, REGULATORY } from '../domain/categories.js';
import { effectiveExpiry, eligibility, isMask, isEmpty, suggestUsage } from '../domain/product.js';
import { hasIngredientData } from '../domain/ingredients.js';
import { getState, logUsage } from '../store.js';
import { api } from '../api.js';
import { appConfig } from '../app.js';

export const catLabel = (id) => (id ? t(`category.${id}`) : t('common.needsCheck'));
export const productName = (p) => (p ? [p.brand, p.name].filter(Boolean).join(' ') : '');

/** i18n 항목({key, params})을 문자열로 */
export function line({ key, params = {} }) {
  const p = { ...params };
  if (p.category) p.category = catLabel(p.category);
  if (p.reason) p.reason = t(`why.reason.${p.reason}`);
  if (p.groups) p.groups = p.groups.map((g) => t(`group.${g}`)).join(', ');
  if (p.date) p.date = fmtDate(p.date, { dateStyle: 'medium' });
  return t(key, p);
}

/* ---------- 상태 칩 ---------- */
export function statusChips(p, today) {
  const chips = [];
  const e = eligibility(p, getState().profile, today);
  if (e.reasons.includes('unverified') || e.reasons.includes('category_unconfirmed')) chips.push(['check', t('chip.needsCheck')]);
  if (e.reasons.includes('regulatory_check')) chips.push(['caution', t('chip.regulatory')]);
  if (e.reasons.includes('drug')) chips.push(['avoid', t('chip.drug')]);
  if (e.reasons.includes('frequency_unknown')) chips.push(['check', t('chip.frequency')]);
  if (e.reasons.includes('expired')) chips.push(['avoid', t('chip.expired')]);
  if (isEmpty(p)) chips.push(['muted', t('chip.empty')]);
  if (!hasIngredientData(p) && !e.reasons.includes('unverified')) chips.push(['muted', t('chip.noIngredients')]);
  if (e.ok) chips.push(['ok', t('chip.inRoutine')]);
  return html`<span class="chips">${chips.map(([k, label]) => html`<span class="chip chip-${k}">${label}</span>`)}</span>`;
}

export function stockText(p) {
  if (isMask(p)) return t('product.sheets', { n: p.sheetCount ?? 0 });
  const parts = [t('product.remainingPct', { n: p.remainingPct ?? 100 })];
  if ((p.quantity ?? 1) > 1) parts.push(t('product.units', { n: p.quantity }));
  return parts.join(' · ');
}

export function productRow(p, today) {
  const exp = effectiveExpiry(p);
  return html`
    <li>
      <a class="product-row" href="#/product/${p.id}">
        <span class="product-cat">${p.categoryConfirmed ? catLabel(p.category) : html`<span class="unverified">${t('common.needsCheck')}</span>`}</span>
        <span class="product-name">${productName(p) || t('common.untitled')}</span>
        <span class="product-meta">${stockText(p)}${exp ? html` · ${t('product.expiresShort', { date: fmtDate(exp) })}` : ''}</span>
        ${statusChips(p, today)}
        ${icon('chevron', 'row-chevron')}
      </a>
    </li>`;
}

/* ---------- 화장대 오브젝트: 종류별 모양(병·드로퍼·크림통·튜브·펌프·파우치) + 제품마다 고정 파스텔색 ---------- */
const SHAPE = {
  toner: 'bottle', essence: 'bottle', serum: 'dropper', ampoule: 'dropper', oil: 'dropper', spot: 'dropper',
  emulsion: 'pump', cream: 'jar', gel: 'jar', balm: 'jar', pad: 'jar', wash_off_mask: 'jar',
  cleanser: 'tube', sunscreen: 'tube', eye: 'tube', sheet_mask: 'pouch',
};
const TINTS = ['#FFC2D1', '#FFE09E', '#B9E6D8', '#D7C8FA', '#FFCFB3', '#BFE0FF', '#F9C6E8'];
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const bottle = (p, size = '') => html`<span class="obj obj-${SHAPE[p.category || p.categoryHint] || 'bottle'} ${size}" style="--tint:${TINTS[hash(p.id) % TINTS.length]}" aria-hidden="true"><i></i></span>`;

/* ---------- 루틴 단계: 탭해서 체크하는 체크리스트 (자세한 이유·팁·순서 바꾸기는 펼쳐서) ---------- */
export function stepList(steps, slot, productsById, { done = [] } = {}) {
  if (!steps.length) return html`<p class="muted small center">${t('routine.emptySlot')}</p>`;
  return html`<ol class="checklist">${steps.map((s, i) => {
    const p = productsById.get(s.productId);
    if (!p) return '';
    const checked = done.includes(p.id);
    return html`
      <li class="check-item ${checked ? 'is-done' : ''}">
        <button type="button" class="check-btn" data-action="check" data-slot="${slot}" data-id="${p.id}" aria-pressed="${checked}"
          aria-label="${t(checked ? 'home.uncheck' : 'home.check', { name: productName(p) })}">${checked ? icon('check') : html`<span>${s.index}</span>`}</button>
        ${bottle(p, 'sm')}
        <div class="step-main">
          <a class="step-name" href="#/product/${p.id}">${p.name || productName(p)}</a>
          <div class="step-cat">${catLabel(s.category)}${s.perWeek && s.perWeek < 7 ? html` · ${t('routine.perWeek', { n: s.perWeek })}` : ''}${s.warnings.some((w) => !['warn.noIngredients', 'warn.nameOnly'].includes(w.key)) ? html` · <span class="dot-warn">${t('home.checkInfo')}</span>` : ''}</div>
          <details class="step-details">
            <summary>${t('routine.whyAndTips')}</summary>
            <ul>${[...s.why, ...s.tips, ...s.warnings].map((w) => html`<li>${line(w)}</li>`)}</ul>
            <div class="btn-row">
              <button type="button" class="btn btn-ghost btn-sm" data-action="move" data-slot="${slot}" data-id="${p.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>${icon('up', 'sm')} ${t('routine.moveUpShort')}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="move" data-slot="${slot}" data-id="${p.id}" data-dir="1" ${i === steps.length - 1 ? 'disabled' : ''}>${icon('down', 'sm')} ${t('routine.moveDownShort')}</button>
            </div>
          </details>
        </div>
      </li>`;
  })}</ol>`;
}

/** 순서 조정: 현재 화면에 보이는 순서를 기준으로 orderOverrides 재작성 */
export function applyMove(state, steps, id, dir) {
  const ids = steps.map((s) => s.productId);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  // 현재 화면 순서의 정렬 키를 그대로 재배분 → 다른 시간대/요일 순서에 주는 영향 최소화
  const keyOf = (pid) => state.orderOverrides[pid] ?? (categoryById(state.products.find((p) => p.id === pid)?.category)?.order ?? 50) * 10;
  const keys = ids.map(keyOf).sort((a, b) => a - b);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  ids.forEach((pid, k) => { state.orderOverrides[pid] = keys[k] + k * 0.01; });
}

/* ---------- 조합 / 비슷한 제품 / 확인 필요 ---------- */
const LEVEL_CLASS = { avoid: 'avoid', caution: 'caution', check: 'check', info: 'muted' };

export function comboList(combos, productsById) {
  if (!combos.length) return html`<p class="muted small">${t('report.noCombos')}</p>`;
  return html`<ul class="combo-list">${combos.map((c) => html`
    <li class="combo combo-${LEVEL_CLASS[c.level]}">
      <span class="badge badge-${LEVEL_CLASS[c.level]}">${t(`level.${c.level}`)}</span>
      <p class="combo-title">${t(`combo.${c.id}.title`)}</p>
      <p class="small">${c.productIds.map((id) => productName(productsById.get(id))).filter(Boolean).join(' · ')}</p>
      <p class="small muted">${t(`combo.${c.id}.why`)}</p>
      ${c.evidence.length || c.source ? html`
        <details class="evidence"><summary>${t('report.evidence')}</summary>
          <ul>${c.evidence.map((e) => html`<li><strong>${e.productName}</strong> — “${e.match}” <span class="muted">(${t(`source.${e.source}`)})</span></li>`)}</ul>
          ${c.source ? html`<p class="small">${t('report.verifiedSource')}: ${c.source}</p>` : ''}
          <p class="small muted">${t('report.evidenceNote')}</p>
        </details>` : ''}
      <p class="small">${t(`combo.${c.id}.guide`)}</p>
    </li>`)}</ul>`;
}

export function considerList(items, productsById) {
  if (!items.length) return '';
  return html`<ul class="combo-list">${items.map((c) => html`
    <li class="combo combo-ok">
      <span class="badge badge-ok">${t('level.consider')}</span>
      <p class="combo-title">${t(`consider.${c.id}.title`)}</p>
      <p class="small">${c.productIds.map((id) => productName(productsById.get(id))).filter(Boolean).join(' · ')}</p>
      <p class="small muted">${t(`consider.${c.id}.why`)}</p>
      ${c.evidence.length ? html`<details class="evidence"><summary>${t('report.evidence')}</summary><ul>${c.evidence.map((e) => html`<li><strong>${e.productName}</strong> — “${e.match}” <span class="muted">(${t(`source.${e.source}`)})</span></li>`)}</ul></details>` : ''}
    </li>`)}</ul>`;
}

export function similarReason(r) {
  if (r.type === 'same_category') return t('similar.sameCategory', { category: catLabel(r.category) }) + (r.confirmed ? '' : ` (${t('similar.hintOnly')})`);
  if (r.type === 'same_group') return t('similar.sameGroup', { group: t(`catGroup.${r.group}`) });
  if (r.type === 'shared_ingredient') return t('similar.sharedIngredient', { group: t(`group.${r.group}`) }) + (r.fromIngredients ? '' : ` (${t('source.name')})`);
  return '';
}

export function similarList(clusters) {
  if (!clusters.length) return html`<p class="muted small">${t('report.noSimilar')}</p>`;
  return html`<ul class="similar-list">${clusters.map(({ anchor, others }) => html`
    <li class="card-inner">
      <p><a href="#/product/${anchor.id}">${productName(anchor)}</a></p>
      <ul class="small">${others.map(({ product, result }) => html`
        <li><a href="#/product/${product.id}">${productName(product)}</a> — ${result.reasons.map(similarReason).join(', ')}</li>`)}</ul>
    </li>`)}</ul>
    <p class="small muted">${t('report.similarNote')}</p>`;
}

export function needsCheckList(excluded, extraWarnings = []) {
  if (!excluded.length && !extraWarnings.length) return html`<p class="muted small">${t('report.noNeedsCheck')}</p>`;
  return html`<ul class="needs-list">
    ${excluded.map(({ product, reasons }) => html`
      <li>
        <a href="#/product/${product.id}/edit">${productName(product) || t('common.untitled')}</a>
        <ul class="small">${reasons.map((r) => html`<li>${t(`exclude.${r}`)}</li>`)}</ul>
      </li>`)}
    ${extraWarnings.map(({ product, warnings }) => html`
      <li>
        <a href="#/product/${product.id}">${productName(product)}</a>
        <ul class="small">${warnings.map((w) => html`<li>${line(w)}</li>`)}</ul>
      </li>`)}
  </ul>`;
}

/* ---------- 제품 입력 폼 (등록/수정 공용) ---------- */
export function productForm(p, { submitLabel, regions, wishlist = false } = {}) {
  const v = (k) => p?.[k] ?? '';
  const opt = (value, label, current) => html`<option value="${value}" ${String(current) === String(value) ? 'selected' : ''}>${label}</option>`;
  const showMask = p?.category === 'sheet_mask' || (!p?.category && p?.categoryHint === 'sheet_mask');
  return html`
  <form class="form" id="product-form" novalidate>
    <div class="field-row">
      <label class="field"><span>${t('form.brand')}</span><input name="brand" value="${v('brand')}" autocomplete="off" maxlength="120"></label>
      <label class="field"><span>${t('form.name')} <em class="req">*</em></span><input name="name" value="${v('name')}" required autocomplete="off" maxlength="200"></label>
    </div>
    <label class="field">
      <span>${t('form.category')} <em class="req">*</em> ${info(t('form.categoryInfo'))}</span>
      <select name="category" required>
        ${opt('', t('form.choose'), v('category'))}
        ${CATEGORIES.map((c) => opt(c.id, t(`category.${c.id}`), v('category')))}
      </select>
      ${p?.categoryHint && !p?.categoryConfirmed ? html`<small class="hint">${t('form.categoryHint', { category: catLabel(p.categoryHint) })} <button type="button" class="link-btn" data-action="apply-hint" data-value="${p.categoryHint}">${t('form.apply')}</button></small>` : ''}
      <small class="hint">${t('scope.notice')}</small>
    </label>
    <div class="notice notice-check makeup-warning" hidden role="status">${icon('alert')}<span>${t('scope.makeupDetected')}</span></div>
    <div id="dup-check" aria-live="polite"></div>
    ${wishlist ? '' : html`
    <div class="field-row">
      <label class="field"><span>${t('form.volume')}</span><input name="volume" value="${v('volume')}" placeholder="50 mL" maxlength="40"></label>
      <label class="field mask-only" ${showMask ? '' : 'hidden'}><span>${t('form.sheetCount')}</span><input name="sheetCount" type="number" min="0" max="999" inputmode="numeric" value="${v('sheetCount')}"></label>
      <label class="field non-mask" ${showMask ? 'hidden' : ''}><span>${t('form.quantity')} ${info(t('form.quantityInfo'))}</span><input name="quantity" type="number" min="0" max="99" inputmode="numeric" value="${p?.quantity ?? 1}"></label>
    </div>
    <label class="field">
      <span>${t('form.regulatory')} ${info(t('form.regulatoryInfo'))}</span>
      <select name="regulatory">${REGULATORY.map((r) => opt(r, t(`regulatory.${r}`), v('regulatory') || 'cosmetic'))}</select>
      ${p?.pharmaFlag ? html`<small class="hint warn">${t('form.pharmaFlag')}</small>` : ''}
    </label>`}
    <label class="field">
      <span>${t('form.ingredients')} ${info(t('form.ingredientsInfo'))}</span>
      <textarea name="ingredientsText" rows="4" placeholder="${t('form.ingredientsPlaceholder')}" maxlength="8000">${v('ingredientsText')}</textarea>
    </label>
    ${wishlist ? '' : html`
    <label class="field">
      <span>${t('form.usage')} ${info(t('form.usageInfo'))}</span>
      <textarea name="usageText" rows="3" maxlength="3000" placeholder="${t('form.usagePlaceholder')}">${v('usageText')}</textarea>
    </label>
    <label class="field">
      <span>${t('form.warnings')}</span>
      <textarea name="warningsText" rows="2" maxlength="3000">${v('warningsText')}</textarea>
    </label>
    <div class="field-row">
      <label class="field"><span>${t('form.timeOfUse')} ${info(t('form.timeOfUseInfo'))}</span>
        <select name="timeOfUse">${['auto', 'am', 'pm', 'both'].map((x) => opt(x, t(`timeOfUse.${x}`), v('timeOfUse') || 'auto'))}</select></label>
      <label class="field"><span>${t('form.frequency')} ${info(t('form.frequencyInfo'))}</span>
        <select name="frequencyPerWeek">${opt('', t('form.frequencyUnknown'), v('frequencyPerWeek'))}${[1, 2, 3, 4, 5, 6, 7].map((n) => opt(n, n === 7 ? t('form.daily') : t('routine.perWeek', { n }), v('frequencyPerWeek')))}</select></label>
    </div>
    <p class="usage-hint" id="usage-hint" aria-live="polite">${usageHint(p || {})}</p>
    <label class="field"><span>${t('form.texture')} ${info(t('form.textureInfo'))}</span>
      <select name="texture">${opt('', t('form.choose'), v('texture'))}${['water', 'gel', 'milk', 'cream', 'oil'].map((x) => opt(x, t(`texture.${x}`), v('texture')))}</select></label>
    <div class="field-row">
      <label class="field"><span>${t('form.openedAt')}</span><input type="date" name="openedAt" value="${v('openedAt')}"></label>
      <label class="field"><span>${t('form.expiresAt')}</span><input type="date" name="expiresAt" value="${v('expiresAt')}"></label>
    </div>
    <label class="field"><span>${t('form.pao')} ${info(t('form.paoInfo'))}</span>
      <span class="input-suffix"><input type="number" name="paoMonths" min="1" max="60" inputmode="numeric" value="${v('paoMonths')}" placeholder="12"><b>${t('product.monthsUnit')}</b></span></label>
    <label class="field non-mask" ${showMask ? 'hidden' : ''}>
      <span>${t('form.remaining')} <output id="remaining-out">${p?.remainingPct ?? 100}%</output></span>
      <input type="range" name="remainingPct" min="0" max="100" step="5" value="${p?.remainingPct ?? 100}" aria-describedby="remaining-out">
    </label>
    <label class="field">
      <span>${t('form.region')} ${info(t('form.regionInfo'))}</span>
      <select name="region">${opt('', t('form.choose'), v('region'))}${(regions || []).map((r) => opt(r, t(`region.${r}`), v('region')))}</select>
    </label>
    <label class="field"><span>${t('form.notes')}</span><textarea name="notes" rows="2" maxlength="1000">${v('notes')}</textarea></label>
    <label class="check-field">
      <input type="checkbox" name="verified" ${p?.verified ? 'checked' : ''}>
      <span>${t('form.verified')} ${info(t('form.verifiedInfo'))}</span>
    </label>`}
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">${submitLabel || t('common.save')}</button></div>
  </form>`;
}

/** "자동"을 골랐을 때 앱이 정한 사용 시간·빈도와 근거 */
export function usageHint(p) {
  const s = suggestUsage(p);
  const time = p.timeOfUse && p.timeOfUse !== 'auto' ? t(`timeOfUse.${p.timeOfUse}`) : t(`timeOfUse.${s.timeOfUse}`);
  const freq = p.frequencyPerWeek ? Number(p.frequencyPerWeek) : s.perWeek;
  return t('form.autoHint', {
    time,
    freq: freq >= 7 ? t('form.daily') : t('routine.perWeek', { n: freq }),
    why: s.basis ? t(`group.${s.basis}`) : t('form.autoBasisNone'),
  });
}

/** 폼 값 → 제품 필드 */
export function readProductForm(form) {
  const f = Object.fromEntries(new FormData(form).entries());
  const num = (x) => (x === '' || x == null ? null : Number(x));
  return {
    brand: (f.brand || '').trim(),
    name: (f.name || '').trim(),
    category: f.category || null,
    categoryConfirmed: Boolean(f.category),
    volume: f.volume ?? '',
    sheetCount: f.category === 'sheet_mask' ? Math.max(0, num(f.sheetCount) ?? 0) : null,
    quantity: Math.max(0, num(f.quantity) ?? 1),
    regulatory: f.regulatory || 'cosmetic',
    ingredientsText: (f.ingredientsText || '').trim(),
    usageText: (f.usageText || '').trim(),
    warningsText: (f.warningsText || '').trim(),
    timeOfUse: f.timeOfUse || 'auto',
    frequencyPerWeek: num(f.frequencyPerWeek),
    texture: f.texture || '',
    openedAt: f.openedAt || '',
    paoMonths: num(f.paoMonths),
    expiresAt: f.expiresAt || '',
    remainingPct: num(f.remainingPct) ?? 100,
    region: f.region || '',
    notes: (f.notes || '').trim(),
    verified: form.elements.verified ? form.elements.verified.checked : false,
  };
}

/* ---------- 구매 링크 (재구매 의사가 있을 때만, 제휴 표시 포함) ---------- */
export async function purchaseBlock(container, product) {
  const s = getState();
  const region = s.settings.region;
  // 서버가 해당 지역 제휴 설정(또는 관리자가 등록한 제휴 링크)이 없으면 null 을 돌려줌 → 버튼 숨김
  if (!s.settings.showPurchaseLinks || appConfig().offline) { container.innerHTML = ''; return; }
  container.innerHTML = `<p class="muted small">${t('common.loading')}</p>`;
  try {
    const { link } = await api.purchaseLink({ region, query: productName(product), catalogId: product.catalogId });
    if (!link) { container.innerHTML = ''; return; }
    const a = document.createElement('a');
    a.className = 'btn btn-primary btn-block';
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer sponsored';
    a.textContent = t(link.kind === 'search' ? 'buy.searchCta' : 'buy.productCta', { provider: t(`provider.${link.provider}`) });
    const note = document.createElement('p');
    note.className = 'small muted';
    note.textContent = `${t('buy.adLabel')} · ${t(link.disclosureKey)} ${link.kind === 'search' ? t('buy.searchNote') : ''}`;
    container.replaceChildren(a, note);
  } catch {
    container.innerHTML = '';
  }
}

/* ---------- 마스크팩 마지막 장 사용 후 피드백 ---------- */
export function feedbackModal(product) {
  openModal({
    title: t('feedback.title'),
    body: html`
      <p>${t('feedback.lead', { name: productName(product) })}</p>
      <fieldset class="radio-group"><legend>${t('feedback.q1')}</legend>
        ${['satisfied', 'neutral', 'irritated'].map((v) => html`<label class="radio-pill"><input type="radio" name="satisfaction" value="${v}"><span>${t(`feedback.${v}`)}</span></label>`)}
      </fieldset>
      <fieldset class="radio-group"><legend>${t('feedback.q2')}</legend>
        ${['yes', 'no'].map((v) => html`<label class="radio-pill"><input type="radio" name="repurchase" value="${v}"><span>${t(`feedback.repurchase_${v}`)}</span></label>`)}
      </fieldset>
      <div class="irritation-note notice notice-caution" hidden>${t('feedback.irritationNote')}</div>
      <div class="buy-slot"></div>`,
    actions: [
      { label: t('common.later') },
      {
        label: t('common.save'),
        kind: 'btn-primary',
        onClick: (modal) => {
          const satisfaction = modal.querySelector('[name=satisfaction]:checked')?.value || null;
          const repurchase = modal.querySelector('[name=repurchase]:checked')?.value || null;
          logUsage({ productId: product.id, type: 'feedback', satisfaction, repurchase });
          toast(t('feedback.saved'));
        },
      },
    ],
    onMount: (modal) => {
      modal.addEventListener('change', (e) => {
        if (e.target.name === 'satisfaction') modal.querySelector('.irritation-note').hidden = e.target.value !== 'irritated';
        if (e.target.name === 'repurchase') {
          const slot = modal.querySelector('.buy-slot');
          if (e.target.value === 'yes') purchaseBlock(slot, product);
          else slot.innerHTML = '';
        }
      });
    },
  });
}
