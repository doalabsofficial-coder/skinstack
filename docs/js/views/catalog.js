import { t, fmtDate } from '../i18n.js';
import { html, htmlString, icon, info, spinner, errorState, emptyState, productImage, toast } from '../ui.js';
import { loadCatalog, catalogProducts, catalogProduct, ingredient, keyGroups, searchCatalog, polarity, textureAnalysis } from '../domain/catalog.js';
import { CATEGORIES } from '../domain/categories.js';
import { createProduct } from '../domain/product.js';
import { update } from '../store.js';
import { catLabel } from './common.js';
import { addToRoutineModal } from './routines.js';

export const wide = true;
export const title = (ctx) => (ctx.params.id ? t('catalog.detailTitle') : t('catalog.title'));
export const back = (ctx) => (ctx.params.id ? '/catalog' : null);

const groupLabel = (g) => t(`group.${g}`);
const slotLabel = (s) => (s ? t(`timeOfUse.${s}`) : t('catalog.unverified'));
const badge = (p) => (p.verificationStatus === 'official_verified'
  ? html`<span class="chip chip-ok">${t('catalog.verified', { date: fmtDate(p.verifiedAt, { dateStyle: 'medium' }) })}</span>`
  : html`<span class="chip chip-check">${t('catalog.partial')}</span>`);

export function render(ctx) {
  if (!catalogProducts()) return html`<div id="catalog-root">${spinner()}</div>`;
  return ctx.params.id ? detail(ctx) : list(ctx);
}

function list(ctx) {
  const q = ctx.query;
  const all = catalogProducts();
  const items = searchCatalog({ q: q.q, category: q.cat, brand: q.brand, texture: q.tex, slot: q.slot }, groupLabel);
  const brands = [...new Set(all.map((p) => p.brand))].sort();
  const select = (key, label, options) => html`
    <label class="field compact"><span class="sr-only">${label}</span>
      <select data-filter="${key}">
        <option value="">${label}: ${t('catalog.all')}</option>
        ${options.map(([v, l]) => html`<option value="${v}" ${q[key] === v ? 'selected' : ''}>${l}</option>`)}
      </select></label>`;
  return html`
    <form class="search-bar" role="search" id="catalog-q">
      ${icon('search')}
      <label class="sr-only" for="cq2">${t('catalog.search')}</label>
      <input id="cq2" name="q" type="search" value="${q.q || ''}" placeholder="${t('catalog.search')}">
    </form>
    <div class="filter-row">
      ${select('cat', t('form.category'), CATEGORIES.filter((c) => all.some((p) => p.category === c.id)).map((c) => [c.id, catLabel(c.id)]))}
      ${select('brand', t('form.brand'), brands.map((b) => [b, b]))}
      ${select('tex', t('form.texture'), ['water', 'gel', 'milk', 'cream', 'oil'].filter((x) => all.some((p) => p.texture === x)).map((x) => [x, t(`texture.${x}`)]))}
      ${select('slot', t('form.timeOfUse'), [['am', t('routine.am')], ['pm', t('routine.pm')]])}
    </div>
    <p class="small muted">${t('catalog.count', { n: items.length })} · ${t('catalog.sourceNote')} ${info(t('catalog.sourceInfo'))}</p>
    ${items.length ? html`<ul class="catalog-grid">${items.map((p) => html`
      <li class="pcard">
        <a href="#/catalog/${p.id}" class="pcard-img" tabindex="-1" aria-hidden="true">${productImage(p.imageUrl, '')}</a>
        <div class="pcard-body">
          <p class="product-cat">${catLabel(p.category)} · ${p.texture ? t(`texture.${p.texture}`) : t('catalog.textureUnknown')}</p>
          <p class="pcard-brand">${p.brand}</p>
          <a class="pcard-name" href="#/catalog/${p.id}">${p.name}</a>
          <p class="product-meta">${p.volume || t('catalog.volumeUnknown')}</p>
          <div class="chips">${keyGroups(p).slice(0, 3).map((g) => html`<span class="chip chip-accent">${groupLabel(g)}</span>`)}</div>
          <div class="btn-row">
            <a class="btn btn-ghost btn-sm" href="#/catalog/${p.id}">${t('catalog.detail')}</a>
            <button type="button" class="btn btn-primary btn-sm" data-action="to-routine" data-id="${p.id}">${icon('plus', 'sm')} ${t('catalog.addRoutine')}</button>
          </div>
        </div>
      </li>`)}</ul>` : emptyState({ iconName: 'search', title: t('catalog.noMatch'), text: t('catalog.noMatchText'), actions: html`<a class="btn btn-ghost btn-sm" href="#/requests">${t('requests.cta')}</a>` })}`;
}

