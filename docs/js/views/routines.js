import { t, fmtDate, fmtDateTime } from '../i18n.js';
import { html, htmlString, icon, info, spinner, emptyState, openModal, confirmDialog, toast } from '../ui.js';
import { getState, update } from '../store.js';
import { loadCatalog, catalogProducts, catalogProduct, searchCatalog } from '../domain/catalog.js';
import { analyzeRoutine } from '../domain/routineAnalysis.js';
import { catLabel, comboList, line, productName } from './common.js';

/*
 * 사용자가 직접 만드는 루틴. 상품 DB(서버/정적 데이터)와 분리해 이 기기(localStorage)에 저장합니다.
 * item = { type: 'catalog' | 'vanity', id, amount, memo }
 */
export const live = true;
export const wide = true;
export const title = (ctx) => (ctx.params.id ? t('routines.editTitle') : t('routines.title'));
export const back = (ctx) => (ctx.params.id ? '/routines' : null);

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const refKey = (r) => `${r.type}:${r.id}`;

/** item 참조 → 분석 가능한 제품 (삭제된 경우 null) */
function resolve(ref, s = getState()) {
  if (ref.type === 'catalog') return catalogProduct(ref.id);
  const p = s.products.find((x) => x.id === ref.id);
  return p ? { ...p, source: 'vanity' } : null;
}

function newRoutine({ name, slot }) {
  return { id: uid(), name: name || t('routines.untitled'), slot: slot === 'pm' ? 'pm' : 'am', items: [], versions: [], logs: [], createdAt: now(), updatedAt: now() };
}

const mutate = (id, fn) => update((s) => {
  const r = s.customRoutines.find((x) => x.id === id);
  if (!r) return;
  fn(r, s);
  r.updatedAt = now();
});

/* ---------- 다른 화면에서: '루틴에 추가' ---------- */
export function addToRoutineModal(ref, ctx) {
  const list = getState().customRoutines;
  openModal({
    title: t('routines.addTo'),
    body: html`
      ${list.length ? html`<fieldset class="radio-group col"><legend>${t('routines.pick')}</legend>
        ${list.map((r, i) => html`<label class="radio-pill"><input type="radio" name="target" value="${r.id}" ${i === 0 ? 'checked' : ''}><span>${r.name} · ${t(`routine.${r.slot}`)}</span></label>`)}
        <label class="radio-pill"><input type="radio" name="target" value="__new" ${list.length ? '' : 'checked'}><span>${t('routines.newOne')}</span></label>
      </fieldset>` : html`<input type="hidden" name="target" value="__new">`}
      <div class="new-fields">
        <label class="field"><span>${t('routines.name')}</span><input name="rname" maxlength="60" placeholder="${t('routines.namePlaceholder')}"></label>
        <fieldset class="radio-group"><legend>${t('routines.slot')}</legend>
          <label class="radio-pill"><input type="radio" name="rslot" value="am" checked><span>${t('routine.am')}</span></label>
          <label class="radio-pill"><input type="radio" name="rslot" value="pm"><span>${t('routine.pm')}</span></label>
        </fieldset>
      </div>`,
    actions: [
      { label: t('common.cancel') },
      { label: t('routines.add'), kind: 'btn-primary', onClick: (m) => {
        const target = m.querySelector('[name=target]:checked, [name=target][type=hidden]').value;
        let id = target;
        update((s) => {
          let r = s.customRoutines.find((x) => x.id === target);
          if (!r) {
            r = newRoutine({ name: m.querySelector('[name=rname]').value.trim(), slot: m.querySelector('[name=rslot]:checked').value });
            s.customRoutines.push(r);
          }
          id = r.id;
          r.items.push({ ...ref, amount: '', memo: '' });
          r.updatedAt = now();
        }, { silent: true });
        toast(t('routines.added'));
        ctx.navigate(`/routines/${id}`);
      } },
    ],
  });
}

