import { setLanguage, t, detectLanguage } from './i18n.js';
import { loadState, getState, subscribe, update, storageAvailable } from './store.js';
import { api } from './api.js';
import { html, htmlString, icon, spinner, openModal } from './ui.js';
import { initSync } from './sync.js';
import { toISODate } from './domain/dates.js';

import * as onboarding from './views/onboarding.js';
import * as home from './views/home.js';
import * as week from './views/week.js';
import * as vault from './views/vault.js';
import * as add from './views/add.js';
import * as product from './views/product.js';
import * as masks from './views/masks.js';
import * as requests from './views/requests.js';
import * as settings from './views/settings.js';
import * as admin from './views/admin.js';
import * as catalog from './views/catalog.js';
import * as routines from './views/routines.js';

const ROUTES = [
  [/^\/?$/, home, {}],
  [/^\/day\/(\d{4}-\d{2}-\d{2})$/, home, { keys: ['date'] }],
  [/^\/week$/, week, {}],
  [/^\/vault$/, vault, {}],
  [/^\/add$/, add, {}],
  [/^\/product\/([\w-]+)\/edit$/, add, { keys: ['id'] }],
  [/^\/product\/([\w-]+)$/, product, { keys: ['id'] }],
  [/^\/masks$/, masks, {}],
  [/^\/requests$/, requests, {}],
  [/^\/settings$/, settings, {}],
  [/^\/profile$/, onboarding, { profileOnly: true }],
  [/^\/admin$/, admin, {}],
  [/^\/onboarding$/, onboarding, {}],
  [/^\/catalog$/, catalog, {}],
  [/^\/catalog\/([\w-]+)$/, catalog, { keys: ['id'] }],
  [/^\/routines$/, routines, {}],
  [/^\/routines\/([\w-]+)$/, routines, { keys: ['id'] }],
];

// 모바일 하단: 가운데(세 번째) 항목이 강조되는 '오늘'. 주간·설정은 상단/오늘 화면에서 이동
const NAV = [
  ['/vault', 'box', 'nav.vault'],
  ['/routines', 'layers', 'nav.routines'],
  ['/', 'sun', 'nav.today', 'center'],
  ['/masks', 'mask', 'nav.masks'],
  ['/settings', 'settings', 'nav.settings'],
];
// PC 사이드 메뉴: 전체 메뉴
const SIDE_NAV = [
  ['/', 'sun', 'nav.today'],
  ['/week', 'calendar', 'nav.week'],
  ['/vault', 'box', 'nav.vault'],
  ['/catalog', 'search', 'nav.catalog'],
  ['/routines', 'layers', 'nav.routines'],
  ['/masks', 'mask', 'nav.masks'],
  ['/settings', 'settings', 'nav.settings'],
];
const isActive = (href, path) => (href === '/' ? path === '/' || path.startsWith('/day') : path.startsWith(href));

const app = {
  config: { ocrAi: false, adminEnabled: false, regions: ['KR', 'US', 'GLOBAL'], affiliate: {}, offline: false },
  current: null,
};

export const navigate = (path) => { location.hash = `#${path}`; };
export const today = () => toISODate(new Date());

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function resolve() {
  const { path, query } = parseHash();
  for (const [re, view, opts] of ROUTES) {
    const m = path.match(re);
    if (m) {
      const params = {};
      (opts.keys || []).forEach((k, i) => { params[k] = m[i + 1]; });
      return { view, params, query, path, opts };
    }
  }
  return { view: home, params: {}, query, path: '/', opts: {} };
}

function ctxFor(route) {
  return {
    ...route,
    state: getState(),
    config: app.config,
    navigate,
    today: today(),
    rerender: () => render(false),
  };
}

