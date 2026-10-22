import { t, getLang, errorText, has } from '../i18n.js';
import { html, htmlString, icon, info, spinner, errorState, openModal, toast, fileToDataUrl } from '../ui.js';
import { api } from '../api.js';
import { getState, update, upsertProduct } from '../store.js';
import { createProduct } from '../domain/product.js';
import { findSimilar } from '../domain/duplicates.js';
import { parseLabelText } from '../domain/parse.js';
import { looksLikeMakeup, guessCategory, CATEGORY_IDS } from '../domain/categories.js';
import { productForm, readProductForm, productName, similarReason, catLabel, usageHint } from './common.js';
import { loadCatalog, searchCatalog } from '../domain/catalog.js';

const MODES = ['search', 'photo', 'manual'];
let draft = null; // 검색/사진에서 넘어온 초안 (사용자 확인 전)
let draftNotice = null;

export const hideNav = false;
export const title = (ctx) => (ctx.params.id ? t('add.editTitle') : ctx.query.mode === 'wishlist' ? t('wishlist.add') : t('add.title'));
export const back = (ctx) => (ctx.params.id ? `/product/${ctx.params.id}` : ctx.query.mode === 'wishlist' ? '/vault' : '/vault');

export function render(ctx) {
  const s = ctx.state;
  const regions = ctx.config.regions;

  if (ctx.params.id) {
    const p = s.products.find((x) => x.id === ctx.params.id);
    if (!p) return errorState(t('product.notFound'));
    return html`
      ${p.dataSource === 'demo' ? html`<p class="notice notice-check small">${icon('alert')}<span>${t('add.demoNotice')}</span></p>` : ''}
      ${productForm(p, { submitLabel: t('common.save'), regions })}`;
  }

  if (ctx.query.mode === 'wishlist') {
    return html`<p class="muted small">${t('wishlist.lead')}</p>${productForm({}, { submitLabel: t('wishlist.addCta'), regions, wishlist: true })}`;
  }

  const mode = MODES.includes(ctx.query.mode) ? ctx.query.mode : 'search';
  const tabs = html`
    <div class="tabs segmented" role="tablist" aria-label="${t('add.methods')}">
      ${MODES.map((m) => html`<a role="tab" aria-selected="${m === mode}" class="tab ${m === mode ? 'active' : ''}" href="#/add?mode=${m}">${icon(m === 'search' ? 'search' : m === 'photo' ? 'camera' : 'edit')} ${t(`add.mode.${m}`)}</a>`)}
    </div>
    <p class="small muted scope-line">${icon('shield', 'sm')} ${t('scope.notice')}</p>`;

  if (mode === 'search') {
    return html`${tabs}
      <form class="search-bar" role="search" id="catalog-search">
        ${icon('search')}
        <label class="sr-only" for="cq">${t('add.searchLabel')}</label>
        <input id="cq" name="q" type="search" required minlength="1" placeholder="${t('add.searchPlaceholder')}" autocomplete="off">
        <button class="btn btn-primary btn-sm" type="submit">${t('add.searchCta')}</button>
      </form>
      <div id="search-results" aria-live="polite">
        <p class="muted small">${t('add.searchHint')} ${info(t('add.searchInfo'))}</p>
      </div>`;
  }

  if (mode === 'photo') {
    return html`${tabs}
      <section class="card">
        <h3 class="card-title">${t('add.photoTitle')} ${info(ctx.config.ocrAi ? t('add.photoInfoAi') : t('add.photoInfoLocal'))}</h3>
        <p class="muted small">${t('add.photoLead')}</p>
        <ul class="chips photo-tips">${['close', 'light', 'flat', 'glare'].map((k) => html`<li class="chip chip-accent">${t(`add.tip.${k}`)}</li>`)}</ul>
        <div class="photo-grid">
          ${['front', 'back'].map((side) => html`
            <label class="photo-slot" for="photo-${side}">
              <input id="photo-${side}" type="file" accept="image/*" capture="environment" data-side="${side}" class="sr-only">
              <span class="photo-preview" id="preview-${side}">${icon('camera')}<span>${t(`add.${side}`)}</span></span>
            </label>`)}
        </div>
        <button type="button" class="btn btn-primary btn-block" data-action="ocr" disabled>${t('add.extract')}</button>
        <div id="ocr-status" aria-live="polite"></div>
        <p class="small muted">${ctx.config.ocrAi ? t('add.privacyAi') : t('add.privacyLocal')}</p>
      </section>`;
  }

  // manual
  const base = draft || { categoryHint: CATEGORY_IDS.includes(ctx.query.category) ? ctx.query.category : null, category: CATEGORY_IDS.includes(ctx.query.category) ? ctx.query.category : null, region: s.settings.region };
  return html`${tabs}
    ${draftNotice ? html`<p class="notice notice-check small" role="status">${icon('alert')}<span>${draftNotice}</span></p>` : ''}
    ${draft?.rawText ? html`<details class="card raw-text"><summary>${t('add.rawText')}</summary><pre>${draft.rawText}</pre></details>` : ''}
    ${productForm(base, { submitLabel: t('add.save'), regions })}
    <p class="center small"><a href="#/requests">${t('add.notFoundRequest')}</a></p>`;
}

