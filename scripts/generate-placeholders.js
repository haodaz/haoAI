#!/usr/bin/env node
/**
 * Generate branded SVG placeholder images for the Website Builder.
 * Run once: node scripts/generate-placeholders.js
 */
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'images', 'placeholders');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const BRAND = {
  bg: '#f0f4f0',
  accent: '#0E3018',
  gold: '#c9a84c',
  text: '#6b7280',
  lightBg: '#f8faf8',
};

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const placeholders = [
  {
    name: 'banner_hero',
    w: 1200, h: 500,
    label: 'Hero Banner',
    hint: 'Upload a wide banner image',
    icon: `<rect x="-20" y="-14" width="40" height="28" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="2" opacity="0.4"/>
           <path d="M-14,-6 L-6,2 L0,-4 L14,6" fill="none" stroke="${BRAND.gold}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
           <circle cx="8" cy="-6" r="4" fill="${BRAND.gold}" opacity="0.4"/>`,
  },
  {
    name: 'banner_slim',
    w: 1200, h: 300,
    label: 'Slim Banner',
    hint: 'Upload a wide header image',
    icon: `<rect x="-20" y="-10" width="40" height="20" rx="3" fill="none" stroke="${BRAND.accent}" stroke-width="2" opacity="0.4"/>
           <path d="M-14,-2 L-6,6 L0,0 L14,6" fill="none" stroke="${BRAND.gold}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>`,
  },
  {
    name: 'card_square',
    w: 400, h: 400,
    label: 'Square Image',
    hint: 'Team photo or feature icon',
    icon: `<circle cx="0" cy="-4" r="10" fill="none" stroke="${BRAND.accent}" stroke-width="2" opacity="0.4"/>
           <path d="M-8,8 Q0,2 8,8" fill="none" stroke="${BRAND.accent}" stroke-width="2" opacity="0.3"/>`,
  },
  {
    name: 'card_landscape',
    w: 600, h: 400,
    label: 'Landscape Image',
    hint: 'Side content or feature photo',
    icon: `<rect x="-18" y="-12" width="36" height="24" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="2" opacity="0.4"/>
           <path d="M-12,-4 L-4,4 L2,-2 L12,4" fill="none" stroke="${BRAND.gold}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
           <circle cx="6" cy="-4" r="3" fill="${BRAND.gold}" opacity="0.4"/>`,
  },
  {
    name: 'card_portrait',
    w: 400, h: 600,
    label: 'Portrait Image',
    hint: 'Tall sidebar or profile photo',
    icon: `<rect x="-14" y="-18" width="28" height="36" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="2" opacity="0.4"/>
           <circle cx="0" cy="-6" r="8" fill="none" stroke="${BRAND.gold}" stroke-width="1.5" opacity="0.4"/>
           <path d="M-10,10 Q0,4 10,10" fill="none" stroke="${BRAND.accent}" stroke-width="1.5" opacity="0.3"/>`,
  },
  {
    name: 'icon_circle',
    w: 120, h: 120,
    label: 'Icon',
    hint: 'Feature icon',
    icon: `<circle cx="0" cy="0" r="18" fill="${BRAND.accent}" opacity="0.1"/>
           <path d="M-6,-6 L6,-6 L6,6 L-6,6 Z" fill="none" stroke="${BRAND.gold}" stroke-width="2" opacity="0.6"/>`,
  },
  {
    name: 'logo_slot',
    w: 300, h: 100,
    label: 'Logo',
    hint: 'Brand logo',
    icon: `<rect x="-22" y="-10" width="44" height="20" rx="4" fill="${BRAND.accent}" opacity="0.08"/>
           <text x="0" y="5" text-anchor="middle" fill="${BRAND.accent}" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="800" opacity="0.3">LOGO</text>`,
  },
  {
    name: 'gallery_wide',
    w: 800, h: 450,
    label: 'Gallery Image',
    hint: 'Screenshot or wide photo',
    icon: `<rect x="-24" y="-16" width="48" height="32" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="2" opacity="0.35"/>
           <path d="M-18,-8 L-8,2 L-2,-4 L18,8" fill="none" stroke="${BRAND.gold}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
           <circle cx="10" cy="-8" r="4" fill="${BRAND.gold}" opacity="0.35"/>`,
  },
];

for (const p of placeholders) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">
  <defs>
    <pattern id="grid-${p.name}" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${BRAND.accent}" stroke-width="0.3" opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="${p.w}" height="${p.h}" fill="${BRAND.bg}" rx="6"/>
  <rect width="${p.w}" height="${p.h}" fill="url(#grid-${p.name})" rx="6"/>
  <rect x="3" y="3" width="${p.w-6}" height="${p.h-6}" fill="none" stroke="${BRAND.gold}" stroke-width="1.5" stroke-dasharray="8,4" rx="4" opacity="0.5"/>
  <g transform="translate(${p.w/2}, ${p.h/2 - 20})">
    ${p.icon}
  </g>
  <text x="${p.w/2}" y="${p.h/2 + 22}" text-anchor="middle" fill="${BRAND.text}" font-family="Inter,system-ui,sans-serif" font-size="${Math.min(16, Math.max(10, p.w/30))}" font-weight="700">${esc(p.label)}</text>
  <text x="${p.w/2}" y="${p.h/2 + 40}" text-anchor="middle" fill="${BRAND.text}" font-family="Inter,system-ui,sans-serif" font-size="${Math.min(12, Math.max(8, p.w/40))}" opacity="0.45">${esc(p.hint)}</text>
</svg>`;

  const filePath = path.join(outDir, `${p.name}.svg`);
  fs.writeFileSync(filePath, svg, 'utf8');
  console.log(`✅ ${p.name}.svg (${p.w}×${p.h})`);
}

console.log(`\nDone! ${placeholders.length} placeholders in ${outDir}`);