function detail(ctx) {
  const p = catalogProduct(ctx.params.id);
  if (!p) return errorState(t('product.notFound'));
  const tex = textureAnalysis(p);
  const order = p.officialOrder;
  const ings = (p.ingredientIds || []).map((id) => ingredient(id)).filter(Boolean);
  return html`
    <div class="detail-grid">
      <section class="card detail-head">
        ${productImage(p.imageUrl, `${p.brand} ${p.name}`)}
        <p class="eyebrow">${p.brand} · ${catLabel(p.category)}</p>
        <h2 class="product-title">${p.name}</h2>
        <p class="muted">${p.volume || t('catalog.volumeUnknown')} · ${p.texture ? t(`texture.${p.texture}`) : t('catalog.textureUnknown')}</p>
        <div class="chips">${badge(p)}${p.imageUrl ? '' : html`<span class="chip chip-muted">${t('catalog.imageRights')}</span>`}</div>
        <p class="small"><a href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer">${icon('external', 'sm')} ${t('catalog.source')}</a> <span class="muted">· ${t('catalog.sourceNote')}</span></p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" data-action="to-routine" data-id="${p.id}">${icon('layers')} ${t('catalog.addRoutine')}</button>
          <button type="button" class="btn btn-ghost" data-action="to-vanity" data-id="${p.id}">${icon('box')} ${t('catalog.addVanity')}</button>
        </div>
      </section>

      <div class="detail-col">
        <section class="card">
          <h3 class="card-title">${t('catalog.official')} <span class="chip chip-ok">${t('basis.official')}</span></h3>
          ${p.description ? html`<p class="small">${p.description}</p>` : ''}
          <h4 class="sub">${t('form.usage')}</h4>
          <p class="pre">${p.usageOfficial || t('common.needsCheck')}</p>
          ${p.cautionsOfficial?.length ? html`<h4 class="sub">${t('form.warnings')}</h4><ul class="bullets">${p.cautionsOfficial.map((c) => html`<li>${c}</li>`)}</ul>` : ''}
          ${p.shelfLife ? html`<p class="small muted">${t('catalog.shelfLife')}: ${p.shelfLife}</p>` : ''}
        </section>

        <section class="card">
          <h3 class="card-title">${t('catalog.order')} ${info(t('catalog.orderInfo'))}</h3>
          <dl class="dl">
            <dt>${t('catalog.generalStep')}</dt><dd>${catLabel(p.category)} <span class="chip chip-check">${t('basis.general')}</span></dd>
            <dt>${t('form.timeOfUse')}</dt><dd>${slotLabel(p.timeOfUse)}</dd>
            <dt>${t('form.frequency')}</dt><dd>${p.frequencyPerWeek ? t('routine.perWeek', { n: p.frequencyPerWeek }) : t('catalog.unverified')}</dd>
          </dl>
          ${order ? html`<p class="quote"><span class="chip chip-ok">${t('basis.official')}</span> “${order.quote}”</p>` : html`<p class="small muted">${t('catalog.noOfficialOrder')}</p>`}
          ${p.frequencyQuote ? html`<p class="quote"><span class="chip chip-ok">${t('basis.official')}</span> “${p.frequencyQuote}”</p>` : ''}
          ${p.interactionNotes?.length ? html`<p class="notice notice-avoid small">${icon('alert')}<span>${t('catalog.officialCombo')}: ${[...new Set(p.interactionNotes.map((n) => groupLabel(n.group)))].join(', ')}</span></p>` : ''}
        </section>

        <section class="card">
          <h3 class="card-title">${t('catalog.textureTitle')} <span class="chip chip-check">${t('basis.app')}</span></h3>
          <ul class="bullets small">
            <li>${tex.waterFirst ? t('catalog.tex.waterFirst') : t('catalog.tex.notWaterFirst')}</li>
            ${tex.oilyTop.length ? html`<li>${t('catalog.tex.oily', { list: tex.oilyTop.join(', ') })}</li>` : ''}
            ${tex.filmFormers.length ? html`<li>${t('catalog.tex.film', { list: tex.filmFormers.join(', ') })}</li>` : ''}
            ${tex.occlusives.length ? html`<li>${t('catalog.tex.occlusive', { list: tex.occlusives.join(', ') })}</li>` : ''}
          </ul>
          <p class="small muted">${t('catalog.tex.note')}</p>
        </section>
      </div>

      <section class="card detail-full">
        <h3 class="card-title">${t('catalog.ingredients', { n: ings.length })} ${info(t('catalog.molecularInfo'))}</h3>
        <div class="chips">${keyGroups(p).map((g) => html`<span class="chip chip-accent">${groupLabel(g)}</span>`)}</div>
        <details class="raw-text"><summary>${t('catalog.rawList')}</summary><p class="ingredients">${p.ingredientsRaw}</p></details>
        <div class="table-wrap">
          <table class="ing-table">
            <thead><tr><th scope="col">#</th><th scope="col">INCI</th><th scope="col">${t('catalog.mw')}</th><th scope="col">${t('catalog.polarity')}</th><th scope="col">${t('catalog.groups')}</th></tr></thead>
            <tbody>${ings.map((i, n) => html`<tr>
              <td>${n + 1}</td>
              <td>${i.inci}</td>
              <td>${i.molecularWeight ? html`<a href="${i.sources[0]}" target="_blank" rel="noopener noreferrer">${i.molecularWeight}</a>` : html`<span class="muted">${t(`catalog.chem.${i.chemStatus}`)}</span>`}</td>
              <td>${polarity(i.xlogp) ? t(`catalog.pol.${polarity(i.xlogp)}`) : html`<span class="muted">—</span>`}</td>
              <td>${i.groups.map(groupLabel).join(', ')}</td></tr>`)}</tbody>
          </table>
        </div>
        <p class="small muted">${t('catalog.molecularNote')}</p>
      </section>
    </div>`;
}

