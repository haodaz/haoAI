import PptxGenJS from 'pptxgenjs';
import fs from 'fs';
import path from 'path';

// ============================================
// Shared PPTX Renderer
// Used by both Toolbox (manual tool call) and Edda (AI agent)
//
// Two renderers:
//   renderPPTX()     — Legacy: simple title+bullets (used by Edda chat mode)
//   renderRichPPTX() — Rich: full element-level JSON → PPTX (used by Toolbox)
// ============================================

// ─── Legacy Interface (backward compat for Edda chat) ─────────────────────

export interface SlideData {
  title: string;
  bullets: string[];
}

const THEME_COLORS: Record<string, { primary: string; secondary: string; accent: string; text: string; bg: string }> = {
  graphite: { primary: '2D3436', secondary: 'DFE6E9', accent: '0984E3', text: '2D3436', bg: 'FFFFFF' },
  blue:     { primary: '1E3A8A', secondary: 'DBEAFE', accent: '3B82F6', text: '1E3A5A', bg: 'F0F5FF' },
  emerald:  { primary: '065F46', secondary: 'D1FAE5', accent: '10B981', text: '064E3B', bg: 'F0FDF4' },
  light:    { primary: '64748B', secondary: 'F1F5F9', accent: '94A3B8', text: '334155', bg: 'FFFFFF' },
};

export interface RenderPPTXOptions {
  slides: SlideData[];
  theme?: string;
  coverTitle?: string;
  coverSubtitle?: string;
}

/**
 * Legacy renderer: title + bullets only.
 * Still used by Edda agent chat mode.
 */