/* ---------- 이벤트 ---------- */

function bindForm(root, ctx) {
  const form = root.querySelector('#product-form');
  if (!form) return;
  const wishlist = ctx.query.mode === 'wishlist';
  const editing = ctx.params.id;

  const refreshDup = () => {
    const box = form.querySelector('#dup-check');
    const s = getState();
    if (!box || !s.settings.duplicateAlerts) return;
    const values = readProductForm(form);
    if (!values.name) { box.innerHTML = ''; return; }
    const sims = findSimilar({ ...values, id: editing || '__new__', categoryHint: guessCategory(values.name) }, s.products).slice(0, 3);
    box.innerHTML = sims.length ? htmlString(html`<div class="notice notice-check small">${icon('layers')}<div><strong>${t('dup.inline', { n: sims.length })}</strong><ul>${sims.map((x) => html`<li>${productName(x.product)} — ${x.result.reasons.map(similarReason).join(', ')}</li>`)}</ul></div></div>`) : '';
  };
  const refreshMakeup = () => {
    const name = form.elements.name.value;
    form.querySelector('.makeup-warning').hidden = !looksLikeMakeup(name);
  };
  const toggleMask = () => {
    const isMask = form.elements.category.value === 'sheet_mask';
    form.querySelectorAll('.mask-only').forEach((el) => { el.hidden = !isMask; });
    form.querySelectorAll('.non-mask').forEach((el) => { el.hidden = isMask; });
  };

  // 성분·종류·이름이 바뀌면 "자동" 사용 시간·빈도 안내를 바로 갱신
  const refreshUsage = () => {
    const el = form.querySelector('#usage-hint');
    if (el) el.textContent = usageHint(readProductForm(form));
  };
  form.addEventListener('input', (e) => {
    if (e.target.name === 'remainingPct') form.querySelector('#remaining-out').textContent = `${e.target.value}%`;
    if (e.target.name === 'name') { refreshMakeup(); refreshDup(); }
    if (['ingredientsText', 'name'].includes(e.target.name)) refreshUsage();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'category') { toggleMask(); refreshDup(); }
    if (['category', 'timeOfUse', 'frequencyPerWeek'].includes(e.target.name)) refreshUsage();
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action="apply-hint"]');
    if (b) {
      form.elements.category.value = b.dataset.value;
      toggleMask();
      refreshDup();
    }
  });
  refreshMakeup();
  refreshDup();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = readProductForm(form);
    const err = form.querySelector('.form-error');
    if (!values.name) {
      err.textContent = t('form.nameRequired');
      err.hidden = false;
      form.elements.name.focus();
      return;
    }
    err.hidden = true;
    const s = getState();

    if (wishlist) {
      const item = { id: crypto.randomUUID(), brand: values.brand, name: values.name, category: values.category, categoryHint: guessCategory(values.name), ingredientsText: values.ingredientsText, createdAt: new Date().toISOString() };
      const save = () => { update((st) => { st.wishlist.push(item); }); toast(t('wishlist.added')); ctx.navigate('/vault'); };
      const sims = findSimilar(item, s.products);
      if (sims.length && s.settings.duplicateAlerts) duplicateModal(sims, save, { wishlist: true });
      else save();
      return;
    }

    if (editing) {
      const current = s.products.find((p) => p.id === editing);
      upsertProduct({ ...current, ...values, categoryHint: current.categoryHint });
      contribute({ ...current, ...values });
      toast(t('common.saved'));
      ctx.navigate(`/product/${editing}`);
      return;
    }

    const candidate = createProduct({ ...(draft || {}), ...values, dataSource: draft?.dataSource || 'manual', catalogId: draft?.catalogId || null, interactionNotes: draft?.interactionNotes || [], regulatoryMarkings: draft?.regulatoryMarkings || [] });
    const save = () => {
      update((st) => { st.products.push(candidate); });
      contribute(candidate);
      draft = null;
      draftNotice = null;
      toast(t('add.saved'));
      ctx.navigate(`/product/${candidate.id}`);
    };
    const sims = findSimilar(candidate, s.products);
    if (sims.length && s.settings.duplicateAlerts) duplicateModal(sims, save);
    else save();
  });
}

