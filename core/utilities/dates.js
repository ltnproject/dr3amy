const p = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export const ymdhm = d => `${ymd(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
export const parseLocal = s => {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : new Date(NaN);
};
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const startOfWeek = (d, ws = 0) => addDays(startOfDay(d), -((d.getDay() - ws + 7) % 7));
export const sameDay = (a, b) => ymd(a) === ymd(b);