export async function renderPPTX(options: RenderPPTXOptions): Promise<{ fileUrl: string; fileName: string }> {
  const { slides, theme = 'blue', coverTitle, coverSubtitle } = options;
  const colors = THEME_COLORS[theme] || THEME_COLORS.blue;
  
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  // Cover Slide
  const coverSlide = pptx.addSlide();
  coverSlide.background = { color: colors.primary };
  coverSlide.addText(coverTitle || 'Bristh Enrollment Partners', {
    x: '10%', y: '35%', w: '80%', h: 1,
    fontSize: 36, color: 'FFFFFF', bold: true, align: 'center',
  });
  coverSlide.addText(coverSubtitle || 'Professional Presentation', {
    x: '10%', y: '55%', w: '80%', h: 0.8,
    fontSize: 20, color: 'E2E8F0', align: 'center',
  });

  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: colors.bg };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.9, fill: { color: colors.primary } });
    slide.addText(s.title || `Slide ${i + 1}`, { x: 0.5, y: 0, w: '85%', h: 0.9, fontSize: 24, color: 'FFFFFF', bold: true, align: 'left' });
    slide.addText(`${i + 1}`, { x: '90%', y: 0, w: '8%', h: 0.9, fontSize: 14, color: 'FFFFFF', align: 'center', italic: true });
    if (s.bullets && s.bullets.length > 0) {
      const bulletText = s.bullets.map(b => ({
        text: b,
        options: { bullet: { type: 'bullet' as const }, fontSize: 16, color: colors.text, breakLine: true, lineSpacingMultiple: 1.5 },
      }));
      slide.addText(bulletText, { x: 0.6, y: 1.3, w: '88%', h: '70%', valign: 'top' });
    }
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: '95%', w: '100%', h: '5%', fill: { color: colors.accent } });
  });

  const fileName = `PPT_${Date.now()}.pptx`;
  const base64 = await pptx.write({ outputType: 'base64' }) as string;
  const dataUri = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`;
  return { fileUrl: dataUri, fileName };
}


// ─── Rich Element Interface (new Toolbox pipeline) ────────────────────────

export interface RichSlideElement {
  id: string;
  type: 'TEXT_BOX' | 'SHAPE_BOX' | 'TABLE' | 'CHART' | 'IMAGE';
  content: string;        // TEXT_BOX text; SHAPE_BOX must be ""; IMAGE = file path
  x: number;              // % (0-100)
  y: number;
  width: number;
  height: number;
  style?: {
    fontSize?: number;     // rem-ish units from AI, mapped to pt
    fontWeight?: 'normal' | 'bold';
    color?: string;        // hex with #
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    borderRadius?: number;
    padding?: number;
  };
  // TABLE specific
  tableData?: string[][];
  tableHeader?: string[];
  // CHART specific
  chartType?: 'bar' | 'pie' | 'line';
  chartData?: { label: string; value: number }[];
  // IMAGE specific
  imagePath?: string;      // absolute path or relative to public/
}

export interface RichSlideData {
  backgroundColor: string; // hex with #
  elements: RichSlideElement[];
}

export interface RenderRichPPTXOptions {
  slides: RichSlideData[];
  title?: string;
  theme?: string;  // 'bep' | 'clean' | 'dark' — for future multi-style
}

// 16:9 slide dimensions in inches
const SLIDE_W = 10;
const SLIDE_H = 7.5;

/** Strip '#' from hex color for pptxgenjs (which uses bare hex) */
function bareHex(color: string): string {
  return (color || '').replace(/^#/, '') || 'FFFFFF';
}

/** Generate a branded SVG placeholder image as base64 data URI */
function generatePlaceholderSvg(label: string, widthPx: number = 600, heightPx: number = 400): string {
  // BEP brand colors
  const bg = '#f0f4f0';
  const accent = '#0E3018';
  const gold = '#c9a84c';
  const textColor = '#6b7280';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
    <rect width="${widthPx}" height="${heightPx}" fill="${bg}" rx="8"/>
    <rect x="2" y="2" width="${widthPx - 4}" height="${heightPx - 4}" fill="none" stroke="${gold}" stroke-width="2" stroke-dasharray="8,4" rx="6"/>
    <g transform="translate(${widthPx / 2}, ${heightPx / 2 - 20})">
      <rect x="-24" y="-24" width="48" height="48" rx="8" fill="${accent}" opacity="0.15"/>
      <path d="M-12,-8 L12,-8 L12,8 L-12,8 Z M-8,-4 L0,4 L8,-4" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
      <circle cx="6" cy="-2" r="3" fill="${gold}" opacity="0.6"/>
    </g>
    <text x="${widthPx / 2}" y="${heightPx / 2 + 35}" text-anchor="middle" fill="${textColor}" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="600">${escapeXml(label || 'Image Placeholder')}</text>
    <text x="${widthPx / 2}" y="${heightPx / 2 + 55}" text-anchor="middle" fill="${textColor}" font-family="Inter,system-ui,sans-serif" font-size="11" opacity="0.5">Upload or generate to replace</text>
  </svg>`;

  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Convert AI's rem-ish fontSize to PowerPoint pt.  AI uses ~1.0-3.5 scale. */
function remToPt(rem: number): number {
  // Mapping: 1.0rem → 14pt, 1.5rem → 18pt, 2.0rem → 24pt, 3.0rem → 36pt
  const pt = Math.round(rem * 12);
  return Math.max(8, Math.min(pt, 54)); // clamp 8-54pt
}

/**
 * Rich renderer: consumes AI element-level JSON and produces PPTX
 * with full layout fidelity (shapes, colors, positions, tables, charts).
 *
 * Coordinate mapping:  x% → x/100 * 10 inches,  y% → y/100 * 7.5 inches
 */
// ─── Logo Helpers ─────────────────────────────────────────────────────────

function loadLogoBase64(variant: 'dark' | 'light'): string | null {
  try {
    const filename = variant === 'dark' ? 'bep_logo_dark.png' : 'bep_logo_light.png';
    const logoPath = path.join(process.cwd(), 'public', 'images', filename);
    if (!fs.existsSync(logoPath)) return null;
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return null; }
}

/** Determine if a slide has a dark background (for logo variant selection) */
function isDarkBg(bg: string): boolean {
  const dark = ['0E3018', '059669', '0e3018', '1a2f5e', '000000', '111111', '222222'];
  return dark.some(d => (bg || '').replace('#', '').toLowerCase().includes(d.toLowerCase()));
}

