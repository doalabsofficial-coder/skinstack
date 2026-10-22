import { t, fmtDate, getLocale } from '../i18n.js';
import { html, icon, info, emptyState } from '../ui.js';
import { buildWeek, dayReport } from '../domain/routine.js';
import { startOfWeek, weekStartDay } from '../domain/dates.js';
import { update, loadDemo } from '../store.js';
import { stepList, applyMove, comboList, considerList, similarList, needsCheckList, productName, bottle } from './common.js';
import { maskUsedOn, useMask } from './masks.js';

export const live = true;
export const title = (ctx) => (ctx.params.date && ctx.params.date !== ctx.today ? fmtDate(ctx.params.date, { weekday: 'long', month: 'long', day: 'numeric' }) : t('home.title'));
export const back = (ctx) => (ctx.params.date ? '/week' : null);

export function computeWeek(state, date, today) {
  return buildWeek({
    products: state.products,
    profile: state.profile,
    maskPlan: state.maskPlan,
    orderOverrides: state.orderOverrides,
    weekStart: startOfWeek(date, weekStartDay(getLocale())),
    todayISO: today,
  });
}

let viewSlot = null; // 사용자가 고른 아침/저녁 (없으면 지금 시각 기준)
const slotNow = () => (new Date().getHours() < 15 ? 'am' : 'pm');
const greeting = () => { const h = new Date().getHours(); return t(h < 11 ? 'home.greetMorning' : h < 17 ? 'home.greetDay' : 'home.greetEvening'); };
const doneKey = (date, slot) => `${date}:${slot}`;

