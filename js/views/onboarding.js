import { t, SUPPORTED } from '../i18n.js';
import { html, icon, info, toast } from '../ui.js';
import { update, loadDemo } from '../store.js';
import { changeLanguage } from '../app.js';

export const hideNav = true;
export const title = (ctx) => (ctx.opts.profileOnly ? t('onboarding.profileTitle') : t('app.name'));
export const back = (ctx) => (ctx.opts.profileOnly ? '/settings' : null);

const SKIN_TYPES = ['dry', 'oily', 'combination', 'normal', 'unsure'];
const SENSITIVITY = ['not_sensitive', 'sensitive', 'very_sensitive', 'unsure'];
const CONCERNS = ['dryness', 'acne', 'pigmentation', 'wrinkles', 'redness', 'pores', 'barrier'];
const PREGNANCY = ['', 'none', 'pregnant', 'breastfeeding', 'prefer_not'];

function profileForm(p) {
  const radios = (name, values, current) => html`<div class="radio-group">${values.map((v) => html`
    <label class="radio-pill"><input type="radio" name="${name}" value="${v}" ${current === v ? 'checked' : ''}><span>${t(`profile.${name}.${v}`)}</span></label>`)}</div>`;
  return html`
    <form class="form" id="profile-form">
      <p class="notice notice-ok small">${icon('shield')}<span>${t('onboarding.privacy')}</span></p>
      <fieldset><legend>${t('profile.skinTypeLabel')}</legend>${radios('skinType', SKIN_TYPES, p.skinType)}</fieldset>
      <fieldset><legend>${t('profile.sensitivityLabel')} ${info(t('profile.sensitivityInfo'))}</legend>${radios('sensitivity', SENSITIVITY, p.sensitivity)}</fieldset>
      <fieldset><legend>${t('profile.concernsLabel')}</legend>
        <div class="radio-group">${CONCERNS.map((c) => html`<label class="radio-pill"><input type="checkbox" name="concerns" value="${c}" ${p.concerns?.includes(c) ? 'checked' : ''}><span>${t(`profile.concerns.${c}`)}</span></label>`)}</div>
      </fieldset>
      <label class="field"><span>${t('profile.pregnancyLabel')} ${info(t('profile.pregnancyInfo'))}</span>
        <select name="pregnancy">${PREGNANCY.map((v) => html`<option value="${v}" ${p.pregnancy === v ? 'selected' : ''}>${t(`profile.pregnancy.${v || 'unset'}`)}</option>`)}</select>
      </label>
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">${t('common.save')}</button>
        <button type="button" class="btn btn-ghost" data-action="clear-profile">${t('onboarding.clearProfile')}</button>
      </div>
    </form>`;
}

export function render(ctx) {
  const s = ctx.state;
  if (ctx.opts.profileOnly) return html`<p class="muted small">${t('onboarding.profileLead')}</p>${profileForm(s.profile)}`;

  const step = Number(ctx.query.step || 1);
  const dots = html`<ol class="step-dots" aria-label="${t('onboarding.progress', { n: step, total: 3 })}">${[1, 2, 3].map((n) => html`<li class="${n <= step ? 'on' : ''}" aria-current="${n === step ? 'step' : 'false'}"></li>`)}</ol>`;

  if (step === 1) {
    return html`${dots}
      <section class="hero onboarding-hero">
        <div class="logo-blob" aria-hidden="true">${icon('layers')}</div>
        <h2 class="hero-title">${t('onboarding.welcome')}</h2>
        <p class="muted">${t('onboarding.tagline')}</p>
      </section>
      <ul class="feature-list">
        <li>${icon('camera', 'accent')}<span>${t('onboarding.f1')}</span></li>
        <li>${icon('sun', 'accent')}<span>${t('onboarding.f2')}</span></li>
        <li>${icon('layers', 'accent')}<span>${t('onboarding.f3')}</span></li>
      </ul>
      <p class="notice notice-check small">${icon('alert')}<span>${t('scope.notice')}</span></p>
      <div class="field-row">
        <label class="field"><span>${t('settings.language')}</span>
          <select data-setting="lang">${SUPPORTED.map((l) => html`<option value="${l}" ${l === s.settings.lang ? 'selected' : ''}>${t(`lang.${l}`)}</option>`)}</select></label>
        <label class="field"><span>${t('settings.region')} ${info(t('settings.regionInfo'))}</span>
          <select data-setting="region">${ctx.config.regions.map((r) => html`<option value="${r}" ${r === s.settings.region ? 'selected' : ''}>${t(`region.${r}`)}</option>`)}</select></label>
      </div>
      <a class="btn btn-primary btn-block" href="#/onboarding?step=2">${t('common.next')}</a>`;
  }

  if (step === 2) {
    return html`${dots}
      <h2 class="section-title">${t('onboarding.profileTitle')}</h2>
      <p class="muted small">${t('onboarding.profileLead')}</p>
      ${profileForm(s.profile)}
      <a class="btn btn-ghost btn-block" href="#/onboarding?step=3">${t('onboarding.skip')}</a>`;
  }

  return html`${dots}
    <h2 class="section-title">${t('onboarding.startTitle')}</h2>
    <p class="muted small">${t('onboarding.startLead')}</p>
    <div class="choice-list">
      <button type="button" class="choice" data-action="start" data-with="add">${icon('plus', 'accent')}<span><strong>${t('onboarding.startAdd')}</strong><small>${t('onboarding.startAddDesc')}</small></span></button>
      <button type="button" class="choice" data-action="start" data-with="demo">${icon('box', 'accent')}<span><strong>${t('onboarding.startDemo')}</strong><small>${t('onboarding.startDemoDesc')}</small></span></button>
      <button type="button" class="choice" data-action="start" data-with="none">${icon('home', 'accent')}<span><strong>${t('onboarding.startEmpty')}</strong><small>${t('onboarding.startEmptyDesc')}</small></span></button>
    </div>`;
}

export function mount(root, ctx) {
  const main = root.querySelector('main');
  main.addEventListener('change', async (e) => {
    const key = e.target.dataset.setting;
    if (!key) return;
    update((s) => { s.settings[key] = e.target.value; }, { silent: true });
    await changeLanguage(ctx.state.settings.lang, ctx.state.settings.region);
  });
  const form = main.querySelector('#profile-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    update((s) => {
      s.profile = { skinType: fd.get('skinType') || '', sensitivity: fd.get('sensitivity') || '', pregnancy: fd.get('pregnancy') || '', concerns: fd.getAll('concerns') };
    }, { silent: true });
    toast(t('common.saved'));
    ctx.navigate(ctx.opts.profileOnly ? '/settings' : '/onboarding?step=3');
  });
  main.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'clear-profile') {
      update((s) => { s.profile = { skinType: '', sensitivity: '', pregnancy: '', concerns: [] }; }, { silent: true });
      toast(t('onboarding.profileCleared'));
      ctx.rerender();
    }
    if (el.dataset.action === 'start') {
      const mode = el.dataset.with;
      update((s) => { s.settings.onboarded = true; }, { silent: true });
      if (mode === 'demo') loadDemo(ctx.state.settings.region);
      ctx.navigate(mode === 'add' ? '/add' : '/');
    }
  });
}