export function mount(root, ctx) {
  const main = root.querySelector('main');
  if (!catalogProducts()) {
    loadCatalog().then(() => ctx.rerender()).catch(() => { main.innerHTML = htmlString(errorState(t('catalog.loadFailed'))); });
    return;
  }
  const setQuery = (patch) => {
    const q = { ...ctx.query, ...patch };
    Object.keys(q).forEach((k) => { if (!q[k]) delete q[k]; });
    ctx.navigate(`/catalog${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`);
  };
  main.querySelector('#catalog-q')?.addEventListener('submit', (e) => { e.preventDefault(); setQuery({ q: e.target.q.value.trim() }); });
  main.addEventListener('change', (e) => { if (e.target.dataset.filter) setQuery({ [e.target.dataset.filter]: e.target.value }); });
  main.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const p = catalogProduct(el.dataset.id);
    if (el.dataset.action === 'to-routine') addToRoutineModal({ type: 'catalog', id: p.id }, ctx);
    if (el.dataset.action === 'to-vanity') {
      // 국가·리뉴얼에 따라 라벨이 다를 수 있으므로 내 제품 라벨과 확인하는 화면으로 이동
      const vp = createProduct({
        brand: p.brand, name: p.name, volume: p.volume || '', category: p.category, categoryConfirmed: true, texture: p.texture || '',
        ingredientsText: p.ingredientsRaw || '', usageText: p.usageOfficial || '', warningsText: (p.cautionsOfficial || []).join('\n'),
        timeOfUse: p.timeOfUse || 'auto', frequencyPerWeek: p.frequencyPerWeek, frequencyQuote: p.frequencyQuote,
        catalogId: p.id, interactionNotes: p.interactionNotes, officialOrder: p.officialOrder, pregnancyAvoid: p.pregnancyAvoid,
        dataSource: 'catalog', sheetCount: p.category === 'sheet_mask' ? 1 : null,
      });
      update((s) => { s.products.push(vp); });
      toast(t('catalog.addedVanity'));
      ctx.navigate(`/product/${vp.id}/edit`);
    }
  });
}