function duplicateModal(sims, onSave, { wishlist = false } = {}) {
  openModal({
    title: t('dup.title'),
    body: html`
      <p>${t(wishlist ? 'dup.leadWishlist' : 'dup.lead')}</p>
      <ul class="dup-list">${sims.slice(0, 5).map(({ product, result }) => html`
        <li><a href="#/product/${product.id}">${productName(product)}</a>
          <span class="small muted">${catLabel(product.category || product.categoryHint)}</span>
          <ul class="small">${result.reasons.map((r) => html`<li>${similarReason(r)}</li>`)}</ul></li>`)}</ul>
      <p class="small muted">${t('dup.note')}</p>
      <label class="check-field small"><input type="checkbox" id="dup-off"><span>${t('dup.turnOff')}</span></label>`,
    actions: [
      { label: t('dup.useFirst') },
      { label: t(wishlist ? 'dup.addAnyway' : 'dup.saveAnyway'), kind: 'btn-primary', onClick: (modal) => {
        if (modal.querySelector('#dup-off').checked) update((s) => { s.settings.duplicateAlerts = false; }, { silent: true });
        onSave();
      } },
    ],
  });
}

function catalogToDraft(item) {
  const community = item.source === 'community';
  const d = {
    brand: item.brand,
    name: getLang() === 'en' && item.nameEn ? item.nameEn : item.name,
    volume: item.volume,
    category: item.category,
    categoryHint: item.category,
    ingredientsText: item.ingredientsText,
    usageText: item.usageText,
    warningsText: item.warningsText,
    region: item.region,
    catalogId: community ? null : item.id,
    interactionNotes: community ? [] : item.interactionNotes,
    dataSource: community ? 'community' : 'catalog',
  };
  if (item.regulatory) d.regulatory = item.regulatory;
  // 상품 DB(공식 사용법)에서 온 항목만 가진 필드
  if (item.officialOrder) d.officialOrder = item.officialOrder;
  if (item.pregnancyAvoid) d.pregnancyAvoid = true;
  if (item.timeOfUse) d.timeOfUse = item.timeOfUse;
  if (item.frequencyPerWeek) Object.assign(d, { frequencyPerWeek: item.frequencyPerWeek, frequencyQuote: item.frequencyQuote });
  if (item.texture) d.texture = item.texture;
  return d;
}

