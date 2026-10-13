/** Seasonal decorations on the dashboard, picked by the date in Vietnam (Asia/Ho_Chi_Minh, UTC+7, no DST). */
export type Season = 'tet' | 'midautumn' | 'xmas' | 'newyear';

/** Lunar New Year (Tết) and Mid-Autumn (15th of the 8th lunar month), 2026–2030. */
const TET = ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'];
const MID_AUTUMN = ['2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12'];

const DAY = 86400000;
/** Days since the epoch for a calendar date (UTC-based, so no time zone drift). */
const dayNo = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
const keyNo = (k: string) => { const [y, m, d] = k.split('-').map(Number); return dayNo(y, m, d); };
const near = (n: number, keys: string[], span: number) => keys.some((k) => Math.abs(n - keyNo(k)) <= span);

/** The season to decorate for at this moment, or null. Pure: depends only on `now`. */
export function seasonFor(now: Date): Season | null {
  const vn = new Date(now.getTime() + 7 * 3600000);
  const y = vn.getUTCFullYear(), m = vn.getUTCMonth() + 1, d = vn.getUTCDate();
  const n = dayNo(y, m, d);
  if (near(n, TET, 7)) return 'tet';
  if (near(n, MID_AUTUMN, 5)) return 'midautumn';
  if ((m === 12 && d >= 30) || (m === 1 && d <= 2)) return 'newyear';
  if (m === 12 && d >= 18 && d <= 26) return 'xmas';
  return null;
}
