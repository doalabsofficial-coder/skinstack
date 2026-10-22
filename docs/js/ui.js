import { t } from './i18n.js';

/* ---------- 안전한 HTML 템플릿: 보간값은 자동 이스케이프 ---------- */
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: true, s: String(s) });
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function toHtml(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(toHtml).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += toHtml(v) + strings[i + 1]; });
  return raw(out);
}
export const htmlString = (v) => toHtml(v);

/* ---------- 아이콘 (stroke 기반 인라인 SVG) ---------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  mask: '<path d="M4 6c5-2 11-2 16 0 0 8-3 14-8 14S4 14 4 6z"/><circle cx="9" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/><path d="M9.5 15c1.5 1 3.5 1 5 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  cart: '<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3.5h3l2.4 11.2a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8l1.5-7.2H6.3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
export const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`);

/* ---------- ⓘ 설명 툴팁: 마우스 오버/키보드 포커스/탭 ---------- */
let tipSeq = 0;
export function info(text) {
  const id = `tip-${++tipSeq}`;
  return html`<span class="info-wrap"><button type="button" class="info-btn" aria-describedby="${id}" aria-label="${t('common.moreInfo')}" data-tip-toggle>i</button><span role="tooltip" id="${id}" class="tooltip">${text}</span></span>`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tip-toggle]');
  document.querySelectorAll('.info-wrap.open').forEach((w) => { if (!btn || !w.contains(btn)) w.classList.remove('open'); });
  if (btn) btn.parentElement.classList.toggle('open');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.info-wrap.open').forEach((w) => w.classList.remove('open'));
});

/* ---------- 토스트 (aria-live) ---------- */
export function toast(message, kind = 'ok') {
  const region = document.getElementById('toast-region');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  region.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

/* ---------- 모달 (포커스 트랩 + ESC) ---------- */
export function openModal({ title, body, actions = [], onMount, dismissible = true }) {
  const prev = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = htmlString(html`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title" class="modal-title">${title}</h2>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        ${actions.map((a, i) => html`<button type="button" class="btn ${a.kind || 'btn-ghost'}" data-modal-action="${i}">${a.label}</button>`)}
      </div>
    </div>`);
  document.body.append(backdrop);
  document.body.classList.add('modal-open');
  const modal = backdrop.querySelector('.modal');
  const close = (value) => {
    backdrop.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    prev?.focus?.();
    return value;
  };
  const focusables = () => [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
  function onKey(e) {
    if (e.key === 'Escape' && dismissible) close();
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop && dismissible) close(); });
  modal.querySelectorAll('[data-modal-action]').forEach((b) => b.addEventListener('click', () => {
    const a = actions[Number(b.dataset.modalAction)];
    const keepOpen = a.onClick?.(modal) === false;
    if (!keepOpen) close();
  }));
  onMount?.(modal, close);
  (focusables()[0] || modal).focus();
  return { modal, close };
}

export function confirmDialog({ title, message, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: html`<p>${message}</p>`,
      actions: [
        { label: t('common.cancel'), onClick: () => resolve(false) },
        { label: confirmLabel || t('common.confirm'), kind: danger ? 'btn-danger' : 'btn-primary', onClick: () => resolve(true) },
      ],
    });
  });
}

/* ---------- 공용 조각 ---------- */
/* ---------- 상품 이미지: 없거나 깨지면 기본 이미지 (CSP상 인라인 onerror 대신 위임 리스너) ---------- */
const emptyImage = () => html`<div class="pimg pimg-empty" role="img" aria-label="${t('catalog.noImage')}">${icon('box')}<span>${t('catalog.noImage')}</span></div>`;
export const productImage = (url, alt) => (url ? html`<img class="pimg" src="${url}" alt="${alt}" loading="lazy" data-fallback>` : emptyImage());
document.addEventListener('error', (e) => {
  if (e.target?.matches?.('img[data-fallback]')) e.target.outerHTML = htmlString(emptyImage());
}, true);

export const spinner = (label) => html`<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>${label || t('common.loading')}</span></div>`;

export const emptyState = ({ iconName = 'inbox', title, text, actions }) => html`
  <div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <p class="empty-title">${title}</p>
    ${text ? html`<p class="muted">${text}</p>` : ''}
    ${actions ? html`<div class="empty-actions">${actions}</div>` : ''}
  </div>`;

export const errorState = (message, retryAction) => html`
  <div class="notice notice-avoid" role="alert">
    ${icon('alert')}<div><p>${message}</p>${retryAction ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="${retryAction}">${t('common.retry')}</button>` : ''}</div>
  </div>`;

/** 확인되지 않은 값 표시 */
export const unknown = () => html`<span class="unverified">${t('common.needsCheck')}</span>`;
export const valueOrUnknown = (v) => (v ? v : unknown());

/** 이미지 파일 → 축소된 dataURL (업로드 용량 절감) */
export function fileToDataUrl(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('invalid_image'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid_image')); };
    img.src = url;
  });
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (form.querySelectorAll(`[name="${el.name}"]`).length > 1) {
        out[el.name] ??= [];
        if (el.checked) out[el.name].push(el.value);
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
      else out[el.name] ??= '';
    } else out[el.name] = el.value.trim();
  }
  return out;
}