/* ---------- 목록 ---------- */
function listView(ctx) {
  const list = [...ctx.state.customRoutines].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return html`
    <div class="card-row">
      <p class="small muted">${t('routines.lead')} ${info(t('routines.storageInfo'))}</p>
      <button type="button" class="btn btn-primary btn-sm" data-action="new">${icon('plus', 'sm')} ${t('routines.new')}</button>
    </div>
    ${list.length ? html`<ul class="routine-list">${list.map((r) => {
      const products = r.items.map((i) => resolve(i, ctx.state)).filter(Boolean);
      const a = products.length ? analyzeRoutine(products, r.slot, ctx.state.profile) : null;
      return html`<li class="request-item">
        <div class="request-head"><a href="#/routines/${r.id}"><strong>${r.name}</strong></a>
          <span class="badge badge-accent">${t(`routine.${r.slot}`)}</span></div>
        <p class="small muted">${t('routines.steps', { n: r.items.length })} · ${t('routines.updated', { date: fmtDateTime(r.updatedAt) })}</p>
        ${a ? html`<p class="small">${a.verdict === 'keep' ? html`<span class="chip chip-ok">${t('ra.verdict.keep')}</span>` : html`<span class="chip chip-caution">${t('ra.verdict.adjust')}</span>`}</p>` : ''}
        <div class="btn-row">
          <a class="btn btn-ghost btn-sm" href="#/routines/${r.id}">${t('common.edit')}</a>
          <button type="button" class="btn btn-ghost btn-sm" data-action="dup" data-id="${r.id}">${t('routines.duplicate')}</button>
          <button type="button" class="btn btn-danger-ghost btn-sm" data-action="del" data-id="${r.id}">${t('common.delete')}</button>
        </div>
      </li>`;
    })}</ul>` : emptyState({ iconName: 'layers', title: t('routines.emptyTitle'), text: t('routines.emptyText'), actions: html`<button type="button" class="btn btn-primary" data-action="new">${t('routines.new')}</button><a class="btn btn-ghost" href="#/catalog">${t('nav.catalog')}</a>` })}`;
}

/* ---------- 편집 + 분석 ---------- */
const basisChip = (b) => html`<span class="chip chip-${b === 'official' ? 'ok' : b === 'ingredient' ? 'accent' : 'check'}">${t(`basis.${b}`)}</span>`;
const findingList = (items) => (items.length ? html`<ul class="finding-list">${items.map((f) => html`<li>${basisChip(f.basis)} ${line(f)}</li>`)}</ul>` : html`<p class="small muted">${t('ra.none')}</p>`);

