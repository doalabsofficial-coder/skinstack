import { t, fmtDate } from '../i18n.js';
import { html, icon, info, emptyState } from '../ui.js';
import { addDays } from '../domain/dates.js';
import { computeWeek } from './home.js';
import { productName, catLabel, needsCheckList } from './common.js';

export const live = true;
export const title = () => t('week.title');

export function render(ctx) {
  const s = ctx.state;
  const offset = Number(ctx.query.w || 0);
  const anchor = addDays(ctx.today, offset * 7);
  const week = computeWeek(s, anchor, ctx.today);
  const byId = new Map(s.products.map((p) => [p.id, p]));

  const nav = html`
    <div class="week-nav">
      <a class="icon-btn" href="#/week?w=${offset - 1}" aria-label="${t('week.prev')}">${icon('back')}</a>
      <p><strong>${fmtDate(week.days[0].date)} – ${fmtDate(week.days[6].date)}</strong>${offset === 0 ? html` <span class="chip chip-ok">${t('week.thisWeek')}</span>` : ''}</p>
      <a class="icon-btn" href="#/week?w=${offset + 1}" aria-label="${t('week.next')}">${icon('chevron')}</a>
    </div>`;

  if (week.noRoutineReason) {
    return html`${nav}${week.noRoutineReason === 'no_products'
      ? emptyState({ iconName: 'calendar', title: t('home.emptyTitle'), text: t('home.emptyText'), actions: html`<a class="btn btn-primary" href="#/add">${t('home.addFirst')}</a>` })
      : html`<section class="card"><h3 class="card-title">${t('home.verifyTitle')}</h3><p class="muted">${t('home.verifyText')}</p>${needsCheckList(week.excluded)}</section>`}`;
  }

  const scheduled = Object.entries(week.schedule);

  return html`${nav}
    <p class="muted small">${t('week.lead')} ${info(t('week.leadInfo'))}</p>
    <ol class="week-list">
      ${week.days.map((d) => html`
        <li class="week-day ${d.date === ctx.today ? 'is-today' : ''}">
          <a href="#/day/${d.date}" class="week-day-link" aria-label="${t('week.openDay', { date: fmtDate(d.date, { weekday: 'long', month: 'long', day: 'numeric' }) })}">
            <div class="cal-date"><span>${fmtDate(d.date, { weekday: 'short' })}</span><strong>${fmtDate(d.date, { day: 'numeric' })}</strong></div>
            <div class="week-slots">
              <p>${icon('sun', 'accent sm')} ${d.am.map((st) => catLabel(st.category)).join(' → ') || t('routine.emptySlot')}</p>
              <p>${icon('moon', 'accent sm')} ${d.pm.map((st) => catLabel(st.category)).join(' → ') || t('routine.emptySlot')}</p>
              <div class="chips">
                ${d.pm.filter((st) => st.perWeek && st.perWeek < 7).map((st) => html`<span class="chip chip-accent">${productName(byId.get(st.productId))}</span>`)}
                ${d.maskDay ? html`<span class="chip chip-ok">${icon('mask', 'sm')} ${d.maskProductId ? productName(byId.get(d.maskProductId)) : t('masks.outOfStock')}</span>` : ''}
              </div>
            </div>
            ${icon('chevron', 'row-chevron')}
          </a>
        </li>`)}
    </ol>
    ${scheduled.length ? html`
      <section class="card">
        <h3 class="card-title">${t('week.scheduledTitle')} ${info(t('week.scheduledInfo'))}</h3>
        <ul class="small">${scheduled.map(([id, days]) => html`<li><a href="#/product/${id}">${productName(byId.get(id))}</a> — ${days.map((i) => fmtDate(week.days[i].date, { weekday: 'short' })).join(', ')}</li>`)}</ul>
      </section>` : ''}
    ${week.excluded.length ? html`<section class="card"><h3 class="card-title">${t('report.needsCheck')}</h3>${needsCheckList(week.excluded)}</section>` : ''}`;
}
