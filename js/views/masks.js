import { t, fmtDate, fmtDateTime, getLocale } from '../i18n.js';
import { html, icon, emptyState, toast } from '../ui.js';
import { getState, update, logUsage } from '../store.js';
import { isMask, eligibility } from '../domain/product.js';
import { addDays, startOfWeek, weekStartDay, weekdayOf } from '../domain/dates.js';
import { computeWeek } from './home.js';
import { productName, feedbackModal, purchaseBlock } from './common.js';

export const live = true;
export const title = () => t('masks.title');

export const maskUsedOn = (s, date) => s.usageLog.some((l) => l.type === 'mask_used' && l.date === date);

/** 사용 완료: 재고 1장 차감 + 기록. 마지막 장이면 피드백 팝업 */
export function useMask(productId, date) {
  const s = getState();
  const p = s.products.find((x) => x.id === productId);
  if (!p || (p.sheetCount ?? 0) <= 0) return;
  if (maskUsedOn(s, date)) return;
  const remaining = p.sheetCount - 1;
  update((st) => {
    const prod = st.products.find((x) => x.id === productId);
    prod.sheetCount = remaining;
    prod.updatedAt = new Date().toISOString();
    st.usageLog.push({ id: crypto.randomUUID(), at: new Date().toISOString(), date, productId, type: 'mask_used' });
  });
  toast(t('masks.usedToast', { n: remaining }));
  if (remaining === 0) feedbackModal(p);
}