function editorView(ctx) {
  const r = ctx.state.customRoutines.find((x) => x.id === ctx.params.id);
  if (!r) return emptyState({ title: t('routines.notFound'), actions: html`<a class="btn btn-ghost" href="#/routines">${t('routines.title')}</a>` });
  const resolved = r.items.map((i) => ({ ref: i, product: resolve(i, ctx.state) }));
  const products = resolved.filter((x) => x.product).map((x) => x.product);
  const byId = new Map(products.map((p) => [p.id, p]));
  const a = products.length ? analyzeRoutine(products, r.slot, ctx.state.profile) : null;
  const last = r.versions.at(-1);

  return html`
    <div class="routine-grid">
      <div class="routine-main">
        <section class="card">
          <label class="field"><span>${t('routines.name')}</span><input data-field="name" value="${r.name}" maxlength="60"></label>
          <div class="card-row">
            <div class="radio-group" role="radiogroup" aria-label="${t('routines.slot')}">
              ${['am', 'pm'].map((s) => html`<label class="radio-pill"><input type="radio" name="slot" data-field="slot" value="${s}" ${r.slot === s ? 'checked' : ''}><span>${icon(s === 'am' ? 'sun' : 'moon', 'sm')} ${t(`routine.${s}`)}</span></label>`)}
            </div>
            <span class="chip chip-muted">${t('routines.localOnly')} ${info(t('routines.storageInfo'))}</span>
          </div>
          <p class="small muted">${t('routines.autosave')} · ${t('routines.updated', { date: fmtDateTime(r.updatedAt) })}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm" data-action="snapshot">${t('routines.snapshot')}</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="dup" data-id="${r.id}">${t('routines.duplicate')}</button>
            <button type="button" class="btn btn-danger-ghost btn-sm" data-action="del" data-id="${r.id}">${t('common.delete')}</button>
          </div>
        </section>

        <section class="card">
          <div class="card-row"><h3 class="card-title">${t('routines.items')}</h3>
            <button type="button" class="btn btn-primary btn-sm" data-action="pick">${icon('plus', 'sm')} ${t('routines.addProduct')}</button></div>
          ${resolved.length ? html`<ol class="steps">${resolved.map(({ ref, product: p }, i) => html`
            <li class="step">
              <span class="step-num" aria-hidden="true">${i + 1}</span>
              <div class="step-main">
                <div class="step-cat">${p ? catLabel(p.category) : ''} ${p ? html`· <span class="muted">${t(`routines.src.${p.source}`)}</span>` : ''}</div>
                ${p ? html`<a class="step-name" href="${p.source === 'catalog' ? `#/catalog/${p.id}` : `#/product/${p.id}`}">${productName(p)}</a>`
                  : html`<span class="step-name muted">${t('routines.missing')}</span>`}
                <details class="step-details"><summary>${t('routines.memo')}</summary>
                  <label class="field"><span>${t('routines.amount')}</span><input data-item="${i}" data-key="amount" value="${ref.amount || ''}" maxlength="60" placeholder="${t('routines.amountPlaceholder')}"></label>
                  <label class="field"><span>${t('routines.memo')}</span><textarea data-item="${i}" data-key="memo" rows="2" maxlength="500">${ref.memo || ''}</textarea></label>
                </details>
              </div>
              <div class="step-order">
                <button type="button" class="icon-btn sm" data-action="move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('routine.moveUp', { name: productName(p) })}">${icon('up')}</button>
                <button type="button" class="icon-btn sm" data-action="move" data-i="${i}" data-dir="1" ${i === resolved.length - 1 ? 'disabled' : ''} aria-label="${t('routine.moveDown', { name: productName(p) })}">${icon('down')}</button>
                <button type="button" class="icon-btn sm" data-action="replace" data-i="${i}" aria-label="${t('routines.replace')}">⇄</button>
                <button type="button" class="icon-btn sm" data-action="remove" data-i="${i}" aria-label="${t('common.delete')}">${icon('trash')}</button>
              </div>
            </li>`)}</ol>` : html`<p class="small muted">${t('routines.noItems')}</p>`}
        </section>

        ${last ? html`
        <section class="card">
          <h3 class="card-title">${t('routines.compare')}</h3>
          <div class="compare-grid">
            ${[[t('routines.before', { date: fmtDateTime(last.at) }), last.items], [t('routines.after'), r.items]].map(([label, items]) => html`
              <div><h4 class="sub">${label}</h4>
                <ol class="small numbered">${items.map((it) => {
                  const p = resolve(it, ctx.state);
                  const other = items === last.items ? r.items : last.items;
                  const changed = !other.some((o) => refKey(o) === refKey(it));
                  return html`<li class="${changed ? (items === last.items ? 'removed' : 'added') : ''}">${p ? productName(p) : t('routines.missing')}</li>`;
                })}</ol>
              </div>`)}
          </div>
          <p class="small muted">${t('routines.versions', { n: r.versions.length })}</p>
        </section>` : ''}

        <section class="card">
          <h3 class="card-title">${t('routines.logs')} <span class="chip chip-muted">${t('routines.private')}</span></h3>
          <details class="log-form"><summary class="btn btn-ghost btn-sm">${icon('plus', 'sm')} ${t('routines.addLog')}</summary>
            <form class="form" id="log-form">
              <div class="field-row">
                <label class="field"><span>${t('routines.logDate')}</span><input type="date" name="date" value="${ctx.today}" required></label>
                <label class="field"><span>${t('routines.period')}</span><input name="period" maxlength="40" placeholder="${t('routines.periodPlaceholder')}"></label>
              </div>
              <label class="field"><span>${t('routines.good')}</span><textarea name="good" rows="2" maxlength="1000"></textarea></label>
              <label class="field"><span>${t('routines.bad')}</span><textarea name="bad" rows="2" maxlength="1000"></textarea></label>
              <label class="field"><span>${t('routines.reaction')}</span><textarea name="reaction" rows="2" maxlength="1000"></textarea></label>
              <fieldset class="radio-group"><legend>${t('routines.satisfaction')}</legend>
                ${[1, 2, 3, 4, 5].map((n) => html`<label class="radio-pill"><input type="radio" name="satisfaction" value="${n}"><span>${'★'.repeat(n)}</span></label>`)}</fieldset>
              <fieldset class="radio-group"><legend>${t('routines.keep')}</legend>
                ${['yes', 'no', 'undecided'].map((v) => html`<label class="radio-pill"><input type="radio" name="keep" value="${v}"><span>${t(`routines.keep_${v}`)}</span></label>`)}</fieldset>
              ${products.map((p) => html`<label class="field"><span>${t('routines.productMemo', { name: productName(p) })}</span><input name="pm:${p.id}" maxlength="300"></label>`)}
              <button type="submit" class="btn btn-primary">${t('common.save')}</button>
            </form>
          </details>
          ${r.logs.length ? html`<ul class="log-entries">${[...r.logs].sort((x, y) => y.date.localeCompare(x.date)).map((l) => html`
            <li class="card-inner">
              <div class="card-row"><strong>${fmtDate(l.date, { dateStyle: 'medium' })}</strong>
                <span class="small">${l.satisfaction ? '★'.repeat(l.satisfaction) : ''} ${l.keep ? html`<span class="chip chip-muted">${t(`routines.keep_${l.keep}`)}</span>` : ''}
                <button type="button" class="icon-btn sm" data-action="del-log" data-log="${l.id}" aria-label="${t('common.delete')}">${icon('trash')}</button></span></div>
              ${l.period ? html`<p class="small muted">${t('routines.period')}: ${l.period}</p>` : ''}
              ${l.good ? html`<p class="small"><strong>${t('routines.good')}:</strong> ${l.good}</p>` : ''}
              ${l.bad ? html`<p class="small"><strong>${t('routines.bad')}:</strong> ${l.bad}</p>` : ''}
              ${l.reaction ? html`<p class="small"><strong>${t('routines.reaction')}:</strong> ${l.reaction}</p>` : ''}
              ${Object.entries(l.productMemos || {}).filter(([, v]) => v).map(([pid, v]) => html`<p class="small"><strong>${productName(byId.get(pid)) || pid}:</strong> ${v}</p>`)}
            </li>`)}</ul>` : html`<p class="small muted">${t('routines.noLogs')}</p>`}
        </section>
      </div>

      <aside class="routine-side">
        <section class="card">
          <h3 class="card-title">${t('ra.title')} <span class="chip chip-check">${t('basis.app')}</span> ${info(t('ra.info'))}</h3>
          ${!a ? html`<p class="small muted">${t('ra.empty')}</p>` : html`
            <p class="notice ${a.verdict === 'keep' ? 'notice-ok' : 'notice-caution'}">${icon(a.verdict === 'keep' ? 'check' : 'alert')}<span>${t(`ra.verdict.${a.verdict}Long`)}</span></p>

            <h4 class="sub">${t('ra.order')}</h4>
            <ol class="finding-list numbered">${a.recommended.map(({ product: p, reasons }) => html`<li><strong>${productName(p)}</strong>
              <ul class="small">${reasons.map((x) => html`<li>${basisChip(x.basis)} ${line(x.key === 'ra.reason.texture' ? { key: x.key, params: { texture: t(`texture.${x.params.texture}`) } } : x)}</li>`)}</ul></li>`)}</ol>
            ${!a.sameOrder ? html`<button type="button" class="btn btn-primary btn-sm" data-action="apply-order">${t('ra.apply')}</button>` : ''}

            <details open><summary class="sub">${t('ra.pros')} (${a.pros.length})</summary>${findingList(a.pros)}</details>
            <details open><summary class="sub">${t('ra.cons')} (${a.cons.length})</summary>${findingList(a.cons)}</details>
            <details open><summary class="sub">${t('ra.combos')}</summary>${comboList(a.combos, byId)}
              <p class="notice notice-caution small">${t('report.stopIfIrritation')} ${t('ra.patch')}</p></details>
            ${a.conflicts.length ? html`<details open><summary class="sub">${t('ra.conflicts')} (${a.conflicts.length})</summary>
              <ul class="finding-list">${a.conflicts.map((c) => html`<li>${basisChip('official')} ${t('ra.conflict', { first: productName(c.first), second: productName(c.second) })}<br><span class="quote small">“${c.quote}”</span></li>`)}</ul></details>` : ''}
            ${a.frequency.length ? html`<details><summary class="sub">${t('ra.frequency')}</summary>
              <ul class="finding-list">${a.frequency.map((f) => html`<li>${basisChip('official')} ${t('ra.freq', { name: productName(f.product), n: f.n })}${f.quote ? html`<br><span class="quote small">“${f.quote}”</span>` : ''}</li>`)}</ul></details>` : ''}
            <details><summary class="sub">${t('ra.notes')}</summary>${findingList(a.notes)}</details>`}
        </section>
      </aside>
    </div>`;
}

