import { t, fmtDateTime, errorText } from '../i18n.js';
import { html, htmlString, icon, info, spinner, errorState, openModal, toast, emptyState } from '../ui.js';
import { api } from '../api.js';
import { CATEGORIES, REGULATORY } from '../domain/categories.js';
import { ACTIVE_GROUPS } from '../domain/ingredients.js';

/*
 * 관리자 화면. 화면 표시 여부와 무관하게 모든 데이터/동작은 서버에서 관리자 세션을 검증합니다.
 */
export const hideNav = true;
export const title = () => t('admin.title');
export const back = () => '/settings';

const TABS = ['requests', 'catalog', 'community', 'links'];
const STATUSES = ['', 'received', 'reviewing', 'needs_info', 'approved', 'rejected'];
const STATUS_CLASS = { received: 'muted', reviewing: 'accent', needs_info: 'check', approved: 'ok', rejected: 'avoid' };

export function render() {
  return html`<div id="admin-root">${spinner()}</div>`;
}

const opt = (v, label, cur) => html`<option value="${v}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${label}</option>`;

function catalogFields(p) {
  const notes = (p.interactionNotes || []).map((n) => `${n.group} | ${n.level} | ${n.source}`).join('\n');
  return html`
    <div class="form">
      <div class="field-row">
        <label class="field"><span>${t('form.brand')}</span><input name="brand" value="${p.brand || ''}" maxlength="120"></label>
        <label class="field"><span>${t('form.name')}</span><input name="name" value="${p.name || ''}" maxlength="200"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>${t('admin.nameEn')}</span><input name="nameEn" value="${p.nameEn || ''}" maxlength="200"></label>
        <label class="field"><span>${t('form.volume')}</span><input name="volume" value="${p.volume || ''}" maxlength="40"></label>
      </div>
      <div class="field-row three">
        <label class="field"><span>${t('form.category')}</span><select name="category">${opt('', t('form.choose'), p.category)}${CATEGORIES.map((c) => opt(c.id, t(`category.${c.id}`), p.category))}</select></label>
        <label class="field"><span>${t('form.regulatory')}</span><select name="regulatory">${REGULATORY.map((r) => opt(r, t(`regulatory.${r}`), p.regulatory || 'unknown'))}</select></label>
        <label class="field"><span>${t('form.region')}</span><select name="region">${['KR', 'US', 'GLOBAL'].map((r) => opt(r, t(`region.${r}`), p.region))}</select></label>
      </div>
      <label class="field"><span>${t('form.ingredients')}</span><textarea name="ingredientsText" rows="4">${p.ingredientsText || ''}</textarea></label>
      <label class="field"><span>${t('form.usage')}</span><textarea name="usageText" rows="2">${p.usageText || ''}</textarea></label>
      <label class="field"><span>${t('form.warnings')}</span><textarea name="warningsText" rows="2">${p.warningsText || ''}</textarea></label>
      <label class="field"><span>${t('admin.sourceUrl')} ${info(t('admin.sourceUrlInfo'))}</span><input name="sourceUrl" type="url" value="${p.sourceUrl || ''}"></label>
      <label class="field"><span>${t('admin.sourceNote')}</span><input name="sourceNote" value="${p.sourceNote || ''}" maxlength="1000"></label>
      <label class="field"><span>${t('admin.interactionNotes')} ${info(t('admin.interactionNotesInfo', { groups: Object.keys(ACTIVE_GROUPS).join(', ') }))}</span>
        <textarea name="interactionNotes" rows="2" placeholder="retinoid | caution | ...">${notes}</textarea></label>
    </div>`;
}

function readCatalogFields(scope) {
  const v = (n) => scope.querySelector(`[name="${n}"]`)?.value.trim() ?? '';
  return {
    brand: v('brand'), name: v('name'), nameEn: v('nameEn'), volume: v('volume'), category: v('category') || null,
    regulatory: v('regulatory'), region: v('region'), ingredientsText: v('ingredientsText'), usageText: v('usageText'),
    warningsText: v('warningsText'), sourceUrl: v('sourceUrl'), sourceNote: v('sourceNote'),
    interactionNotes: v('interactionNotes').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0])
      .map(([group, level, source]) => ({ group, level: level === 'avoid' ? 'avoid' : 'caution', source: source || '' })),
  };
}

