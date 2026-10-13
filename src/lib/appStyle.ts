/** App styles: a set of design tokens per style (see `.app.style-*` in styles.css). Classic = no class. */
export type AppStyle = 'classic' | 'warm' | 'ocean' | 'sakura' | 'midnight' | 'mono' | 'aurora' | 'royal';

export const APP_STYLES: { id: AppStyle; name: string; desc: string }[] = [
  { id: 'classic', name: 'Classic', desc: 'The original Wordbook look, with your accent color.' },
  { id: 'warm', name: 'Warm café', desc: 'Cream paper, terracotta and soft rounded corners.' },
  { id: 'ocean', name: 'Ocean', desc: 'Cool blue-grey, deep teal-blue and crisp edges.' },
  { id: 'sakura', name: 'Sakura', desc: 'Light pink, rose and plum, gently rounded.' },
  { id: 'midnight', name: 'Midnight', desc: 'Deep navy and violet glow. Best in dark mode.' },
  { id: 'mono', name: 'Mono', desc: 'Black, white and greys. Flat and minimal.' },
  { id: 'aurora', name: 'Aurora', desc: 'Northern lights: icy teal, mint and violet glow.' },
  { id: 'royal', name: 'Royal', desc: 'Deep navy and gold with elegant serif headings.' }
];

/** Bonus styles unlock at a review streak (same rule as the API's STYLE_UNLOCKS). */
export const STYLE_UNLOCKS: Partial<Record<AppStyle, number>> = { aurora: 7, royal: 30 };

/** Streak to judge unlocks by: older accounts have bestStreak 0 until their next review. */
export const unlockStreak = (p: { streak: number; bestStreak?: number }) => Math.max(p.bestStreak ?? 0, p.streak ?? 0);

export const isUnlocked = (style: AppStyle, best: number) => best >= (STYLE_UNLOCKS[style] ?? 0);

/** Styles whose navigation icons are drawn duotone (a tinted blob behind the stroke glyph). */
const DUO: AppStyle[] = ['warm', 'sakura', 'aurora', 'royal', 'midnight'];
export const isDuoStyle = (style: AppStyle) => DUO.includes(style);

const UNLOCK_KEY = 'wb.unlocks.';
/** Unlocks already celebrated for this user on this device. */
export function shownUnlocks(userId: string): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem(UNLOCK_KEY + userId) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
export function markUnlocksShown(userId: string, ids: string[]) {
  try { localStorage.setItem(UNLOCK_KEY + userId, JSON.stringify(ids)); } catch { /* storage blocked */ }
}

const SEASON_KEY = 'wb.seasonal';
/** Seasonal decorations on the dashboard (per device, default on). */
export function seasonalOn(): boolean {
  try { return localStorage.getItem(SEASON_KEY) !== '0'; } catch { return true; }
}
export function setSeasonalOn(on: boolean) {
  try { localStorage.setItem(SEASON_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}

export const isAppStyle = (v: unknown): v is AppStyle => APP_STYLES.some((s) => s.id === v);

/** Google Fonts each style needs (classic uses Plus Jakarta Sans, loaded in index.html). */
const FONTS: Partial<Record<AppStyle, string>> = {
  warm: 'family=Nunito:wght@400;600;700;800',
  ocean: 'family=Inter:wght@400;500;600;700;800',
  sakura: 'family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=Nunito:wght@400;600;700;800',
  midnight: 'family=Space+Grotesk:wght@500;600;700',
  mono: 'family=IBM+Plex+Sans:wght@400;500;600;700',
  aurora: 'family=Outfit:wght@400;500;600;700;800',
  royal: 'family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600;700'
};

/** Injects the style's Google Font stylesheet once, only when that style is used. */
export function loadStyleFont(style: AppStyle) {
  const q = FONTS[style];
  if (!q || typeof document === 'undefined') return;
  const id = 'font-style-' + style;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + q + '&display=swap';
  document.head.appendChild(link);
}

const KEY = 'wb.style';

/** The last style used on this device, so the first paint matches before settings load. */
export function cachedStyle(): AppStyle {
  try { const v = localStorage.getItem(KEY); return isAppStyle(v) ? v : 'classic'; } catch { return 'classic'; }
}

export function cacheStyle(style: AppStyle) {
  try { localStorage.setItem(KEY, style); } catch { /* storage blocked: no early paint next time */ }
}

/** Class for the `.app` element: classic adds none. */
export const styleClass = (style: AppStyle) => (style === 'classic' ? '' : ' style-' + style);