export function render(ctx) {
  if (!catalogProducts()) return spinner();
  return ctx.params.id ? editorView(ctx) : listView(ctx);
}

/* ---------- 제품 선택 모달 (상품 DB + 화장대) ---------- */
function pickerModal(onPick) {
  const s = getState();
  const renderResults = (q) => {
    const cat = searchCatalog({ q }, (g) => t(`group.${g}`)).slice(0, 30).map((p) => ({ ref: { type: 'catalog', id: p.id }, p }));
    const ql = q.trim().toLowerCase();
    const mine = s.products.filter((p) => !p.archived && (!ql || productName(p).toLowerCase().includes(ql))).slice(0, 30).map((p) => ({ ref: { type: 'vanity', id: p.id }, p }));
    const row = ({ ref, p }) => html`<li><button type="button" class="result" data-type="${ref.type}" data-id="${ref.id}">
      <span class="product-cat">${catLabel(p.category || p.categoryHint)}</span><span class="product-name">${productName(p)}</span></button></li>`;
    return htmlString(html`
      <h4 class="sub">${t('nav.vault')} (${mine.length})</h4><ul class="result-list">${mine.map(row)}</ul>
      <h4 class="sub">${t('nav.catalog')} (${cat.length})</h4><ul class="result-list">${cat.map(row)}</ul>`);
  };
  openModal({
    title: t('routines.addProduct'),
    body: html`<div class="search-bar">${icon('search')}<label class="sr-only" for="pick-q">${t('catalog.search')}</label><input id="pick-q" type="search" placeholder="${t('catalog.search')}"></div><div class="picker-results"></div>`,
    actions: [{ label: t('common.close') }],
    onMount: (m, close) => {
      const out = m.querySelector('.picker-results');
      out.innerHTML = renderResults('');
      m.querySelector('#pick-q').addEventListener('input', (e) => { out.innerHTML = renderResults(e.target.value); });
      out.addEventListener('click', (e) => {
        const b = e.target.closest('.result');
        if (!b) return;
        close();
        onPick({ type: b.dataset.type, id: b.dataset.id });
      });
    },
  });
}

