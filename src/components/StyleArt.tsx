import type { ReactElement } from 'react';
import type { AppStyle } from '../lib/appStyle';

/**
 * The greeting banner's illustration: one small scene per app style, drawn from simple shapes and the style's
 * CSS tokens (so it follows light/dark). Decorative only.
 */
const P = 'var(--primary)', S = 'var(--surface)', SOFT = 'var(--primary-soft)', BAR = 'var(--bar)', INK = 'var(--primary-ink)',
  B = 'var(--border)', W = 'var(--warning)', O = 'var(--orange)', M = 'var(--muted)', F = 'var(--faint)';

function Classic() {
  return (
    <>
      <path d="M40 120 Q90 100 120 118 Q150 100 200 120 L200 150 Q150 132 120 150 Q90 132 40 150Z" style={{ fill: S, stroke: B }} strokeWidth="2" />
      <path d="M120 118 L120 150" style={{ stroke: B }} strokeWidth="2" />
      {[0, 1, 2].map((i) => <path key={i} d={`M54 ${126 + i * 7} Q85 ${114 + i * 7} 110 ${125 + i * 7}`} style={{ stroke: BAR }} strokeWidth="2" fill="none" />)}
      {[0, 1, 2].map((i) => <path key={'r' + i} d={`M130 ${125 + i * 7} Q155 ${114 + i * 7} 186 ${126 + i * 7}`} style={{ stroke: BAR }} strokeWidth="2" fill="none" />)}
      <g transform="rotate(-35 170 80)"><rect x="150" y="74" width="56" height="10" rx="2" style={{ fill: W }} /><path d="M150 74 L138 79 L150 84Z" style={{ fill: INK }} /></g>
      <text x="62" y="70" fontSize="30" fontWeight="800" style={{ fill: P }}>A</text>
      <text x="104" y="48" fontSize="22" fontWeight="800" style={{ fill: INK }} opacity=".8">b</text>
      <text x="138" y="62" fontSize="18" fontWeight="800" style={{ fill: O }}>c</text>
    </>
  );
}

function Warm() {
  const leaf = (x: number, y: number, r: number, c: string) => (
    <path transform={`translate(${x} ${y}) rotate(${r})`} d="M0 -12 L4 -4 L12 -6 L8 2 L12 8 L3 6 L0 12 L-3 6 L-12 8 L-8 2 L-12 -6 L-4 -4Z" style={{ fill: c }} />
  );
  return (
    <>
      <rect x="120" y="108" width="80" height="50" rx="6" style={{ fill: S, stroke: B }} strokeWidth="2" transform="rotate(-8 160 133)" />
      <path d="M134 120 L186 112 M135 130 L180 123 M136 140 L172 135" style={{ stroke: BAR }} strokeWidth="2" transform="rotate(-8 160 133)" />
      <path d="M48 96 H118 V132 Q118 156 94 156 H72 Q48 156 48 132Z" style={{ fill: P }} />
      <path d="M118 104 Q138 104 136 120 Q134 134 118 132" style={{ stroke: P }} strokeWidth="7" fill="none" />
      <ellipse cx="83" cy="160" rx="46" ry="6" style={{ fill: BAR }} />
      {[66, 84, 102].map((x) => <path key={x} d={`M${x} 86 Q${x - 7} 74 ${x} 64 Q${x + 7} 54 ${x} 44`} style={{ stroke: F }} strokeWidth="3" fill="none" strokeLinecap="round" />)}
      {leaf(170, 52, 20, O)}{leaf(200, 84, -25, W)}{leaf(30, 60, 40, INK)}
    </>
  );
}

function Ocean() {
  return (
    <>
      <circle cx="176" cy="50" r="22" style={{ fill: W }} opacity=".85" />
      <path d="M86 112 L150 112 L138 128 L98 128Z" style={{ fill: S, stroke: B }} strokeWidth="2" />
      <path d="M118 112 L118 66 L146 104Z" style={{ fill: SOFT, stroke: P }} strokeWidth="2" />
      <path d="M10 134 Q35 120 60 134 T110 134 T160 134 T210 134 V170 H10Z" style={{ fill: P }} opacity=".85" />
      <path d="M10 150 Q35 138 60 150 T110 150 T160 150 T210 150 V170 H10Z" style={{ fill: INK }} />
      <path d="M30 96 q6 -6 12 0 q6 -6 12 0" style={{ stroke: M }} strokeWidth="2" fill="none" />
    </>
  );
}

function Sakura() {
  const flower = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="0" cy="-8" rx="6" ry="9" style={{ fill: BAR, stroke: P }} strokeWidth="1" transform={`rotate(${r})`} />)}
      <circle r="3" style={{ fill: INK }} />
    </g>
  );
  return (
    <>
      <path d="M10 40 Q80 60 120 90 Q150 112 210 120" style={{ stroke: M }} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M90 70 Q110 40 140 36 M150 106 Q170 140 196 150" style={{ stroke: M }} strokeWidth="4" fill="none" strokeLinecap="round" />
      {flower(62, 52, 1.2)}{flower(138, 38, 1)}{flower(124, 92, 1.3)}{flower(192, 148, 1)}{flower(186, 112, .9)}
      {[[40, 120, 20], [90, 146, -30], [160, 70, 50]].map(([x, y, r]) => <ellipse key={x} cx={x} cy={y} rx="5" ry="8" style={{ fill: BAR }} transform={`rotate(${r} ${x} ${y})`} />)}
    </>
  );
}

function Midnight() {
  return (
    <>
      <path d="M70 30 A32 32 0 1 0 104 82 A26 26 0 1 1 70 30Z" style={{ fill: W }} />
      {[[140, 30], [184, 52], [30, 110], [120, 64], [200, 20]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 6} L${x + 2} ${y - 2} L${x + 6} ${y} L${x + 2} ${y + 2} L${x} ${y + 6} L${x - 2} ${y + 2} L${x - 6} ${y} L${x - 2} ${y - 2}Z`} style={{ fill: INK }} />
      ))}
      <rect x="40" y="150" width="170" height="8" rx="3" style={{ fill: B }} />
      <path d="M176 150 L176 116 L150 90" style={{ stroke: M }} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M132 72 L170 88 L156 104 Z" style={{ fill: P }} />
      <path d="M150 100 L118 150 L196 150Z" style={{ fill: SOFT }} opacity=".7" />
      <rect x="160" y="146" width="34" height="6" rx="3" style={{ fill: M }} />
    </>
  );
}

function Mono() {
  return (
    <>
      <rect x="60" y="138" width="110" height="18" rx="2" style={{ fill: P }} />
      <rect x="70" y="118" width="96" height="18" rx="2" style={{ fill: S, stroke: P }} strokeWidth="2" />
      <rect x="64" y="98" width="88" height="18" rx="2" style={{ fill: M }} />
      <circle cx="180" cy="60" r="20" fill="none" style={{ stroke: P }} strokeWidth="3" />
      <rect x="30" y="40" width="34" height="34" style={{ fill: SOFT, stroke: M }} strokeWidth="2" transform="rotate(15 47 57)" />
      <path d="M110 30 L130 66 L90 66Z" style={{ fill: F }} />
    </>
  );
}

const SCENES: Record<AppStyle, () => ReactElement> = { classic: Classic, warm: Warm, ocean: Ocean, sakura: Sakura, midnight: Midnight, mono: Mono };

export function StyleArt({ style }: { style: AppStyle }) {
  const Scene = SCENES[style] ?? Classic;
  return (
    <svg className="greet-art" viewBox="0 0 220 170" aria-hidden="true" focusable="false">
      <Scene />
    </svg>
  );
}