async function show(root, ctx) {
  const box = root.querySelector('#admin-root');
  box.innerHTML = htmlString(spinner());
  let me;
  try { me = await api.admin.me(); } catch (err) { box.innerHTML = htmlString(errorState(errorText(err.code))); return; }

  if (!me.enabled) { box.innerHTML = htmlString(html`<p class="notice notice-check">${icon('alert')}<span>${t('admin.disabled')}</span></p>`); return; }
  if (!me.admin) {
    box.innerHTML = htmlString(html`
      <section class="card">
        <h3 class="card-title">${icon('shield')} ${t('admin.login')}</h3>
        <form class="form" id="admin-login">
          <label class="field"><span>${t('admin.password')}</span><input type="password" name="password" autocomplete="current-password" required></label>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn btn-primary btn-block" type="submit">${t('admin.loginCta')}</button>
        </form>
        <p class="small muted">${t('admin.loginNote')}</p>
      </section>`);
    const form = box.querySelector('#admin-login');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.admin.login(form.password.value);
        show(root, ctx);
      } catch (err) {
        const el = form.querySelector('.form-error');
        el.textContent = errorText(err.code);
        el.hidden = false;
      }
    });
    return;
  }

  const tab = TABS.includes(ctx.query.tab) ? ctx.query.tab : 'requests';
  box.innerHTML = htmlString(html`
    <div class="admin-bar">
      <div class="tabs" role="tablist">${TABS.map((x) => html`<a role="tab" aria-selected="${x === tab}" class="tab ${x === tab ? 'active' : ''}" href="#/admin?tab=${x}">${t(`admin.tab.${x}`)}</a>`)}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="logout">${t('admin.logout')}</button>
    </div>
    <div id="admin-body">${spinner()}</div>`);
  box.querySelector('[data-action="logout"]').addEventListener('click', async () => { await api.admin.logout(); show(root, ctx); });
  const body = box.querySelector('#admin-body');
  if (tab === 'requests') return requestsTab(body, ctx);
  if (tab === 'catalog') return catalogTab(body);
  if (tab === 'community') return communityTab(body);
  return linksTab(body);
}

async function communityTab(body) {
  let data;
  try { data = await api.admin.community(); } catch (err) { body.innerHTML = htmlString(errorState(errorText(err.code))); return; }
  body.innerHTML = htmlString(html`
    <p class="small muted">${t('admin.communityLead')}</p>
    ${data.items.length ? html`<ul class="request-list">${data.items.map((p) => html`
      <li class="request-item">
        <div class="request-head"><strong>${p.brand} ${p.name}</strong><span class="badge badge-${p.status === 'visible' ? 'ok' : 'muted'}">${t(`admin.communityStatus.${p.status}`)}</span></div>
        <p class="small muted">${p.category ? t(`category.${p.category}`) : ''} · ${t('admin.contributors', { n: p.contributorCount })} · ${p.ingredientsText ? t('admin.hasIngredients') : t('chip.noIngredients')}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-action="toggle" data-id="${p.id}" data-status="${p.status === 'visible' ? 'hidden' : 'visible'}">${p.status === 'visible' ? t('admin.hide') : t('admin.unhide')}</button>
      </li>`)}</ul>` : emptyState({ iconName: 'inbox', title: t('admin.noCommunity') })}`);
  body.onclick = async (e) => {
    const b = e.target.closest('[data-action="toggle"]');
    if (!b) return;
    try { await api.admin.setCommunityStatus(b.dataset.id, b.dataset.status); communityTab(body); } catch (err) { toast(errorText(err.code), 'error'); }
  };
}

