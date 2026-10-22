import { fromISODate } from './domain/dates.js';

/*
 * 번역 리소스: /i18n/{lang}.json
 * - 앱 이름·문구는 JSON 만 수정하면 바뀜 (app.name)
 * - 새 언어: SUPPORTED 에 추가하고 같은 키 구조의 JSON 을 만들면 됨
 */
export const SUPPORTED = ['ko', 'en'];
const FALLBACK = 'en';

let dict = {};
let fallbackDict = {};
let lang = 'ko';
let locale = 'ko-KR';

export function detectLanguage() {
  const nav = (navigator.languages || [navigator.language || 'en']).map((l) => l.slice(0, 2));
  return nav.find((l) => SUPPORTED.includes(l)) || FALLBACK;
}

async function load(l) {
  const res = await fetch(`i18n/${l}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`i18n_${l}`);
  return res.json();
}

export async function setLanguage(l, region) {
  lang = SUPPORTED.includes(l) ? l : FALLBACK;
  const [d, f] = await Promise.all([load(lang), lang === FALLBACK ? null : load(FALLBACK)]);
  dict = d;
  fallbackDict = f || d;
  // 날짜/숫자 형식은 언어 + 지역 조합 (예: en-KR, ko-US)
  locale = region && region !== 'GLOBAL' ? `${lang}-${region}` : lang === 'ko' ? 'ko-KR' : 'en-US';
  try { new Intl.DateTimeFormat(locale); } catch { locale = lang; }
  document.documentElement.lang = lang;
  document.title = t('app.name');
}

export const getLang = () => lang;
export const getLocale = () => locale;

const lookup = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** t('a.b', {n: 1}) — {n} 치환. 키가 없으면 영어 → 키 그대로 */
export function t(key, params = {}) {
  let s = lookup(dict, key) ?? lookup(fallbackDict, key);
  if (typeof s !== 'string') return key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
}
export const has = (key) => typeof (lookup(dict, key) ?? lookup(fallbackDict, key)) === 'string';
/** API/처리 오류 코드 → 사용자 문구 */
export const errorText = (code) => (has(`error.${code}`) ? t(`error.${code}`) : t('error.server_error'));

export function fmtDate(iso, opts = { month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale, opts).format(fromISODate(iso.slice(0, 10)));
}
export function fmtDateTime(isoTs) {
  if (!isoTs) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoTs));
}
export const fmtWeekday = (iso, style = 'short') => fmtDate(iso, { weekday: style });
export const fmtNumber = (n) => new Intl.NumberFormat(locale).format(n);

/** 요일 이름 (0=일) */
export function weekdayName(dow, style = 'short') {
  const base = new Date(2024, 0, 7 + dow); // 2024-01-07 은 일요일
  return new Intl.DateTimeFormat(locale, { weekday: style }).format(base);
}