function shell(route, ctx) {
  const v = route.view;
  const title = v.title ? v.title(ctx) : t('app.name');
  const showNav = !v.hideNav;
  const back = v.back ? v.back(ctx) : null;
  return html`
    <a class="skip-link" href="#main">${t('common.skipToContent')}</a>
    <header class="topbar">
      ${back ? html`<a class="icon-btn" href="#${back}" aria-label="${t('common.back')}">${icon('back')}</a>` : html`<span class="brand-mark" aria-hidden="true"></span>`}
      <h1 class="topbar-title" tabindex="-1" id="page-title">${title}</h1>
      ${showNav ? html`<a class="icon-btn add-btn" href="#/add" aria-label="${t('nav.add')}">${icon('plus')}</a>` : html`<span class="icon-btn-spacer"></span>`}
    </header>
    ${storageAvailable() ? '' : html`<div class="notice notice-check banner" role="status">${t('common.storageUnavailable')}</div>`}
    ${showNav ? html`
      <nav class="side-nav" aria-label="${t('nav.label')}">
        <p class="side-brand"><span class="brand-mark" aria-hidden="true"></span>${t('app.name')}</p>
        ${SIDE_NAV.map(([href, ic, label]) => html`<a href="#${href}" class="${isActive(href, route.path) ? 'active' : ''}" ${isActive(href, route.path) ? html`aria-current="page"` : ''}>${icon(ic)}<span>${t(label)}</span></a>`)}
      </nav>` : ''}
    <main id="main" class="page ${v.wide ? 'page-wide' : ''}">${v.render(ctx)}</main>
    ${showNav ? html`
      <nav class="bottom-nav" aria-label="${t('nav.label')}">
        ${NAV.map(([href, ic, label, variant]) => {
          const active = isActive(href, route.path);
          return html`<a href="#${href}" class="${active ? 'active' : ''} ${variant === 'center' ? 'nav-center' : ''}" ${active ? html`aria-current="page"` : ''}>${variant === 'center' ? html`<span class="nav-center-icon">${icon(ic)}</span>` : icon(ic)}<span>${t(label)}</span></a>`;
        })}
      </nav>` : ''}`;
}

function render(routeChanged = true) {
  const root = document.getElementById('app');
  const route = resolve();
  const s = getState();
  if (!s.settings.onboarded && route.view !== onboarding && route.view !== admin) {
    navigate('/onboarding');
    return;
  }
  const scroll = window.scrollY;
  if (routeChanged) {
    // 화면 이동 시 이전 화면의 모달은 닫음
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    document.body.classList.remove('modal-open');
  }
  const ctx = ctxFor(route);
  app.current = { route, ctx };
  root.innerHTML = htmlString(shell(route, ctx));
  route.view.mount?.(root, ctx);
  if (routeChanged) {
    window.scrollTo(0, 0);
    document.getElementById('page-title')?.focus({ preventScroll: true });
  } else window.scrollTo(0, scroll);
}

/* 알림: 서버 푸시는 없고, 앱이 열려 있는 동안만 브라우저 알림을 표시 */
function startReminderLoop() {
  const fired = new Set();
  setInterval(() => {
    const { notifications } = getState().settings;
    if (!notifications.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const d = new Date();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    for (const slot of ['am', 'pm']) {
      const key = `${toISODate(d)}-${slot}`;
      if (notifications[slot] === hm && !fired.has(key)) {
        fired.add(key);
        new Notification(t('app.name'), { body: t(`notify.${slot}`) });
      }
    }
  }, 20_000);
}

async function boot() {
  const root = document.getElementById('app');
  const s = loadState();
  try {
    await setLanguage(s.settings.lang || detectLanguage(), s.settings.region);
  } catch {
    root.textContent = 'Failed to load language resources.';
    return;
  }
  root.innerHTML = htmlString(spinner(t('common.loading')));
  try {
    app.config = { ...app.config, ...(await api.config()) };
  } catch {
    app.config.offline = true;
  }
  if (!s.settings.lang || !s.settings.region) {
    update((st) => {
      st.settings.lang ||= detectLanguage();
      st.settings.region ||= (navigator.language || '').endsWith('KR') || st.settings.lang === 'ko' ? 'KR' : (navigator.language || '').endsWith('US') ? 'US' : 'GLOBAL';
    }, { silent: true });
  }
  subscribe(() => { if (app.current?.route.view.live) render(false); });
  window.addEventListener('hashchange', () => render(true));
  startReminderLoop();
  render(true);
  // 기기 간 동기화 (로그인한 경우에만 동작, 화면 표시를 막지 않도록 비동기)
  initSync({
    onChange: () => { if (app.current?.route.view === settings) render(false); },
    ask: () => new Promise((resolve) => openModal({
      title: t('sync.askTitle'),
      body: html`<p>${t('sync.askText')}</p>`,
      dismissible: false,
      actions: [
        { label: t('sync.useLocal'), onClick: () => resolve('local') },
        { label: t('sync.useCloud'), kind: 'btn-primary', onClick: () => resolve('cloud') },
      ],
    })),
  });
}

export async function changeLanguage(lang, region) {
  await setLanguage(lang, region);
  render(false);
}

export const appConfig = () => app.config;

boot();
