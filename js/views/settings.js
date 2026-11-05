import { t, SUPPORTED, fmtDateTime } from '../i18n.js';
import { html, icon, info, toast, confirmDialog } from '../ui.js';
import { update, exportData, importData, resetAll } from '../store.js';
import { changeLanguage } from '../app.js';
import { status as sync, syncNow, sendLoginLink, signOut } from '../sync.js';

export const title = () => t('settings.title');

export function render(ctx) {
  const s = ctx.state.settings;
  const aff = ctx.config.affiliate || {};
  const toggle = (name, checked, label, tip) => html`
    <label class="switch-row"><span>${label} ${tip ? info(tip) : ''}</span>
      <input type="checkbox" role="switch" data-setting="${name}" ${checked ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>`;

  return html`
    <section class="card sync-card">
      <h3 class="card-title">${icon('layers')} ${t('sync.title')} ${info(t('sync.info'))}</h3>
      ${!sync.ready && !sync.error ? html`<p class="small muted">${t('common.loading')}</p>`
        : sync.user ? html`
          <p class="small">${t('sync.signedIn', { email: sync.user.email })}</p>
          <p class="small muted">${sync.busy ? t('sync.syncing') : sync.lastSync ? t('sync.last', { time: fmtDateTime(sync.lastSync) }) : ''}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-primary btn-sm" data-action="sync-now" ${sync.busy ? 'disabled' : ''}>${t('sync.now')}</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="sign-out">${t('sync.signOut')}</button>
          </div>`
        : html`
          <p class="small muted">${t('sync.lead')}</p>
          <form class="field-row" id="sync-form">
            <label class="field"><span class="sr-only">${t('sync.email')}</span><input type="email" name="email" required autocomplete="email" placeholder="${t('sync.email')}"></label>
            <button type="submit" class="btn btn-primary">${t('sync.sendLink')}</button>
          </form>`}
      ${sync.error ? html`<p class="notice notice-avoid small" role="alert">${t('sync.error')} (${sync.error})</p>` : ''}
    </section>

    <section class="card">
      <h3 class="card-title">${t('settings.language')}</h3>
      <div class="field-row">
        <label class="field"><span>${t('settings.language')}</span>
          <select data-setting="lang">${SUPPORTED.map((l) => html`<option value="${l}" ${l === s.lang ? 'selected' : ''}>${t(`lang.${l}`)}</option>`)}</select></label>
        <label class="field"><span>${t('settings.region')} ${info(t('settings.regionInfo'))}</span>
          <select data-setting="region">${ctx.config.regions.map((r) => html`<option value="${r}" ${r === s.region ? 'selected' : ''}>${t(`region.${r}`)}</option>`)}</select></label>
      </div>
      <p class="small muted">${t('settings.localeNote', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p>
    </section>

    <section class="card">
      <h3 class="card-title">${t('settings.profile')}</h3>
      <p class="small muted">${t('settings.profileLead')}</p>
      <a class="btn btn-ghost btn-sm" href="#/profile">${icon('edit')} ${t('settings.editProfile')}</a>
    </section>

    <section class="card">
      <h3 class="card-title">${t('settings.notifications')}</h3>
      ${toggle('notifications.enabled', s.notifications.enabled, t('settings.notifyEnable'), t('settings.notifyInfo'))}
      <div class="field-row">
        <label class="field"><span>${t('routine.am')}</span><input type="time" data-setting="notifications.am" value="${s.notifications.am}"></label>
        <label class="field"><span>${t('routine.pm')}</span><input type="time" data-setting="notifications.pm" value="${s.notifications.pm}"></label>
      </div>
      ${toggle('duplicateAlerts', s.duplicateAlerts, t('settings.dupAlerts'), t('settings.dupAlertsInfo'))}
      ${toggle('shareContributions', s.shareContributions, t('settings.share'), t('settings.shareInfo'))}
    </section>

    <section class="card">
      <h3 class="card-title">${t('settings.purchase')} ${info(t('settings.purchaseInfo'))}</h3>
      ${toggle('showPurchaseLinks', s.showPurchaseLinks, t('settings.showPurchase'))}
      <ul class="aff-status">
        ${Object.entries(aff).filter(([, v]) => v.provider).map(([region, v]) => html`
          <li><span>${t(`region.${region}`)} · ${t(`provider.${v.provider}`)}</span>
            <span class="badge badge-${v.enabled ? 'ok' : 'muted'}">${v.enabled ? t('settings.affOn') : t('settings.affOff')}</span></li>`)}
      </ul>
      <p class="small muted">${t('settings.affNote')}</p>
    </section>

    <section class="card">
      <h3 class="card-title">${t('settings.data')} ${info(t('settings.dataInfo'))}</h3>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" data-action="export">${t('settings.export')}</button>
        <label class="btn btn-ghost btn-sm">${t('settings.import')}<input type="file" accept="application/json" class="sr-only" data-action="import"></label>
        <button type="button" class="btn btn-danger-ghost btn-sm" data-action="reset">${t('settings.reset')}</button>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">${t('settings.more')}</h3>
      <ul class="link-list">
        <li><a href="#/requests">${t('requests.title')} ${icon('chevron')}</a></li>
        <li><a href="#/admin">${t('admin.title')} ${icon('chevron')}</a></li>
      </ul>
      <p class="small muted">${t('scope.notice')}</p>
      <p class="small muted">${t('home.disclaimer')}</p>
    </section>`;
}

export function mount(root, ctx) {
  const main = root.querySelector('main');
  main.addEventListener('change', async (e) => {
    const el = e.target;
    const key = el.dataset.setting;
    if (key) {
      const value = el.type === 'checkbox' ? el.checked : el.value;
      if (key === 'notifications.enabled' && value && 'Notification' in window && Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { el.checked = false; toast(t('settings.notifyDenied'), 'error'); return; }
      }
      update((s) => {
        const [a, b] = key.split('.');
        if (b) s.settings[a][b] = value; else s.settings[a] = value;
      }, { silent: true });
      if (key === 'lang' || key === 'region') await changeLanguage(ctx.state.settings.lang, ctx.state.settings.region);
      else toast(t('common.saved'));
    }
    if (el.dataset.action === 'import' && el.files?.[0]) {
      try {
        importData(await el.files[0].text());
        await changeLanguage(ctx.state.settings.lang, ctx.state.settings.region);
        toast(t('settings.imported'));
      } catch {
        toast(t('settings.importFailed'), 'error');
      }
    }
  });
  main.querySelector('#sync-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await sendLoginLink(e.target.email.value.trim());
      toast(t('sync.linkSent'));
    } catch (err) {
      toast(`${t('sync.error')} (${err.message})`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  main.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'export') {
      const blob = new Blob([exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `skinstack-backup-${ctx.today}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (el.dataset.action === 'sync-now') syncNow().catch(() => {});
    if (el.dataset.action === 'sign-out') { await signOut(); toast(t('sync.signedOut')); }
    if (el.dataset.action === 'reset') {
      if (await confirmDialog({ title: t('settings.resetTitle'), message: t('settings.resetText'), confirmLabel: t('settings.reset'), danger: true })) {
        resetAll();
        ctx.navigate('/onboarding');
      }
    }
  });
}