async function requestsTab(body, ctx) {
  const status = STATUSES.includes(ctx.query.status) ? ctx.query.status : '';
  let data;
  try { data = await api.admin.requests(status); } catch (err) { body.innerHTML = htmlString(errorState(errorText(err.code))); return; }
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  body.innerHTML = htmlString(html`
    <div class="tabs small-tabs">${STATUSES.map((st) => html`<a class="tab ${st === status ? 'active' : ''}" href="#/admin?tab=requests&status=${st}">${st ? t(`requestStatus.${st}`) : t('admin.all')} <span class="count">${st ? data.counts[st] || 0 : total}</span></a>`)}</div>
    ${data.items.length ? html`<ul class="request-list">${data.items.map((r, i) => html`
      <li class="request-item">
        <div class="request-head"><strong>${r.brand || '—'} ${r.name}</strong><span class="badge badge-${STATUS_CLASS[r.status]}">${t(`requestStatus.${r.status}`)}</span></div>
        <p class="small muted">${fmtDateTime(r.createdAt)} · ${t(`region.${r.region}`)}${r.volume ? ` · ${r.volume}` : ''}${r.hasPhoto ? ` · ${t('admin.hasPhoto')}` : ''}${r.userId === 'demo' ? ` · ${t('admin.demoSeed')}` : ''}</p>
        ${r.note && r.note !== 'demo-seed' ? html`<p class="small">${r.note}</p>` : ''}
        ${r.userReply ? html`<p class="small notice notice-check">${t('admin.userReply')}: ${r.userReply}</p>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-action="review" data-index="${i}">${t('admin.review')}</button>
      </li>`)}</ul>` : emptyState({ iconName: 'inbox', title: t('admin.noRequests') })}`);
  body.onclick = (e) => {
    const b = e.target.closest('[data-action="review"]');
    if (b) reviewModal(data.items[Number(b.dataset.index)], () => requestsTab(body, ctx));
  };
}

function reviewModal(r, refresh) {
  const act = (fn) => async (modal) => {
    try { await fn(modal); toast(t('common.saved')); refresh(); } catch (err) { toast(errorText(err.code), 'error'); return false; }
    return undefined;
  };
  const note = (m) => m.querySelector('[name="adminNote"]').value.trim();
  openModal({
    title: t('admin.reviewTitle'),
    body: html`
      <p class="small muted">${t('admin.reviewLead')}</p>
      ${r.hasPhoto ? html`<img class="req-photo" src="/api/admin/requests/${r.id}/photo" alt="${t('admin.photoAlt')}">` : ''}
      ${r.infoUrl ? html`<p class="small"><a href="${r.infoUrl}" target="_blank" rel="noopener noreferrer">${icon('external', 'sm')} ${r.infoUrl}</a></p>` : ''}
      ${r.note && r.note !== 'demo-seed' ? html`<p class="small">${t('requests.note')}: ${r.note}</p>` : ''}
      ${catalogFields({ brand: r.brand, name: r.name, volume: r.volume, region: r.region, sourceUrl: r.infoUrl })}
      <label class="field"><span>${t('admin.adminNote')} ${info(t('admin.adminNoteInfo'))}</span><textarea name="adminNote" rows="2">${r.adminNote || ''}</textarea></label>
      <details class="small"><summary>${t('admin.history')}</summary><ul>${(r.history || []).map((h) => html`<li>${fmtDateTime(h.at)} · ${t(`requestStatus.${h.status}`)} · ${h.by}</li>`)}</ul></details>`,
    actions: [
      { label: t('common.close') },
      { label: t('admin.markReviewing'), onClick: act((m) => api.admin.updateRequest(r.id, { status: 'reviewing', adminNote: note(m) })) },
      { label: t('admin.needsInfo'), onClick: act((m) => {
        if (!note(m)) { toast(t('admin.noteRequired'), 'error'); throw Object.assign(new Error(), { code: 'missing_fields' }); }
        return api.admin.updateRequest(r.id, { status: 'needs_info', adminNote: note(m) });
      }) },
      { label: t('admin.reject'), kind: 'btn-danger', onClick: act((m) => api.admin.updateRequest(r.id, { status: 'rejected', adminNote: note(m) })) },
      { label: t('admin.approve'), kind: 'btn-primary', onClick: act((m) => api.admin.approve(r.id, { product: readCatalogFields(m), adminNote: note(m) })) },
    ],
  });
}

async function catalogTab(body) {
  let data;
  try { data = await api.admin.catalog(); } catch (err) { body.innerHTML = htmlString(errorState(errorText(err.code))); return; }
  body.innerHTML = htmlString(data.items.length ? html`
    <p class="small muted">${t('admin.catalogLead')}</p>
    <ul class="request-list">${data.items.map((p, i) => html`
      <li class="request-item">
        <div class="request-head"><strong>${p.brand} ${p.name}</strong><span class="badge badge-${p.status === 'approved' ? 'ok' : 'muted'}">${t(`admin.catalogStatus.${p.status}`)}</span></div>
        <p class="small muted">${p.category ? t(`category.${p.category}`) : t('common.needsCheck')} · ${t(`regulatory.${p.regulatory}`)} · ${p.ingredientsText ? t('admin.hasIngredients') : t('chip.noIngredients')}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-index="${i}">${t('common.edit')}</button>
      </li>`)}</ul>` : emptyState({ iconName: 'box', title: t('admin.noCatalog'), text: t('admin.noCatalogText') }));
  body.onclick = (e) => {
    const b = e.target.closest('[data-action="edit"]');
    if (!b) return;
    const p = data.items[Number(b.dataset.index)];
    const save = (status) => async (m) => {
      try { await api.admin.updateCatalog(p.id, { ...readCatalogFields(m), status }); toast(t('common.saved')); catalogTab(body); } catch (err) { toast(errorText(err.code), 'error'); return false; }
      return undefined;
    };
    openModal({
      title: t('admin.editCatalog'),
      body: catalogFields(p),
      actions: [
        { label: t('common.close') },
        { label: p.status === 'approved' ? t('admin.hide') : t('admin.unhide'), onClick: save(p.status === 'approved' ? 'hidden' : 'approved') },
        { label: t('common.save'), kind: 'btn-primary', onClick: save(p.status) },
      ],
    });
  };
}

async function linksTab(body) {
  let data;
  try { data = await api.admin.links(); } catch (err) { body.innerHTML = htmlString(errorState(errorText(err.code))); return; }
  body.innerHTML = htmlString(html`
    <section class="card">
      <h3 class="card-title">${t('admin.affStatus')}</h3>
      <ul class="aff-status">${Object.entries(data.affiliate).filter(([, v]) => v.provider).map(([region, v]) => html`<li><span>${t(`region.${region}`)} · ${t(`provider.${v.provider}`)}</span><span class="badge badge-${v.enabled ? 'ok' : 'muted'}">${v.enabled ? t('settings.affOn') : t('settings.affOff')}</span></li>`)}</ul>
      <p class="small muted">${t('admin.affEnvNote')}</p>
    </section>
    ${data.items.length ? html`<ul class="request-list">${data.items.map((l) => html`
      <li class="request-item">
        <div class="request-head"><strong>${t(`provider.${l.provider}`)}</strong><span class="badge badge-${l.check_status === 'ok' ? 'ok' : l.check_status === 'broken' ? 'avoid' : 'muted'}">${t(`linkStatus.${l.check_status}`)}</span></div>
        <p class="small break">${l.target_url}</p>
        <p class="small muted">${l.last_checked_at ? `${fmtDateTime(l.last_checked_at)} · HTTP ${l.last_status_code ?? '-'}` : t('admin.neverChecked')}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-action="check" data-id="${l.id}">${t('admin.checkLink')}</button>
      </li>`)}</ul>` : html`<p class="muted small">${t('admin.noLinks')}</p>`}`);
  body.onclick = async (e) => {
    const b = e.target.closest('[data-action="check"]');
    if (!b) return;
    b.disabled = true;
    b.textContent = t('common.loading');
    try { await api.admin.checkLink(b.dataset.id); linksTab(body); } catch (err) { toast(errorText(err.code), 'error'); b.disabled = false; }
  };
}

export function mount(root, ctx) {
  show(root, ctx);
}