/* ---------- 타이머 (화면 재렌더링과 무관하게 유지) ---------- */
const timer = { minutes: null, remainingMs: null, running: false, endAt: 0, handle: null };
const fmtClock = (ms) => {
  const sec = Math.ceil(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};
function timerMinutes() {
  return getState().maskPlan.timerMin || 15;
}
function timerRemaining() {
  if (timer.running) return Math.max(0, timer.endAt - Date.now());
  return timer.remainingMs ?? timerMinutes() * 60_000;
}
function finishTimer() {
  timer.running = false;
  timer.remainingMs = null;
  toast(t('masks.timerDone'));
  navigator.vibrate?.([200, 100, 200]);
  if ('Notification' in window && Notification.permission === 'granted') new Notification(t('app.name'), { body: t('masks.timerDone') });
}

/** 지금 사용할 마스크팩: 오늘 선택 → 루틴 엔진 기본값 → 재고 있는 첫 제품 */
function selectedMask(s, today, usable, masks) {
  const pick = s.maskPlan.picks?.[today];
  if (usable.some((m) => m.id === pick)) return masks.find((m) => m.id === pick);
  const day = computeWeek(s, today, today).days.find((d) => d.date === today);
  return masks.find((m) => m.id === day?.maskProductId) || usable[0] || masks[0];
}

export function render(ctx) {
  const s = ctx.state;
  const today = ctx.today;
  const masks = s.products.filter(isMask);
  if (!masks.length) {
    return emptyState({
      iconName: 'mask',
      title: t('masks.emptyTitle'),
      text: t('masks.emptyText'),
      actions: html`<a class="btn btn-primary" href="#/add?mode=manual&category=sheet_mask">${icon('plus')} ${t('masks.add')}</a>`,
    });
  }

  const usable = masks.filter((m) => (m.sheetCount ?? 0) > 0 && eligibility(m, s.profile, today).ok);
  const sel = selectedMask(s, today, usable, masks);
  const selOk = usable.includes(sel);
  const perWeek = s.maskPlan.days.length;
  const sheets = sel.sheetCount ?? 0;
  const firstDay = weekStartDay(getLocale());
  const weekStart = startOfWeek(today, firstDay);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const doneToday = maskUsedOn(s, today);
  const wantsRebuy = s.usageLog.filter((l) => l.productId === sel.id && l.type === 'feedback' && l.repurchase).at(-1)?.repurchase === 'yes';
  const logs = s.usageLog.filter((l) => l.type === 'mask_used').slice(-5).reverse();
  const remaining = timerRemaining();

  let stateChip = '';
  if (!sheets) stateChip = html`<span class="chip chip-muted">${t('chip.empty')}</span>`;
  else if (!selOk) stateChip = html`<a class="chip chip-check" href="#/product/${sel.id}/edit">${t('chip.needsCheck')}</a>`;

  return html`
    <section class="mask-hero" aria-label="${t('masks.stockOf', { name: productName(sel) })}">
      <div class="mask-hero-top">
        <a class="mask-hero-name" href="#/product/${sel.id}">${productName(sel)}</a>
        ${stateChip}
      </div>
      <div class="mask-hero-count">
        <span class="mask-hero-num">${sheets}</span><span class="mask-hero-unit">${t('masks.left')}</span>
        <div class="mask-hero-step" role="group" aria-label="${t('masks.adjust')}">
          <button type="button" class="icon-btn sm" data-action="stock" data-id="${sel.id}" data-delta="-1" aria-label="${t('masks.minus')}" ${sheets ? '' : 'disabled'}>−</button>
          <button type="button" class="icon-btn sm" data-action="stock" data-id="${sel.id}" data-delta="1" aria-label="${t('masks.plus')}">+</button>
        </div>
      </div>
      <p class="mask-hero-sub">${perWeek && sheets ? (sheets < perWeek ? t('masks.lessThanWeek') : t('masks.weeksLeft', { n: Math.floor(sheets / perWeek) })) : perWeek ? '' : t('masks.noPlan')}</p>
    </section>

    <div class="mask-switch" role="radiogroup" aria-label="${t('masks.select')}">
      ${masks.map((m) => html`
        <button type="button" role="radio" aria-checked="${m.id === sel.id}" class="mask-pill ${m.id === sel.id ? 'on' : ''}" data-action="select" data-id="${m.id}" ${(m.sheetCount ?? 0) > 0 ? '' : 'data-empty'}>
          ${productName(m)} <small>${m.sheetCount ?? 0}</small>
        </button>`)}
      <a class="mask-pill add" href="#/add?mode=manual&category=sheet_mask" aria-label="${t('masks.add')}">${icon('plus', 'sm')}</a>
    </div>

    <section class="card">
      <div class="card-row"><h3 class="card-title">${t('masks.plan')}</h3><span class="plan-count">${perWeek ? t('routine.perWeek', { n: perWeek }) : t('masks.none')}</span></div>
      <div class="day-pills">
        ${days.map((d) => {
          const dow = weekdayOf(d);
          const on = s.maskPlan.days.includes(dow);
          const used = s.usageLog.some((l) => l.type === 'mask_used' && l.date === d);
          return html`<button type="button" class="day-pill ${on ? 'on' : ''} ${d === today ? 'today' : ''}" aria-pressed="${on}" data-action="day" data-dow="${dow}"
            aria-label="${fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}${used ? `, ${t('masks.doneLabel')}` : ''}">
            <span>${fmtDate(d, { weekday: 'short' })}</span><strong>${fmtDate(d, { day: 'numeric' }).replace(/\D/g, '')}</strong>
            <i class="dot ${used ? 'used' : on ? '' : 'off'}" aria-hidden="true">${used ? icon('check', 'sm') : ''}</i>
          </button>`;
        })}
      </div>
      <p class="tip-line"><strong>${t('masks.tipTitle')}</strong> ${t('masks.tipText')}</p>
    </section>

    <section class="card timer-card" aria-labelledby="timer-title">
      <div class="card-row"><h3 class="card-title" id="timer-title">${t('masks.timerTitle')}</h3>
        <div class="timer-adjust" role="group" aria-label="${t('masks.timerTitle')}">
          <button type="button" class="icon-btn sm" data-action="tmin" data-delta="-1" aria-label="${t('masks.timerMinus')}" ${timer.running ? 'disabled' : ''}>−</button>
          <span>${t('masks.minutes', { n: timerMinutes() })}</span>
          <button type="button" class="icon-btn sm" data-action="tmin" data-delta="1" aria-label="${t('masks.timerPlus')}" ${timer.running ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <p class="timer-display" id="timer-display" role="timer" aria-live="off">${fmtClock(remaining)}</p>
      <div class="timer-controls">
        <button type="button" class="btn btn-ghost" data-action="timer-toggle">${timer.running ? t('masks.pause') : t('masks.start')}</button>
        <button type="button" class="icon-btn" data-action="timer-reset" aria-label="${t('masks.reset')}">↺</button>
      </div>
      <p class="small muted center">${t('masks.timerNote')}</p>
    </section>

    <button type="button" class="btn btn-primary btn-xl" data-action="done" data-id="${sel.id}" ${doneToday || !selOk ? 'disabled' : ''}>
      ${doneToday ? html`${icon('check')} ${t('masks.ctaDone')}` : t('masks.cta')}
    </button>

    <section class="card rebuy-card">
      <div class="card-row">
        <h3 class="card-title">${t('masks.rebuyTitle')}</h3>
        <button type="button" class="rebuy-btn ${wantsRebuy ? 'on' : ''}" aria-pressed="${wantsRebuy}" data-action="rebuy" data-id="${sel.id}">♥ ${t('feedback.repurchase_yes')}</button>
      </div>
      ${sheets <= 3 ? html`<p class="small muted">${t('masks.rebuyLow', { n: sheets })}</p>` : ''}
      ${wantsRebuy ? html`<div class="buy-slot" data-buy></div>` : ''}
    </section>

    <section class="card">
      <h3 class="card-title">${t('masks.history')}</h3>
      ${logs.length ? html`<ul class="log-list">${logs.map((l) => html`<li><span>${fmtDateTime(l.at)}</span> · ${productName(s.products.find((p) => p.id === l.productId)) || t('masks.deleted')}</li>`)}</ul>`
        : html`<p class="muted small">${t('masks.noHistory')}</p>`}
    </section>`;
}

export function mount(root, ctx) {
  const main = root.querySelector('main');
  const today = ctx.today;
  const s = ctx.state;
  const masks = s.products.filter(isMask);
  if (!masks.length) return;

  const buy = main.querySelector('[data-buy]');
  if (buy) {
    const usable = masks.filter((m) => (m.sheetCount ?? 0) > 0 && eligibility(m, s.profile, today).ok);
    purchaseBlock(buy, selectedMask(s, today, usable, masks));
  }

  // 타이머 표시만 갱신 (전체 재렌더링 없이)
  clearInterval(timer.handle);
  const display = main.querySelector('#timer-display');
  timer.handle = setInterval(() => {
    if (!timer.running) return;
    const left = timerRemaining();
    const el = document.getElementById('timer-display');
    if (el) el.textContent = fmtClock(left);
    if (left <= 0) { finishTimer(); ctx.rerender(); }
  }, 250);
  if (display) display.textContent = fmtClock(timerRemaining());

  main.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'stock') {
      update((st) => {
        const p = st.products.find((x) => x.id === el.dataset.id);
        p.sheetCount = Math.max(0, (p.sheetCount ?? 0) + Number(el.dataset.delta));
      });
    }
    if (a === 'select') update((st) => { st.maskPlan.picks[today] = el.dataset.id; });
    if (a === 'day') {
      const dow = Number(el.dataset.dow);
      update((st) => {
        st.maskPlan.days = st.maskPlan.days.includes(dow) ? st.maskPlan.days.filter((d) => d !== dow) : [...st.maskPlan.days, dow];
      });
    }
    if (a === 'done') {
      timer.running = false;
      timer.remainingMs = null;
      useMask(el.dataset.id, today);
    }
    if (a === 'rebuy') {
      const on = el.getAttribute('aria-pressed') === 'true';
      logUsage({ productId: el.dataset.id, type: 'feedback', satisfaction: null, repurchase: on ? 'no' : 'yes' });
    }
    if (a === 'tmin') update((st) => { st.maskPlan.timerMin = Math.min(60, Math.max(1, (st.maskPlan.timerMin || 15) + Number(el.dataset.delta))); timer.remainingMs = null; });
    if (a === 'timer-toggle') {
      if (timer.running) {
        timer.remainingMs = timerRemaining();
        timer.running = false;
      } else {
        timer.endAt = Date.now() + timerRemaining();
        timer.running = true;
      }
      ctx.rerender();
    }
    if (a === 'timer-reset') {
      timer.running = false;
      timer.remainingMs = null;
      ctx.rerender();
    }
  });
}
