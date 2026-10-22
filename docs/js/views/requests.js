import { t, fmtDateTime, errorText } from '../i18n.js';
import { html, htmlString, icon, info, spinner, errorState, toast, fileToDataUrl, emptyState } from '../ui.js';
import { api } from '../api.js';

export const title = () => t('requests.title');
export const back = () => '/add';

const STATUS_CLASS = { received: 'muted', reviewing: 'accent', needs_info: 'check', approved: 'ok', rejected: 'avoid' };

export function render(ctx) {
  const regions = ctx.config.regions;
  return html`
    <section class="card">
      <h3 class="card-title">${t('requests.formTitle')} ${info(t('requests.formInfo'))}</h3>
      <p class="muted small">${t('requests.lead')}</p>
      <form class="form" id="request-form" novalidate>
        <label class="field"><span>${t('requests.brand')} <em class="req">*</em></span><input name="brand" required maxlength="120" value="${ctx.query.brand || ''}"></label>
        <label class="field"><span>${t('requests.name')} <em class="req">*</em></span><input name="name" required maxlength="200" value="${ctx.query.name || ''}"></label>
        <label class="field"><span>${t('form.volume')}</span><input name="volume" maxlength="40" placeholder="50 mL"></label>
        <label class="field"><span>${t('form.region')}</span>
          <select name="region">${regions.map((r) => html`<option value="${r}" ${r === ctx.state.settings.region ? 'selected' : ''}>${t(`region.${r}`)}</option>`)}</select></label>
        <label class="field"><span>${t('requests.photo')} <small class="muted">(${t('common.optional')})</small></span><input name="photo" type="file" accept="image/*"></label>
        <label class="field"><span>${t('requests.link')} <small class="muted">(${t('common.optional')})</small> ${info(t('requests.linkInfo'))}</span><input name="infoUrl" type="url" inputmode="url" placeholder="https://"></label>
        <label class="field"><span>${t('requests.note')} <small class="muted">(${t('common.optional')})</small></span><textarea name="note" rows="3" maxlength="2000" placeholder="${t('requests.notePlaceholder')}"></textarea></label>
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">${t('requests.submit')}</button>
      </form>
    </section>
    <section class="card">
      <h3 class="card-title">${t('requests.mine')}</h3>
      <div id="my-requests" aria-live="polite">${spinner()}</div>
    </section>`;
}

function requestItem(r) {
  return html`
    <li class="request-item">
      <div class="request-head">
        <strong>${r.brand} ${r.name}</strong>
        <span class="badge badge-${STATUS_CLASS[r.status]}">${t(`requestStatus.${r.status}`)}</span>
      </div>
      <p class="small muted">${t('requests.submittedAt', { date: fmtDateTime(r.createdAt) })}${r.updatedAt !== r.createdAt ? html` · ${t('requests.updatedAt', { date: fmtDateTime(r.updatedAt) })}` : ''}</p>
      <p class="small">${t(`requestStatus.${r.status}Desc`)}</p>
      ${r.adminNote ? html`<p class="notice notice-check small"><strong>${t('requests.adminNote')}:</strong> ${r.adminNote}</p>` : ''}
      ${r.status === 'approved' ? html`<a class="btn btn-ghost btn-sm" href="#/add?mode=search">${icon('search')} ${t('requests.findNow')}</a>` : ''}
      ${r.status === 'needs_info' ? html`
        <form class="form reply-form" data-id="${r.id}">
          <label class="field"><span>${t('requests.reply')}</span><textarea name="reply" rows="2" maxlength="2000" required></textarea></label>
          <label class="field"><span>${t('requests.link')}</span><input name="infoUrl" type="url" placeholder="https://"></label>
          <label class="field"><span>${t('requests.photo')}</span><input name="photo" type="file" accept="image/*"></label>
          <button class="btn btn-primary btn-sm" type="submit">${t('requests.sendReply')}</button>
        </form>` : ''}
    </li>`;
}

async function loadMine(box) {
  box.innerHTML = htmlString(spinner());
  try {
    const { items } = await api.myRequests();
    box.innerHTML = htmlString(items.length
      ? html`<ul class="request-list">${items.map(requestItem)}</ul>`
      : emptyState({ iconName: 'inbox', title: t('requests.none') }));
  } catch (err) {
    box.innerHTML = htmlString(errorState(errorText(err.code), 'reload'));
  }
}

export function mount(root) {
  const form = root.querySelector('#request-form');
  const box = root.querySelector('#my-requests');
  loadMine(box);
  box.addEventListener('click', (e) => { if (e.target.closest('[data-action="reload"]')) loadMine(box); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const brand = form.brand.value.trim();
    const name = form.elements.name.value.trim();
    if (!brand || !name) {
      err.textContent = t('requests.required');
      err.hidden = false;
      return;
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    err.hidden = true;
    try {
      const photoFile = form.photo.files?.[0];
      const photo = photoFile ? await fileToDataUrl(photoFile, 1400, 0.8) : undefined;
      await api.createRequest({ brand, name, volume: form.volume.value, region: form.region.value, infoUrl: form.infoUrl.value.trim(), note: form.note.value, photo });
      toast(t('requests.submitted'));
      form.reset();
      loadMine(box);
    } catch (ex) {
      err.textContent = errorText(ex.code || ex.message);
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  box.addEventListener('submit', async (e) => {
    const f = e.target.closest('.reply-form');
    if (!f) return;
    e.preventDefault();
    try {
      const photoFile = f.photo.files?.[0];
      const photo = photoFile ? await fileToDataUrl(photoFile, 1400, 0.8) : undefined;
      await api.replyRequest(f.dataset.id, { reply: f.reply.value, infoUrl: f.infoUrl.value.trim(), photo });
      toast(t('requests.replied'));
      loadMine(box);
    } catch (ex) {
      toast(errorText(ex.code || ex.message), 'error');
    }
  });
}
