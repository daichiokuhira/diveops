/* ---------- 紋章（消防の十字に、潜水の旗と波）。このアプリのために描いたもの ----------
   上の腕は 119、左右は はしご と 炎、下の腕は DIVE。輪の文字は app/config.json の emblemTop / emblemBottom。
   line：線の色、paper：塗りの色（下地と同じにすると線だけに見える）、ring：輪の線の色、disc：輪の中の色 */
function emblem(o = {}) {
  const line = o.line || 'currentColor', paper = o.paper || 'var(--bg)', ring = o.ring || line, disc = o.disc || paper;
  const arm = 'M-72 -72 Q-74 -150 -156 -218 Q0 -170 156 -218 Q74 -150 72 -72 Z';
  const arms = [0, 90, 180, 270].map(r => `<path d="${arm}" transform="rotate(${r})"/>`).join('');
  const t = o.text === false ? null : { top: o.top || '', bottom: o.bottom || '' };
  const font = `font-family="'Arial Black','Helvetica Neue',Arial,sans-serif" font-weight="900" fill="${line}" stroke="none"`;
  const uid = 'em' + Math.random().toString(36).slice(2, 8);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<svg class="emblem" viewBox="-256 -256 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="${paper}" stroke="${line}" stroke-width="22" stroke-linejoin="round">${arms}</g>
  <g fill="none" stroke="${paper}" stroke-width="8" stroke-linejoin="round">${arms}</g>
  ${t ? `<text x="0" y="-150" text-anchor="middle" font-size="46" ${font}>119</text>
  <text x="0" y="186" text-anchor="middle" font-size="40" ${font}>DIVE</text>
  <g transform="translate(-166 0) rotate(-90)" fill="none" stroke="${line}" stroke-width="7" stroke-linecap="round"><path d="M-34 -14 H34 M-34 14 H34 M-22 -14 V14 M-4 -14 V14 M14 -14 V14 M32 -14 V14"/></g>
  <g transform="translate(166 0)" fill="${line}" stroke="none"><path d="M0 -40 C14 -22 30 -10 26 12 C23 30 10 38 0 38 C-10 38 -24 30 -26 12 C-28 -4 -16 -12 -10 -26 C-6 -14 -2 -8 4 -6 C6 -18 2 -28 0 -40 Z"/></g>` : ''}
  <circle r="118" fill="${disc}" stroke="${ring}" stroke-width="12"/>
  <circle r="80" fill="none" stroke="${line}" stroke-width="5"/>
  ${t ? `<defs><path id="${uid}a" d="M-92 0 A92 92 0 0 1 92 0"/><path id="${uid}b" d="M-108 0 A108 108 0 0 0 108 0"/></defs>
  <text font-size="22" letter-spacing="2" text-anchor="middle" ${font}><textPath href="#${uid}a" startOffset="50%">${esc(t.top)}</textPath></text>
  <text font-size="22" letter-spacing="2" text-anchor="middle" ${font}><textPath href="#${uid}b" startOffset="50%">${esc(t.bottom)}</textPath></text>
  <circle cx="-99" cy="0" r="5" fill="${line}" stroke="none"/><circle cx="99" cy="0" r="5" fill="${line}" stroke="none"/>` : ''}
  <g stroke="${line}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
    <rect x="-46" y="-44" width="92" height="62" fill="none"/>
    <path d="M-46 -44 L-46 -28 L30 18 L46 18 L46 2 L-30 -44 Z" fill="${line}" stroke-width="3"/>
    <path d="M-50 44 q12.5 -11 25 0 t25 0 t25 0 t25 0" fill="none"/>
  </g>
</svg>`;
}
