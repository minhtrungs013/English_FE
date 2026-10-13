/** App styles: a set of design tokens per style (see `.app.style-*` in styles.css). Classic = no class. */
export type AppStyle = 'classic' | 'warm' | 'ocean' | 'sakura' | 'midnight' | 'mono';

export const APP_STYLES: { id: AppStyle; name: string; desc: string }[] = [
  { id: 'classic', name: 'Classic', desc: 'The original Wordbook look, with your accent color.' },
  { id: 'warm', name: 'Warm café', desc: 'Cream paper, terracotta and soft rounded corners.' },
  { id: 'ocean', name: 'Ocean', desc: 'Cool blue-grey, deep teal-blue and crisp edges.' },
  { id: 'sakura', name: 'Sakura', desc: 'Light pink, rose and plum, gently rounded.' },
  { id: 'midnight', name: 'Midnight', desc: 'Deep navy and violet glow. Best in dark mode.' },
  { id: 'mono', name: 'Mono', desc: 'Black, white and greys. Flat and minimal.' }
];

export const isAppStyle = (v: unknown): v is AppStyle => APP_STYLES.some((s) => s.id === v);

/** Google Fonts each style needs (classic uses Plus Jakarta Sans, loaded in index.html). */
const FONTS: Partial<Record<AppStyle, string>> = {
  warm: 'family=Nunito:wght@400;600;700;800',
  ocean: 'family=Inter:wght@400;500;600;700;800',
  sakura: 'family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=Nunito:wght@400;600;700;800',
  midnight: 'family=Space+Grotesk:wght@500;600;700',
  mono: 'family=IBM+Plex+Sans:wght@400;500;600;700'
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