export function render(ctx) {
  const s = ctx.state;
  const date = ctx.params.date || ctx.today;
  const week = computeWeek(s, date, ctx.today);
  const day = week.days.find((d) => d.date === date);
  const byId = new Map(s.products.map((p) => [p.id, p]));
  const slot = viewSlot || slotNow();
  const steps = week.noRoutineReason ? [] : day[slot];
  const done = (s.done?.[doneKey(date, slot)] || []).filter((id) => steps.some((st) => st.productId === id));
  const allDone = steps.length > 0 && done.length === steps.length;

  // 거울: 인사 + 날짜 + 진행률
  const mirror = html`
    <section class="mirror">
      <p class="mirror-date">${fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <h2 class="mirror-greet">${allDone ? t('home.allDone') : greeting()}</h2>
      ${steps.length ? html`
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done.length}" aria-label="${t('home.progress', { done: done.length, total: steps.length })}"><span style="width:${(done.length / steps.length) * 100}%"></span></div>
        <p class="mirror-sub">${t('home.progress', { done: done.length, total: steps.length })}</p>` : ''}
    </section>`;

  if (week.noRoutineReason === 'no_products') {
    return html`${mirror}${emptyState({
      iconName: 'box',
      title: t('home.emptyTitle'),
      text: t('home.emptyText'),
      actions: html`<a class="btn btn-primary" href="#/add">${icon('plus')} ${t('home.addFirst')}</a><button type="button" class="btn btn-ghost" data-action="demo">${t('home.loadDemo')}</button>`,
    })}`;
  }

  if (week.noRoutineReason === 'none_eligible') {
    const total = s.products.filter((p) => !p.archived).length;
    return html`${mirror}
      <section class="card">
        <h3 class="card-title">${t('home.verifyTitle')} ${info(t('home.verifyInfo'))}</h3>
        <p class="muted small">${t('home.verifyProgress', { done: total - week.excluded.length, total })}</p>
        <ul class="shelf mini">${week.excluded.slice(0, 6).map(({ product: p }) => html`<li><a class="shelf-item" href="#/product/${p.id}/edit">${bottle(p)}<span>${p.name || t('common.untitled')}</span><b class="sticker">!</b></a></li>`)}</ul>
        <a class="btn btn-primary btn-block" href="#/vault?f=check">${t('home.verifyCta')}</a>
      </section>`;
  }

  const report = dayReport(day, s.products, s.profile);
  const maskProduct = day.maskProductId ? byId.get(day.maskProductId) : null;
  const maskDone = maskProduct && maskUsedOn(s, date);
  const stepWarnings = [...day.am, ...day.pm]
    .filter((st, i, arr) => st.warnings.length && arr.findIndex((x) => x.productId === st.productId) === i)
    .map((st) => ({ product: byId.get(st.productId), warnings: st.warnings }));
  const comboCount = [...report.combos.am, ...report.combos.pm].filter((c) => c.level !== 'info').length;
  const checkCount = comboCount + report.similar.length + week.excluded.length;

  return html`${mirror}
    <div class="seg" role="tablist" aria-label="${t('routine.am')} / ${t('routine.pm')}">
      ${['am', 'pm'].map((x) => html`<button type="button" role="tab" aria-selected="${x === slot}" class="${x === slot ? 'on' : ''}" data-action="slot" data-slot="${x}">${icon(x === 'am' ? 'sun' : 'moon', 'sm')} ${t(`routine.${x}`)} <small>${day[x].length}</small></button>`)}
    </div>

    <section class="card routine-card">
      ${slot === 'pm' && day.maskDay ? html`
        <div class="mask-banner">
          ${icon('mask')}
          <p><strong>${t('home.maskDay')}</strong> ${maskProduct ? html`· ${productName(maskProduct)}` : html`· ${t('masks.outOfStock')}`}</p>
          ${maskProduct && !maskDone && date <= ctx.today ? html`<button type="button" class="btn btn-primary btn-sm" data-action="mask-done" data-id="${maskProduct.id}">${icon('check')} ${t('masks.done')}</button>` : ''}
          ${maskDone ? html`<span class="chip chip-ok">${t('masks.doneLabel')}</span>` : ''}
        </div>` : ''}
      ${stepList(steps, slot, byId, { done })}
    </section>

    ${checkCount ? html`
      <details class="card checks">
        <summary><span class="checks-badge">${checkCount}</span> ${t('home.checksTitle')}</summary>
        ${comboCount ? html`<h4 class="sub">${t('report.combos')}</h4>${comboList([...report.combos.am, ...report.combos.pm], byId)}${considerList(report.considers, byId)}
          <p class="notice notice-caution small">${t('report.stopIfIrritation')}</p>` : ''}
        ${report.similar.length ? html`<h4 class="sub">${t('report.similar')}</h4>${similarList(report.similar)}` : ''}
        ${week.excluded.length || stepWarnings.length ? html`<h4 class="sub" id="needs-check">${t('report.needsCheck')}</h4>${needsCheckList(week.excluded, stepWarnings)}` : ''}
      </details>` : html`<p class="soft-note">${icon('check', 'sm')} ${t('home.checksNone')}</p>`}

    <p class="hero-links center"><a href="#/week">${icon('calendar', 'sm')} ${t('home.weekLink')}</a> · <a href="#/routines">${icon('layers', 'sm')} ${t('home.routinesLink')}</a></p>
    <p class="disclaimer">${t('home.disclaimer')}</p>`;
}

export function mount(root, ctx) {
  root.querySelector('main').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const date = ctx.params.date || ctx.today;
    if (action === 'demo') loadDemo(ctx.state.settings.region);
    if (action === 'slot') { viewSlot = el.dataset.slot; ctx.rerender(); }
    if (action === 'check') {
      update((s) => {
        s.done ??= {};
        const k = doneKey(date, el.dataset.slot);
        const list = s.done[k] || [];
        s.done[k] = list.includes(el.dataset.id) ? list.filter((x) => x !== el.dataset.id) : [...list, el.dataset.id];
      });
    }
    if (action === 'move') {
      const day = computeWeek(ctx.state, date, ctx.today).days.find((d) => d.date === date);
      update((s) => applyMove(s, day[el.dataset.slot], el.dataset.id, Number(el.dataset.dir)));
    }
    if (action === 'mask-done') useMask(el.dataset.id, date);
  });
}
