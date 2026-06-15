// Generador del set de íconos de FinanceApp (la "F" isométrica en capas).
// Rasteriza SVG -> PNG con @resvg/resvg-js. Ejecutar: node scripts/generate-icon.mjs
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

// ── Paleta de marca ──────────────────────────────────────────────────────────
const C = {
  bgFrom: '#06352F', // teal profundo (esquina sup-izq)
  bgTo:   '#0C5A4E', // teal/esmeralda (esquina inf-der)
  fFrom:  '#34D399', // esmeralda
  fTo:    '#22D3EE', // cian
  layer:  '#7FF3E4', // capa translúcida (cian claro)
};

// Geometría de la "F" (lienzo 1024). Front centrado en (512,512).
const F_W = 360, F_H = 460;
const left = 512 - F_W / 2;       // 332
const top = 512 - F_H / 2;        // 282
const SPINE_W = 104, ARM_H = 104, MID_W = 270, MID_H = 96;
const dx = 34, dy = 40;           // desplazamiento de la capa de profundidad

// 3 barras de la F como rects redondeados
function fRects(fill, opacity = 1) {
  const o = opacity === 1 ? '' : ` fill-opacity="${opacity}"`;
  return `
    <rect x="${left}" y="${top}" width="${SPINE_W}" height="${F_H}" rx="26" fill="${fill}"${o}/>
    <rect x="${left}" y="${top}" width="${F_W}" height="${ARM_H}" rx="26" fill="${fill}"${o}/>
    <rect x="${left}" y="${top + 170}" width="${MID_W}" height="${MID_H}" rx="24" fill="${fill}"${o}/>`;
}

// Grupo con capa de profundidad (cian translúcido) + cara frontal (gradiente)
function layeredF() {
  return `<g>
    <g transform="translate(${dx},${dy})">${fRects(C.layer, 0.5)}</g>
    <g>${fRects('url(#gF)')}</g>
  </g>`;
}

const defs = `<defs>
    <linearGradient id="gBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bgFrom}"/><stop offset="1" stop-color="${C.bgTo}"/>
    </linearGradient>
    <linearGradient id="gF" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.fFrom}"/><stop offset="1" stop-color="${C.fTo}"/>
    </linearGradient>
  </defs>`;

// Centro del bbox del grupo en capas (front + back) para centrar al escalar
const bboxCx = (left + (left + Math.max(F_W, F_W + dx))) / 2; // ≈ 529
const bboxCy = (top + (top + F_H + dy)) / 2;                  // ≈ 532
const fit = (s, cx = bboxCx, cy = bboxCy) => `translate(512,512) scale(${s}) translate(${-cx},${-cy})`;

// ── Composiciones ────────────────────────────────────────────────────────────
const svg = {
  // iOS / fallback: fondo + F grande
  icon: `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${defs}
    <rect width="1024" height="1024" fill="url(#gBg)"/>
    <g transform="${fit(0.98)}">${layeredF()}</g></svg>`,

  // Android adaptive — fondo (sin F)
  background: `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${defs}
    <rect width="1024" height="1024" fill="url(#gBg)"/></svg>`,

  // Android adaptive — primer plano (F en zona segura, transparente)
  foreground: `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${defs}
    <g transform="${fit(0.82)}">${layeredF()}</g></svg>`,

  // Android 13+ themed — silueta monocromática (solo cara frontal, blanca)
  monochrome: `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <g transform="${fit(0.82, 512, 512)}">${fRects('#FFFFFF')}</g></svg>`,

  // Splash — F en gradiente, transparente, con margen
  splash: `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${defs}
    <g transform="${fit(0.7)}">${layeredF()}</g></svg>`,

  // Favicon web — cara frontal en gradiente
  favicon: `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${defs}
    <g transform="${fit(0.82, 512, 512)}">${fRects('url(#gF)')}</g></svg>`,
};

function render(svgStr, file, size = 1024) {
  const png = new Resvg(svgStr, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(OUT, file), png);
  console.log('✓', file, `(${size}px)`);
}

render(svg.icon, 'icon.png');
render(svg.background, 'android-icon-background.png');
render(svg.foreground, 'android-icon-foreground.png');
render(svg.monochrome, 'android-icon-monochrome.png');
render(svg.splash, 'splash-icon.png');
render(svg.favicon, 'favicon.png', 64);
console.log('Listo. Íconos generados en assets/images/');