/** 라벨과 대조해 확인한 제품 정보만 누적 데이터로 공유 (개인 정보 제외, 설정에서 끌 수 있음) */
function contribute(p) {
  const s = getState();
  if (!s.settings.shareContributions || !p.verified || !p.category || !p.name) return;
  api.contribute({
    brand: p.brand, name: p.name, volume: p.volume, category: p.category,
    ingredientsText: p.ingredientsText, usageText: p.usageText, region: p.region || s.settings.region,
  }).catch(() => { /* 공유 실패는 등록에 영향 없음 */ });
}

let lastResults = [];

function bindSearch(root, ctx) {
  const form = root.querySelector('#catalog-search');
  if (!form) return;
  const out = root.querySelector('#search-results');
  const run = async () => {
    const q = form.q.value.trim();
    if (!q) return;
    out.innerHTML = htmlString(spinner(t('add.searching')));
    try {
      // 상품 DB(정적 데이터, 서버 없이도 동작) + 서버(관리자 승인·고객 입력). 서버가 없으면 상품 DB만
      await loadCatalog().catch(() => {});
      const local = searchCatalog({ q }, (g) => t(`group.${g}`));
      const remote = ctx.config.offline ? [] : (await api.searchCatalog(q).catch(() => ({ items: [] }))).items;
      const items = [...local, ...remote.filter((r) => !local.some((l) => `${l.brand} ${l.name}`.toLowerCase() === `${r.brand} ${r.name}`.toLowerCase()))];
      lastResults = items;
      if (!items.length) {
        out.innerHTML = htmlString(html`
          <div class="empty compact">
            <p class="empty-title">${t('add.noResults', { q })}</p>
            <p class="muted small">${t('add.noResultsText')}</p>
            <div class="empty-actions">
              <a class="btn btn-primary btn-sm" href="#/add?mode=photo">${icon('camera')} ${t('add.mode.photo')}</a>
              <a class="btn btn-ghost btn-sm" href="#/add?mode=manual">${icon('edit')} ${t('add.mode.manual')}</a>
              <a class="btn btn-ghost btn-sm" href="#/requests?brand=&name=${encodeURIComponent(q)}">${t('requests.cta')}</a>
            </div>
          </div>`);
        return;
      }
      out.innerHTML = htmlString(html`<ul class="result-list">${items.map((it, i) => html`
        <li><button type="button" class="result" data-action="pick" data-index="${i}">
          <span class="product-cat">${catLabel(it.category)}</span>
          <span class="product-name">${it.brand} ${it.name}</span>
          <span class="product-meta">${it.volume || ''} ${it.ingredientsText ? '' : html`· ${t('chip.noIngredients')}`}</span>
          ${it.source === 'community'
            ? html`<span class="chip chip-check">${t('add.communityData', { n: it.contributorCount })}</span>`
            : html`<span class="chip chip-ok">${t('add.verifiedCatalog')}</span>`}
        </button></li>`)}</ul>`);
    } catch (err) {
      out.innerHTML = htmlString(errorState(errorText(err.code), 'retry-search'));
    }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  out.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="retry-search"]')) return run();
    const pick = e.target.closest('[data-action="pick"]');
    if (!pick) return;
    const item = lastResults[Number(pick.dataset.index)];
    draft = catalogToDraft(item);
    draftNotice = t(item.source === 'community' ? 'add.communityNotice' : 'add.catalogNotice');
    ctx.navigate('/add?mode=manual');
  });
  form.q.focus();
}

/* ---------- 사진 → 텍스트 ---------- */
let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  tesseractLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { tesseractLoading = null; reject(new Error('ocr_load_failed')); };
    document.head.append(s);
  });
  return tesseractLoading;
}

/**
 * 무료 OCR 전처리: 사진 방향 보정 + 크기만 맞춤(작은 사진은 최대 2배 확대, 큰 사진은 2400px).
 * 흑백·대비 보정은 하지 않음 — 실험 결과 Tesseract 내부 이진화보다 나빠져 인식이 거의 0이 됨.
 */
