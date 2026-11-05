import { t, fmtDate, fmtDateTime } from '../i18n.js';
import { html, icon, info, errorState, confirmDialog, toast, valueOrUnknown, unknown } from '../ui.js';
import { update, removeProduct } from '../store.js';
import { eligibility, effectiveExpiry, isMask } from '../domain/product.js';
import { detectGroups, splitIngredients } from '../domain/ingredients.js';
import { findSimilar } from '../domain/duplicates.js';
import { catLabel, productName, statusChips, similarReason, purchaseBlock, feedbackModal } from './common.js';

export const live = true;
export const title = () => t('product.title');
export const back = () => '/vault';

export function render(ctx) {
  const s = ctx.state;
  const p = s.products.find((x) => x.id === ctx.params.id);
  if (!p) return html`${errorState(t('product.notFound'))}<p class="center"><a href="#/vault">${t('vault.title')}</a></p>`;

  const e = eligibility(p, s.profile, ctx.today);
  const groups = detectGroups(p).filter((g) => g.group !== 'fragrance' || g.source === 'ingredients');
  const sims = findSimilar(p, s.products.filter((x) => !x.archived));
  const logs = s.usageLog.filter((l) => l.productId === p.id).slice().reverse();
  const lastFeedback = logs.find((l) => l.type === 'feedback');
  const exp = effectiveExpiry(p);
  const ingCount = splitIngredients(p.ingredientsText).length;

  return html`
    <section class="card product-head">
      <p class="eyebrow">${p.categoryConfirmed ? catLabel(p.category) : html`${t('product.categoryUnconfirmed')}${p.categoryHint ? html` · ${t('form.categoryHint', { category: catLabel(p.categoryHint) })}` : ''}`}</p>
      <h2 class="product-title">${p.name || t('common.untitled')}</h2>
      <p class="muted">${p.brand || t('product.brandUnknown')}${p.volume ? html` · ${p.volume}` : ''}</p>
      ${statusChips(p, ctx.today)}
      <p class="small muted">${t('product.source')}: ${t(`dataSource.${p.dataSource}`)} ${info(t(`dataSource.${p.dataSource}Info`))}</p>
      <div class="btn-row">
        <a class="btn ${e.ok ? 'btn-ghost' : 'btn-primary'}" href="#/product/${p.id}/edit">${icon('edit')} ${e.ok ? t('common.edit') : t('product.verifyCta')}</a>
        <button type="button" class="btn btn-ghost" data-action="feedback">${t('product.feedback')}</button>
      </div>
    </section>

    ${!e.ok ? html`
      <section class="notice notice-check" role="status">
        ${icon('alert')}
        <div><strong>${t('product.excludedTitle')}</strong><ul class="small">${e.reasons.map((r) => html`<li>${t(`exclude.${r}`)}</li>`)}</ul></div>
      </section>` : ''}

    <section class="card">
      <h3 class="card-title">${t('product.stock')}</h3>
      ${isMask(p) ? html`
        <div class="stepper big" role="group" aria-label="${t('masks.stockOf', { name: productName(p) })}">
          <button type="button" class="icon-btn" data-action="sheet" data-delta="-1" aria-label="${t('masks.minus')}" ${p.sheetCount ? '' : 'disabled'}>−</button>
          <output aria-live="polite">${t('product.sheets', { n: p.sheetCount ?? 0 })}</output>
          <button type="button" class="icon-btn" data-action="sheet" data-delta="1" aria-label="${t('masks.plus')}">+</button>
        </div>` : html`
        <label class="field">
          <span>${t('form.remaining')} <output id="rem-out">${p.remainingPct ?? 100}%</output></span>
          <input type="range" min="0" max="100" step="5" value="${p.remainingPct ?? 100}" data-action="remaining" aria-describedby="rem-out">
        </label>
        <div class="stepper" role="group" aria-label="${t('form.quantity')}">
          <span class="small">${t('form.quantity')}</span>
          <button type="button" class="icon-btn sm" data-action="qty" data-delta="-1" aria-label="${t('masks.minus')}" ${p.quantity > 0 ? '' : 'disabled'}>−</button>
          <output aria-live="polite">${p.quantity ?? 1}</output>
          <button type="button" class="icon-btn sm" data-action="qty" data-delta="1" aria-label="${t('masks.plus')}">+</button>
        </div>
        ${(p.quantity ?? 1) > 1 && (p.remainingPct ?? 100) === 0 ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="open-new">${t('product.openNew')}</button>` : ''}`}
    </section>

    <section class="card">
      <h3 class="card-title">${t('product.details')}</h3>
      <dl class="dl">
        <dt>${t('form.category')}</dt><dd>${p.categoryConfirmed ? catLabel(p.category) : unknown()}</dd>
        <dt>${t('form.regulatory')} ${info(t('form.regulatoryInfo'))}</dt><dd>${t(`regulatory.${p.regulatory}`)}${!p.verified && !p.pharmaFlag && p.regulatory === 'cosmetic' ? html` <small class="muted">(${t('product.defaultValue')})</small>` : ''}${p.pharmaFlag ? html`<br><small class="warn">${t('form.pharmaFlag')}</small>` : ''}</dd>
        ${p.regulatoryMarkings?.length ? html`<dt>${t('product.markings')}</dt><dd>${p.regulatoryMarkings.join(', ')}</dd>` : ''}
        <dt>${t('form.volume')}</dt><dd>${valueOrUnknown(p.volume)}</dd>
        <dt>${t('form.timeOfUse')}</dt><dd>${t(`timeOfUse.${p.timeOfUse || 'auto'}`)}</dd>
        <dt>${t('form.frequency')}</dt><dd>${p.frequencyPerWeek ? (p.frequencyPerWeek === 7 ? t('form.daily') : t('routine.perWeek', { n: p.frequencyPerWeek })) : unknown()}</dd>
        <dt>${t('form.openedAt')}</dt><dd>${p.openedAt ? fmtDate(p.openedAt, { dateStyle: 'medium' }) : '—'}</dd>
        <dt>${t('form.pao')}</dt><dd>${p.paoMonths ? t('product.months', { n: p.paoMonths }) : '—'}</dd>
        <dt>${t('product.useBy')}</dt><dd>${exp ? fmtDate(exp, { dateStyle: 'medium' }) : '—'}</dd>
      </dl>
    </section>

    <section class="card">
      <h3 class="card-title">${t('form.ingredients')} ${info(t('product.ingredientsInfo'))}</h3>
      ${p.ingredientsText ? html`<p class="ingredients">${p.ingredientsText}</p><p class="small muted">${t('product.ingredientCount', { n: ingCount })}</p>` : html`<p>${unknown()}</p><p class="small muted">${t('product.noIngredients')}</p>`}
      ${groups.length ? html`
        <h4 class="sub">${t('product.detected')}</h4>
        <ul class="chips">${groups.map((g) => html`<li class="chip ${g.source === 'ingredients' ? 'chip-accent' : 'chip-check'}">${t(`group.${g.group}`)} <small>(${t(`source.${g.source}`)})</small></li>`)}</ul>
        <p class="small muted">${t('product.detectedNote')}</p>` : ''}
    </section>

    <section class="card">
      <h3 class="card-title">${t('form.usage')}</h3>
      ${p.usageText ? html`<p class="pre">${p.usageText}</p>` : html`<p>${unknown()}</p>`}
      <h4 class="sub">${t('form.warnings')}</h4>
      ${p.warningsText ? html`<p class="pre">${p.warningsText}</p>` : html`<p>${unknown()}</p>`}
    </section>

    ${sims.length ? html`
      <section class="card">
        <h3 class="card-title">${t('report.similar')}</h3>
        <ul class="small">${sims.map(({ product, result }) => html`<li><a href="#/product/${product.id}">${productName(product)}</a> — ${result.reasons.map(similarReason).join(', ')}</li>`)}</ul>
        <p class="small muted">${t('report.similarNote')}</p>
      </section>` : ''}

    <section class="card">
      <h3 class="card-title">${t('product.history')}</h3>
      ${logs.length ? html`<ul class="log-list">${logs.slice(0, 20).map((l) => html`<li><span>${fmtDateTime(l.at)}</span> · ${l.type === 'feedback'
        ? t('masks.feedbackLog', { s: l.satisfaction ? t(`feedback.${l.satisfaction}`) : '-', r: l.repurchase ? t(`feedback.repurchase_${l.repurchase}`) : '-' })
        : t('masks.usedLog')}</li>`)}</ul>` : html`<p class="muted small">${t('product.noHistory')}</p>`}
      ${lastFeedback?.repurchase === 'yes' ? html`<div class="buy-slot" data-buy></div>` : ''}
    </section>

    ${p.notes ? html`<section class="card"><h3 class="card-title">${t('form.notes')}</h3><p class="pre">${p.notes}</p></section>` : ''}

    <button type="button" class="btn btn-danger-ghost btn-block" data-action="delete">${icon('trash')} ${t('product.delete')}</button>`;
}

export function mount(root, ctx) {
  const main = root.querySelector('main');
  const p = ctx.state.products.find((x) => x.id === ctx.params.id);
  if (!p) return;
  const buy = main.querySelector('[data-buy]');
  if (buy) purchaseBlock(buy, p);

  const patch = (fn) => update((s) => {
    const prod = s.products.find((x) => x.id === p.id);
    fn(prod);
    prod.updatedAt = new Date().toISOString();
  });

  main.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'sheet') {
      const before = p.sheetCount ?? 0;
      const next = Math.max(0, before + Number(el.dataset.delta));
      patch((x) => { x.sheetCount = next; });
      if (before > 0 && next === 0) feedbackModal(p);
    }
    if (a === 'qty') patch((x) => { x.quantity = Math.max(0, (x.quantity ?? 1) + Number(el.dataset.delta)); });
    if (a === 'open-new') patch((x) => { x.quantity -= 1; x.remainingPct = 100; x.openedAt = ctx.today; });
    if (a === 'feedback') feedbackModal(p);
    if (a === 'delete') {
      const ok = await confirmDialog({ title: t('product.deleteTitle'), message: t('product.deleteText', { name: productName(p) }), confirmLabel: t('common.delete'), danger: true });
      if (ok) {
        removeProduct(p.id);
        toast(t('product.deleted'));
        ctx.navigate('/vault');
      }
    }
  });
  main.addEventListener('change', (e) => {
    if (e.target.dataset.action === 'remaining') patch((x) => { x.remainingPct = Number(e.target.value); });
  });
  main.addEventListener('input', (e) => {
    if (e.target.dataset.action === 'remaining') main.querySelector('#rem-out').textContent = `${e.target.value}%`;
  });
}