export function mount(root, ctx) {
  const main = root.querySelector('main');
  if (!catalogProducts()) {
    loadCatalog().then(() => ctx.rerender()).catch(() => { main.innerHTML = htmlString(emptyState({ title: t('catalog.loadFailed') })); });
    return;
  }
  const id = ctx.params.id;

  main.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const i = Number(el.dataset.i);
    if (a === 'new') {
      const r = newRoutine({ slot: 'am' });
      update((s) => { s.customRoutines.push(r); }, { silent: true });
      ctx.navigate(`/routines/${r.id}`);
    }
    if (a === 'dup') {
      const src = getState().customRoutines.find((x) => x.id === el.dataset.id);
      const copy = { ...structuredClone(src), id: uid(), name: t('routines.copyName', { name: src.name }), versions: [], logs: [], createdAt: now(), updatedAt: now() };
      update((s) => { s.customRoutines.push(copy); }, { silent: true });
      toast(t('routines.duplicated'));
      ctx.navigate(`/routines/${copy.id}`);
    }
    if (a === 'del') {
      if (await confirmDialog({ title: t('routines.deleteTitle'), message: t('routines.deleteText'), confirmLabel: t('common.delete'), danger: true })) {
        update((s) => { s.customRoutines = s.customRoutines.filter((x) => x.id !== el.dataset.id); }, { silent: !id });
        if (id) ctx.navigate('/routines'); else ctx.rerender();
      }
    }
    if (a === 'pick') pickerModal((ref) => mutate(id, (r) => { r.items.push({ ...ref, amount: '', memo: '' }); }));
    if (a === 'replace') pickerModal((ref) => mutate(id, (r) => { r.items[i] = { ...ref, amount: '', memo: r.items[i].memo }; }));
    if (a === 'move') mutate(id, (r) => { const j = i + Number(el.dataset.dir); [r.items[i], r.items[j]] = [r.items[j], r.items[i]]; });
    if (a === 'remove') mutate(id, (r) => { r.items.splice(i, 1); });
    if (a === 'snapshot') { mutate(id, (r) => { r.versions.push({ at: now(), items: structuredClone(r.items) }); }); toast(t('routines.snapshotSaved')); }
    if (a === 'del-log') mutate(id, (r) => { r.logs = r.logs.filter((l) => l.id !== el.dataset.log); });
    if (a === 'apply-order') {
      const r = getState().customRoutines.find((x) => x.id === id);
      const products = r.items.map((it) => resolve(it)).filter(Boolean);
      const order = analyzeRoutine(products, r.slot, getState().profile).recommended.map((x) => x.product.id);
      // 적용 전 상태를 버전으로 남겨 전후 비교 가능
      mutate(id, (rr) => {
        rr.versions.push({ at: now(), items: structuredClone(rr.items) });
        rr.items.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
      });
      toast(t('ra.applied'));
    }
  });

  main.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.field === 'name') mutate(id, (r) => { r.name = el.value.trim() || t('routines.untitled'); });
    if (el.dataset.field === 'slot') mutate(id, (r) => { r.slot = el.value; });
    if (el.dataset.item != null) mutate(id, (r) => { r.items[Number(el.dataset.item)][el.dataset.key] = el.value; });
  });

  main.querySelector('#log-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const productMemos = {};
    for (const [k, v] of fd.entries()) if (k.startsWith('pm:') && v.trim()) productMemos[k.slice(3)] = v.trim();
    mutate(id, (r) => {
      r.logs.push({
        id: uid(), date: fd.get('date'), period: fd.get('period').trim(), good: fd.get('good').trim(), bad: fd.get('bad').trim(),
        reaction: fd.get('reaction').trim(), satisfaction: Number(fd.get('satisfaction')) || null, keep: fd.get('keep') || '', productMemos,
        itemsAt: structuredClone(r.items),
      });
    });
    toast(t('routines.logSaved'));
  });
}