async function prepareForOcr(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(2400 / Math.max(bmp.width, bmp.height), 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function bindPhoto(root, ctx) {
  const card = root.querySelector('.photo-grid');
  if (!card) return;
  const images = { front: null, back: null };
  const files = { front: null, back: null };
  const btn = root.querySelector('[data-action="ocr"]');
  const status = root.querySelector('#ocr-status');

  root.querySelectorAll('input[type=file]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
        images[input.dataset.side] = dataUrl;
        files[input.dataset.side] = file; // 무료 OCR은 원본에서 따로 전처리
        const prev = root.querySelector(`#preview-${input.dataset.side}`);
        prev.innerHTML = '';
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = t(`add.${input.dataset.side}`);
        prev.append(img);
        btn.disabled = !(images.front || images.back);
      } catch {
        status.innerHTML = htmlString(errorState(t('error.invalid_image')));
      }
    });
  });

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.innerHTML = htmlString(spinner(t('add.extracting')));
    try {
      let parsed;
      if (ctx.config.ocrAi) {
        const r = await api.ocr(images.front, images.back);
        parsed = {
          brand: r.brand, name: r.productName, volume: r.volume,
          categoryHint: CATEGORY_IDS.includes(r.categoryGuess) ? r.categoryGuess : null,
          ingredientsText: r.ingredientsText, usageText: r.usageText, warningsText: r.warningsText,
          regulatoryMarkings: r.regulatoryMarkings || [],
          isMakeup: r.isMakeup || r.categoryGuess === 'makeup',
          rawText: r.notes || '',
          regulatory: (r.regulatoryMarkings || []).some((m) => /의약외품|quasi/i.test(m)) ? 'quasi_drug'
            : (r.regulatoryMarkings || []).some((m) => /의약품|drug facts/i.test(m)) ? 'unknown'
              : (r.regulatoryMarkings || []).some((m) => /기능성/.test(m)) ? 'functional_cosmetic' : '',
          readable: r.readable,
        };
      } else {
        const T = await loadTesseract();
        const texts = {};
        let side = 'front';
        const worker = await T.createWorker('kor+eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') status.innerHTML = htmlString(spinner(t('add.recognizing', { side: t(`add.${side}`), pct: Math.round(m.progress * 100) })));
          },
        });
        try {
          for (side of ['front', 'back']) {
            if (!files[side]) { texts[side] = ''; continue; }
            // 앞면은 자동 배치, 뒷면(전성분 문단)은 한 덩어리 글 블록으로 읽음
            await worker.setParameters({ tessedit_pageseg_mode: side === 'back' ? '6' : '3' });
            const res = await worker.recognize(await prepareForOcr(files[side]));
            texts[side] = res.data.text || '';
          }
        } finally {
          await worker.terminate();
        }
        parsed = { ...parseLabelText(texts.front, texts.back), rawText: `[${t('add.front')}]\n${texts.front}\n\n[${t('add.back')}]\n${texts.back}` };
        // 한글 OCR은 글자 사이에 빈칸이 끼는 경우가 많아 전성분에서만 제거 (정제 수 → 정제수)
        parsed.ingredientsText = parsed.ingredientsText.replace(/([가-힣])\s+(?=[가-힣])/g, '$1');
      }
      draft = { ...parsed, category: null, dataSource: 'ocr', region: getState().settings.region };
      if (!draft.regulatory) delete draft.regulatory;
      draftNotice = parsed.isMakeup ? `${t('scope.makeupDetected')} ${t('add.ocrNotice')}` : t('add.ocrNotice');
      if (parsed.readable === false) draftNotice = `${t('add.ocrUnreadable')} ${draftNotice}`;
      ctx.navigate('/add?mode=manual');
    } catch (err) {
      btn.disabled = false;
      const code = err.code || err.message;
      status.innerHTML = htmlString(errorState(has(`error.${code}`) ? errorText(code) : t('error.ocr_failed')));
    }
  });
}

export function mount(root, ctx) {
  // 수동 입력 탭이 아니면 이전 초안 정리
  if (!ctx.params.id && ctx.query.mode !== 'manual') { draft = null; draftNotice = null; }
  bindForm(root, ctx);
  bindSearch(root, ctx);
  bindPhoto(root, ctx);
}
