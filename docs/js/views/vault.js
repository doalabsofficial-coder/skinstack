import { t } from '../i18n.js';
import { html, icon, emptyState, confirmDialog } from '../ui.js';
import { update, loadDemo } from '../store.js';
import { eligibility, isEmpty, isMask } from '../domain/product.js';
import { findSimilar } from '../domain/duplicates.js';
import { bottle, productName, similarReason } from './common.js';

export const live = true;
export const title = () => t('vault.title');

const FILTERS = ['all', 'check'];

export function render(ctx) {
  const s = ctx.state;
  const filter = FILTERS.includes(ctx.query.f) ? ctx.query.f : 'all';
  const products = s.products.filter((p) => !p.archived);

  if (!products.length && !s.wishlist.length) {
    return emptyState({
      iconName: 'box',
      title: t('vault.emptyTitle'),
      text: t('vault.emptyText'),
      actions: html`<a class="btn btn-primary" href="#/add">${icon('plus')} ${t('home.addFirst')}</a><button type="button" class="btn btn-ghost" data-action="demo">${t('home.loadDemo')}</button>`,
    });
  }

  const needsCheck = (p) => !eligibility(p, s.profile, ctx.today).ok && !isEmpty(p);
  const list = products.filter((p) => filter === 'all' || needsCheck(p)).sort((a, b) => productName(a).localeCompare(productName(b)));
  const checkCount = products.filter(needsCheck).length;

  return html`
    <div class="seg" role="tablist" aria-label="${t('vault.filters')}">
      ${FILTERS.map((f) => html`<a role="tab" aria-selected="${f === filter}" class="${f === filter ? 'on' : ''}" href="#/vault?f=${f}">${t(`vault.filter.${f}`)} <small>${f === 'all' ? products.length : checkCount}</small></a>`)}
    </div>
    ${list.length ? html`
      <ul class="shelf">${list.map((p) => html`<li>
        <a class="shelf-item ${isEmpty(p) ? 'is-empty' : ''}" href="#/product/${p.id}">
          ${bottle(p)}
          <span>${p.name || t('common.untitled')}</span>
          ${needsCheck(p) ? html`<b class="sticker" title="${t('chip.needsCheck')}">!</b>` : ''}
          ${isMask(p) ? html`<b class="sticker count-sticker">${p.sheetCount ?? 0}</b>` : ''}
        </a></li>`)}
      </ul>
      <p class="small muted center">${checkCount ? t('vault.shelfHint') : ''}</p>`
      : html`<p class="soft-note">${icon('check', 'sm')} ${t('vault.allChecked')}</p>`}

    <details class="card">
      <summary class="card-title">${icon('cart')} ${t('wishlist.title')} <small class="muted">${s.wishlist.length}</small></summary>
      ${s.wishlist.length ? html`<ul class="wish-list">${s.wishlist.map((w) => {
        const sims = findSimilar(w, products);
        return html`<li>
          <div class="wish-head"><strong>${productName(w)}</strong>
            <button type="button" class="icon-btn sm" data-action="wish-remove" data-id="${w.id}" aria-label="${t('common.delete')}">${icon('trash')}</button></div>
          ${sims.length && s.settings.duplicateAlerts ? html`<p class="notice notice-check small">${t('wishlist.similarOwned', { n: sims.length })}: ${sims.slice(0, 3).map((x) => html`<a href="#/product/${x.product.id}">${productName(x.product)}</a> (${x.result.reasons.map(similarReason).join(', ')}) `)}</p>` : ''}
        </li>`;
      })}</ul>` : html`<p class="muted small">${t('wishlist.empty')}</p>`}
      <a class="btn btn-ghost btn-sm" href="#/add?mode=wishlist">${icon('plus')} ${t('wishlist.add')}</a>
    </details>
    <p class="hero-links center"><a href="#/catalog">${icon('search', 'sm')} ${t('nav.catalog')}</a> · <a href="#/requests">${t('requests.link')}</a></p>`;
}

export function mount(root, ctx) {
  const main = root.querySelector('main');
  main.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'demo') loadDemo(ctx.state.settings.region);
    if (el.dataset.action === 'wish-remove') {
      if (await confirmDialog({ title: t('wishlist.removeTitle'), message: t('wishlist.removeText'), confirmLabel: t('common.delete'), danger: true })) {
        update((s) => { s.wishlist = s.wishlist.filter((w) => w.id !== el.dataset.id); });
      }
    }
  });
}