export async function renderRichPPTX(options: RenderRichPPTXOptions): Promise<{ fileUrl: string; fileName: string }> {
  const { slides, title } = options;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = title || 'BEP Presentation';
  pptx.author = 'BEP Auto Office';

  // Pre-load logos once
  const logoDark = loadLogoBase64('dark');    // green bg logo (white text)
  const logoLight = loadLogoBase64('light');  // white bg logo (dark text)

  for (let slideIdx = 0; slideIdx < slides.length; slideIdx++) {
    const slideData = slides[slideIdx];
    const slide = pptx.addSlide();
    slide.background = { color: bareHex(slideData.backgroundColor || '#ffffff') };
    const darkBg = isDarkBg(slideData.backgroundColor);

    for (const el of (slideData.elements || [])) {
      // Convert % to inches
      const xIn = (el.x / 100) * SLIDE_W;
      const yIn = (el.y / 100) * SLIDE_H;
      const wIn = (el.width / 100) * SLIDE_W;
      const hIn = (el.height / 100) * SLIDE_H;

      // Clamp to slide bounds
      const x = Math.max(0, xIn);
      const y = Math.max(0, yIn);
      const w = Math.max(0.1, Math.min(wIn, SLIDE_W - x));
      const h = Math.max(0.1, Math.min(hIn, SLIDE_H - y));

      switch (el.type) {
        case 'SHAPE_BOX': {
          const fillColor = bareHex(el.style?.backgroundColor || '#0E3018');
          const shapeOpts: any = { x, y, w, h, fill: { color: fillColor } };
          if (el.style?.borderRadius && el.style.borderRadius > 0) {
            shapeOpts.rectRadius = Math.min(el.style.borderRadius * 0.01, 0.2);
          }
          slide.addShape(pptx.ShapeType.rect, shapeOpts);
          break;
        }

        case 'TEXT_BOX': {
          const fontSize = remToPt(el.style?.fontSize || 1.1);
          const color = bareHex(el.style?.color || '#000000');
          const bold = el.style?.fontWeight === 'bold';
          const align = el.style?.textAlign || 'left';
          const bgColor = el.style?.backgroundColor;
          const hasBg = bgColor && bgColor !== 'transparent' && bgColor !== '';

          // Handle bullet text: lines starting with • or - become bullets
          const rawLines = (el.content || '').split('\n').filter(l => l.trim());
          const isBulletList = rawLines.length > 1 && rawLines.every(l => /^[•\-–]\s*/.test(l.trim()));

          if (isBulletList) {
            const bulletRows = rawLines.map(line => ({
              text: line.replace(/^[•\-–]\s*/, ''),
              options: {
                bullet: { type: 'bullet' as const },
                fontSize,
                color,
                bold,
                breakLine: true,
                lineSpacingMultiple: 1.6,
              },
            }));
            const textOpts: any = { x, y, w, h, valign: 'top', align };
            if (hasBg) textOpts.fill = { color: bareHex(bgColor!) };
            slide.addText(bulletRows, textOpts);
          } else {
            const textOpts: any = {
              x, y, w, h,
              fontSize,
              color,
              bold,
              align,
              valign: 'middle',
              wrap: true,
              lineSpacingMultiple: 1.5,
            };
            if (hasBg) textOpts.fill = { color: bareHex(bgColor!) };
            if (el.style?.padding) textOpts.margin = el.style.padding * 4; // rough mapping
            slide.addText(el.content || '', textOpts);
          }
          break;
        }

        case 'TABLE': {
          if (!el.tableData || el.tableData.length === 0) break;
          const headerRow = el.tableHeader || el.tableData[0];
          const bodyRows = el.tableHeader ? el.tableData : el.tableData.slice(1);

          const tableRows: any[][] = [];
          // Header
          tableRows.push(headerRow.map(cell => ({
            text: cell || '',
            options: { bold: true, fontSize: 11, color: 'FFFFFF', fill: { color: '059669' }, align: 'center', valign: 'middle' },
          })));
          // Body
          bodyRows.forEach((row, rIdx) => {
            tableRows.push(row.map(cell => ({
              text: cell || '',
              options: { fontSize: 10, color: '374151', fill: { color: rIdx % 2 === 0 ? 'f4f6f9' : 'FFFFFF' }, valign: 'middle' },
            })));
          });

          slide.addTable(tableRows, {
            x, y, w, h,
            border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
            colW: Array(headerRow.length).fill(w / headerRow.length),
            autoPage: false,
          });
          break;
        }

        case 'CHART': {
          if (!el.chartData || el.chartData.length === 0) break;

          const chartTypeMap: Record<string, any> = {
            bar: pptx.ChartType.bar,
            pie: pptx.ChartType.pie,
            line: pptx.ChartType.line,
          };
          const pptxChartType = chartTypeMap[el.chartType || 'bar'] || pptx.ChartType.bar;

          const chartDataFormatted = [{
            name: 'Data',
            labels: el.chartData.map(d => d.label),
            values: el.chartData.map(d => d.value),
          }];

          slide.addChart(pptxChartType, chartDataFormatted, {
            x, y, w, h,
            showTitle: false,
            showValue: true,
            chartColors: ['059669', 'c9a84c', '10b981', '10B981', 'E53E3E', '8B5CF6'],
          });
          break;
        }

        case 'IMAGE': {
          const imgPath = el.imagePath || el.content;
          if (!imgPath) break;

          try {
            let imgData: string | null = null;

            if (imgPath.startsWith('placeholder:')) {
              // Generate branded SVG placeholder
              const label = imgPath.replace('placeholder:', '').trim();
              const pxW = Math.round(w * 96);  // rough inches → pixels
              const pxH = Math.round(h * 96);
              imgData = generatePlaceholderSvg(label, pxW, pxH);
            } else if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
              // Cloud URL (e.g. Supabase Storage) — download and embed
              try {
                const res = await fetch(imgPath);
                if (res.ok) {
                  const arrBuf = await res.arrayBuffer();
                  const ext = imgPath.match(/\.(png|jpg|jpeg|gif|webp|svg)/i)?.[1] || 'png';
                  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext.replace('jpg', 'jpeg')}`;
                  imgData = `data:${mime};base64,${Buffer.from(arrBuf).toString('base64')}`;
                }
              } catch { /* cloud fetch failed */ }
            } else {
              // Local file path
              let absPath = imgPath;
              if (!path.isAbsolute(imgPath)) {
                const cleanPath = imgPath.startsWith('/') ? imgPath.slice(1) : imgPath;
                absPath = path.join(process.cwd(), 'public', cleanPath);
              }
              if (fs.existsSync(absPath)) {
                const imgBuf = fs.readFileSync(absPath);
                imgData = `data:image/png;base64,${imgBuf.toString('base64')}`;
              }
            }

            if (imgData) {
              slide.addImage({ data: imgData, x, y, w, h });
            }
          } catch { /* skip broken image */ }
          break;
        }

        default:
          // Unknown element type — skip silently
          break;
      }
    }

    // ── Auto-inject BEP logo ──
    // Cover/divider (dark bg): green-bg logo (white text)
    // Content pages (white bg): light logo at top-right corner
    if (slideIdx === 0 && darkBg && logoDark) {
      // Cover page: centered, smaller logo
      slide.addImage({ data: logoDark, x: 3.5, y: 0.2, w: 3.0, h: 0.9 });
    } else if (darkBg && logoDark) {
      // Section divider: small logo bottom-right
      slide.addImage({ data: logoDark, x: 7.8, y: 6.5, w: 1.8, h: 0.55 });
    } else if (!darkBg && logoLight) {
      // Content page: compact logo top-right
      slide.addImage({ data: logoLight, x: 8.2, y: 0.15, w: 1.5, h: 0.45 });
    }
  }

  const fileName = `PPT_${Date.now()}.pptx`;
  const base64 = await pptx.write({ outputType: 'base64' }) as string;
  const dataUri = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`;
  return { fileUrl: dataUri, fileName };
}

