/** 로컬(사용자 기기 시간대) 기준 날짜 문자열 YYYY-MM-DD */
export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(iso, n) {
  const d = fromISODate(iso);
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

/** 지역 설정에 따른 주 시작 요일 (0=일, 1=월). Intl weekInfo 가 없으면 월요일 */
export function weekStartDay(locale) {
  try {
    const loc = new Intl.Locale(locale);
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch { /* ignore */ }
  return 1;
}

export function startOfWeek(iso, firstDay) {
  const d = fromISODate(iso);
  const diff = (d.getDay() - firstDay + 7) % 7;
  return addDays(iso, -diff);
}

export const weekdayOf = (iso) => fromISODate(iso).getDay();
