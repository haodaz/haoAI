'use client';
import React, { useRef, useEffect, useState, useCallback } from 'react';
import QRCode from 'qrcode';

interface Seat { type: 'host' | 'ai'; name: string; avatarUrl?: string; }
interface Props { roomId: string; roomName: string; presenceCount?: number; seats: Seat[]; onClose?: () => void; }

const W = 390; const H = 693;
const DEFAULT_AVATAR = '/default-avatar.png';
const SLOGAN = '随时随地，为你一答。';
type TemplateId = 1 | 2 | 3;

// ── Image loader ──────────────────────────────────────────────────────────────
async function loadImg(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  if (url.startsWith('data:')) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url;
    });
  }
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('bad');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    return await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { resolve(img); URL.revokeObjectURL(blobUrl); };
      img.onerror = () => { resolve(null); URL.revokeObjectURL(blobUrl); };
      img.src = blobUrl;
    });
  } catch { return null; }
}

function seatPositions(n: number, cx: number, cy: number, r: number) {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

// ── Wrap text to N lines, ellipsis on last if overflow ───────────────────────
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxW) {
      if (lines.length >= maxLines - 1) {
        // Last allowed line — truncate with ellipsis
        let last = cur;
        while (last.length > 0 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
        lines.push(last + '…');
        return lines;
      }
      lines.push(cur); cur = ch;
    } else { cur = test; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Shared: draw single avatar ────────────────────────────────────────────────
async function drawAvatar(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  seat: Seat, defaultImg: HTMLImageElement | null,
  ringColor: string, glowColor: string, pillDark = false,
) {
  const gg = ctx.createRadialGradient(x, y, r, x, y, r + 14);
  gg.addColorStop(0, glowColor); gg.addColorStop(1, 'transparent');
  ctx.fillStyle = gg; ctx.fillRect(x - r - 14, y - r - 14, (r + 14) * 2, (r + 14) * 2);

  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const img = seat.avatarUrl ? await loadImg(seat.avatarUrl) : null;
  const use = img || defaultImg;
  if (use) {
    ctx.drawImage(use, x - r, y - r, r * 2, r * 2);
  } else {
    const fg = ctx.createRadialGradient(x - 4, y - 4, 0, x, y, r);
    fg.addColorStop(0, '#a78bfa'); fg.addColorStop(1, '#4c1d95');
    ctx.fillStyle = fg; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 0.55)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(seat.name.slice(0, 1), x, y);
  }
  ctx.restore();

  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor; ctx.lineWidth = 2.5;
  ctx.shadowColor = glowColor; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore();

  if (seat.type === 'host') {
    ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👑', x + r * 0.7, y - r * 0.7);
  }

  ctx.save();
  const label = seat.name.length > 8 ? seat.name.slice(0, 8) + '…' : seat.name;
  ctx.font = `11px -apple-system,"PingFang SC",sans-serif`;
  const tw = ctx.measureText(label).width;
  const pw = tw + 14; const ph = 18;
  const px = x - pw / 2; const py = y + r + 5;
  ctx.fillStyle = pillDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.38)';
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 9); ctx.fill();
  ctx.strokeStyle = pillDark ? 'rgba(100,80,200,0.25)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = pillDark ? '#3730a3' : (seat.type === 'host' ? '#fde68a' : '#ddd6fe');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, py + ph / 2); ctx.restore();
}

// ── Shared: LIVE badge ────────────────────────────────────────────────────────
function drawLiveBadge(ctx: CanvasRenderingContext2D, y: number, dark = false) {
  const bw = 144; const bh = 28; const bx = (W - bw) / 2; const by = y - bh / 2;
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1; ctx.stroke(); ctx.restore();

  const rdx = bx + 18; const rdy = y;
  const rdg = ctx.createRadialGradient(rdx, rdy, 0, rdx, rdy, 10);
  rdg.addColorStop(0, 'rgba(239,68,68,0.7)'); rdg.addColorStop(1, 'transparent');
  ctx.fillStyle = rdg; ctx.fillRect(rdx - 10, rdy - 10, 20, 20);
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(rdx, rdy, 4, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = dark ? '#1e1b4b' : '#ffffff';
  ctx.font = 'bold 13px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('LIVE  直播中', bx + bw / 2 + 5, y);
}

// ── Shared: room title (2 lines max, ellipsis) ────────────────────────────────
function drawRoomTitle(ctx: CanvasRenderingContext2D, roomName: string, startY: number, fillStyle: string | CanvasGradient, shadowColor = '', shadowBlur = 0) {
  ctx.font = `bold 20px -apple-system,"PingFang SC",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fillStyle;
  if (shadowColor) { ctx.shadowColor = shadowColor; ctx.shadowBlur = shadowBlur; }
  const lines = wrapText(ctx, roomName, W - 60, 2);
  lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * 26));
  ctx.shadowBlur = 0;
  return startY + lines.length * 26; // returns Y after title
}

// ── Shared: QR card ────────────────────────────────────────────────────────────
async function drawQrCard(
  ctx: CanvasRenderingContext2D, cardY: number, cardH: number,
  qrDataUrl: string, shareUrl: string, dark = false,
) {
  const pad = 32;
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.07)';
  if (dark) { ctx.shadowColor = 'rgba(100,80,200,0.18)'; ctx.shadowBlur = 24; }
  ctx.beginPath(); ctx.roundRect(pad, cardY, W - pad * 2, cardH, 16); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = dark ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1; ctx.stroke(); ctx.restore();

  ctx.fillStyle = dark ? '#4338ca' : '#c4b5fd';
  ctx.font = '12px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('扫码入场，即刻围观', W / 2, cardY + 20);

  const qrImg = await loadImg(qrDataUrl);
  if (qrImg) {
    const s = 80; ctx.save(); ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(W / 2 - s / 2 - 3, cardY + 28, s + 6, s + 6, 6); ctx.fill(); ctx.restore();
    ctx.drawImage(qrImg, W / 2 - s / 2, cardY + 31, s, s);
  }
  // Display domain from actual share URL
  // 展示域名：去掉协议头，只保留 host + roomId 部分
  const displayUrl = shareUrl.replace(/^https?:\/\//, '');
  ctx.fillStyle = dark ? 'rgba(67,56,202,0.5)' : 'rgba(200,190,240,0.5)';
  ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText(displayUrl, W / 2, cardY + cardH - 10);
}

// ── Shared: brand ─────────────────────────────────────────────────────────────
function drawBrand(ctx: CanvasRenderingContext2D, y: number, dark = false) {
  const g = ctx.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
  if (dark) { g.addColorStop(0, '#4338ca'); g.addColorStop(1, '#7c3aed'); }
  else       { g.addColorStop(0, '#a78bfa'); g.addColorStop(1, '#60a5fa'); }
  ctx.fillStyle = g;
  ctx.font = 'bold 22px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('一答 | 群体智能', W / 2, y);
  ctx.fillStyle = dark ? 'rgba(67,56,202,0.75)' : 'rgba(210,200,255,0.88)';
  ctx.font = '11px -apple-system,"PingFang SC",sans-serif';
  ctx.fillText(SLOGAN, W / 2, y + 20);
}

// ─────────────────────────────────────────────────────────────────────────────
// Template 1 — 星际连接  (dark space + glowing orb + neural lines)
// ─────────────────────────────────────────────────────────────────────────────
async function drawTemplate1(canvas: HTMLCanvasElement, seats: Seat[], roomName: string, qrDataUrl: string, shareUrl: string) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#010112'); bg.addColorStop(1, '#030220');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const au = ctx.createRadialGradient(W / 2, H * 0.41, 0, W / 2, H * 0.41, 240);
  au.addColorStop(0, 'rgba(0,140,255,0.2)'); au.addColorStop(0.5, 'rgba(100,50,230,0.12)'); au.addColorStop(1, 'transparent');
  ctx.fillStyle = au; ctx.fillRect(0, 0, W, H);

  const rng = (s: number) => { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };
  const rand = rng(37);
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.55})`;
    ctx.beginPath(); ctx.arc(rand() * W, rand() * H, rand() * 1.3 + 0.2, 0, Math.PI * 2); ctx.fill();
  }

  drawLiveBadge(ctx, 52);
  const sg = ctx.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
  sg.addColorStop(0, '#67e8f9'); sg.addColorStop(1, '#818cf8');
  drawRoomTitle(ctx, roomName, 88, '#ffffff', 'rgba(0,180,255,0.55)', 18);

  const cx = W / 2; const cy = H * 0.435;
  const orbR = 50; const seatR = 110;
  const positions = seatPositions(seats.length, cx, cy, seatR);

  for (const { x, y } of positions) {
    ctx.save();
    const lg = ctx.createLinearGradient(cx, cy, x, y);
    lg.addColorStop(0, 'rgba(0,220,255,0.55)'); lg.addColorStop(1, 'rgba(140,80,255,0.2)');
    ctx.strokeStyle = lg; ctx.lineWidth = 1; ctx.setLineDash([3, 9]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
  }

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, seatR, 0, Math.PI * 2);
  const rg = ctx.createLinearGradient(cx - seatR, cy, cx + seatR, cy);
  rg.addColorStop(0, 'rgba(0,220,255,0.45)'); rg.addColorStop(0.5, 'rgba(160,120,255,0.75)'); rg.addColorStop(1, 'rgba(0,220,255,0.45)');
  ctx.strokeStyle = rg; ctx.lineWidth = 1.2; ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 6; ctx.stroke(); ctx.restore();

  const og = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR + 32);
  og.addColorStop(0, 'rgba(0,180,255,0.28)'); og.addColorStop(1, 'transparent');
  ctx.fillStyle = og; ctx.fillRect(cx - orbR - 32, cy - orbR - 32, (orbR + 32) * 2, (orbR + 32) * 2);

  const orbGrad = ctx.createRadialGradient(cx - 14, cy - 14, 0, cx, cy, orbR);
  orbGrad.addColorStop(0, '#b0e8ff'); orbGrad.addColorStop(0.35, '#2563eb'); orbGrad.addColorStop(1, '#1e1060');
  ctx.fillStyle = orbGrad; ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2; ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 14; ctx.stroke(); ctx.restore();
  for (let ri = 0; ri < 2; ri++) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, orbR * (0.5 + ri * 0.3), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100,210,255,${0.28 - ri * 0.1})`; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
  }

  const defImg = await loadImg(DEFAULT_AVATAR);
  for (let i = 0; i < seats.length; i++) {
    const { x, y } = positions[i];
    await drawAvatar(ctx, x, y, 28, seats[i], defImg, 'rgba(0,220,255,0.9)', 'rgba(0,220,255,0.4)');
  }

  const divY = H * 0.665;
  const dg = ctx.createLinearGradient(40, divY, W - 40, divY);
  dg.addColorStop(0, 'transparent'); dg.addColorStop(0.5, 'rgba(0,220,255,0.3)'); dg.addColorStop(1, 'transparent');
  ctx.strokeStyle = dg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, divY); ctx.lineTo(W - 40, divY); ctx.stroke();

  await drawQrCard(ctx, divY + 14, 130, qrDataUrl, shareUrl, false);
  drawBrand(ctx, H - 50, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Template 2 — 量子环  (deep violet-navy + pure neon ring)
// ─────────────────────────────────────────────────────────────────────────────
async function drawTemplate2(canvas: HTMLCanvasElement, seats: Seat[], roomName: string, qrDataUrl: string, shareUrl: string) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#110025'); bg.addColorStop(0.55, '#060030'); bg.addColorStop(1, '#00152e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const b1 = ctx.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, 180);
  b1.addColorStop(0, 'rgba(180,30,255,0.22)'); b1.addColorStop(1, 'transparent');
  ctx.fillStyle = b1; ctx.fillRect(0, 0, W, H);
  const b2 = ctx.createRadialGradient(W * 0.15, H * 0.75, 0, W * 0.15, H * 0.75, 160);
  b2.addColorStop(0, 'rgba(0,180,255,0.2)'); b2.addColorStop(1, 'transparent');
  ctx.fillStyle = b2; ctx.fillRect(0, 0, W, H);

  const rng = (s: number) => { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };
  const rand = rng(99);
  for (let i = 0; i < 35; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.5})`;
    ctx.beginPath(); ctx.arc(rand() * W, rand() * H, rand() * 1.2 + 0.2, 0, Math.PI * 2); ctx.fill();
  }

  drawLiveBadge(ctx, 52);
  const tg = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
  tg.addColorStop(0, '#f0abfc'); tg.addColorStop(0.5, '#c084fc'); tg.addColorStop(1, '#67e8f9');
  drawRoomTitle(ctx, roomName, 88, tg, 'rgba(192,132,252,0.5)', 16);

  const cx = W / 2; const cy = H * 0.435; const ringR = 110;
  const positions = seatPositions(seats.length, cx, cy, ringR);

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, ringR + 20, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(192,132,252,0.12)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  const mainRg = ctx.createLinearGradient(cx - ringR, cy - ringR, cx + ringR, cy + ringR);
  mainRg.addColorStop(0, 'rgba(192,132,252,1)'); mainRg.addColorStop(0.33, 'rgba(0,210,255,1)');
  mainRg.addColorStop(0.66, 'rgba(240,171,252,0.9)'); mainRg.addColorStop(1, 'rgba(192,132,252,1)');
  ctx.strokeStyle = mainRg; ctx.lineWidth = 2.5; ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 18; ctx.stroke(); ctx.restore();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, ringR - 14, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(192,132,252,0.2)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();

  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
  cg.addColorStop(0, 'rgba(192,132,252,0.18)'); cg.addColorStop(0.4, 'rgba(100,50,200,0.1)'); cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg; ctx.fillRect(cx - 60, cy - 60, 120, 120);
  for (let si = 0; si < 3; si++) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 4 + si * 8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(192,132,252,${0.6 - si * 0.18})`; ctx.lineWidth = si === 0 ? 2 : 1; ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = 'rgba(240,171,252,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();

  const defImg = await loadImg(DEFAULT_AVATAR);
  for (let i = 0; i < seats.length; i++) {
    const { x, y } = positions[i];
    await drawAvatar(ctx, x, y, 28, seats[i], defImg, 'rgba(192,132,252,0.95)', 'rgba(192,132,252,0.45)');
  }

  const divY = H * 0.665;
  const dv = ctx.createLinearGradient(40, divY, W - 40, divY);
  dv.addColorStop(0, 'transparent'); dv.addColorStop(0.5, 'rgba(192,132,252,0.35)'); dv.addColorStop(1, 'transparent');
  ctx.strokeStyle = dv; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, divY); ctx.lineTo(W - 40, divY); ctx.stroke();

  await drawQrCard(ctx, divY + 14, 130, qrDataUrl, shareUrl, false);
  drawBrand(ctx, H - 50, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Template 3 — 极光卡片  (light Aurora, dark text)
// ─────────────────────────────────────────────────────────────────────────────
async function drawTemplate3(canvas: HTMLCanvasElement, seats: Seat[], roomName: string, qrDataUrl: string, shareUrl: string) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#f6f5ff'; ctx.fillRect(0, 0, W, H);

  const a1 = ctx.createRadialGradient(W * 0.8, H * 0.1, 0, W * 0.8, H * 0.1, 240);
  a1.addColorStop(0, 'rgba(216,180,254,0.55)'); a1.addColorStop(1, 'transparent');
  ctx.fillStyle = a1; ctx.fillRect(0, 0, W, H);
  const a2 = ctx.createRadialGradient(W * 0.1, H * 0.45, 0, W * 0.1, H * 0.45, 220);
  a2.addColorStop(0, 'rgba(147,197,253,0.45)'); a2.addColorStop(1, 'transparent');
  ctx.fillStyle = a2; ctx.fillRect(0, 0, W, H);
  const a3 = ctx.createRadialGradient(W * 0.55, H * 0.65, 0, W * 0.55, H * 0.65, 200);
  a3.addColorStop(0, 'rgba(167,243,208,0.35)'); a3.addColorStop(1, 'transparent');
  ctx.fillStyle = a3; ctx.fillRect(0, 0, W, H);

  for (let gx = 20; gx < W; gx += 28) for (let gy = 20; gy < H; gy += 28) {
    ctx.fillStyle = 'rgba(100,80,200,0.055)';
    ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill();
  }

  drawLiveBadge(ctx, 52, true);
  drawRoomTitle(ctx, roomName, 88, '#1e1b4b', 'rgba(109,40,217,0.2)', 12);

  const cx = W / 2; const cy = H * 0.435; const ringR = 110;
  const positions = seatPositions(seats.length, cx, cy, ringR);

  ctx.save();
  ctx.shadowColor = 'rgba(109,40,217,0.15)'; ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.beginPath(); ctx.arc(cx, cy, 72, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  const diskRg = ctx.createLinearGradient(cx - 72, cy, cx + 72, cy);
  diskRg.addColorStop(0, 'rgba(167,139,250,0.6)'); diskRg.addColorStop(0.5, 'rgba(96,165,250,0.6)'); diskRg.addColorStop(1, 'rgba(167,139,250,0.6)');
  ctx.strokeStyle = diskRg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 72, 0, Math.PI * 2); ctx.stroke(); ctx.restore();

  for (let ri = 1; ri <= 3; ri++) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 72 * (ri / 4), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(109,40,217,${0.07 - ri * 0.015})`; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
  }
  const cdg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
  cdg.addColorStop(0, 'rgba(109,40,217,0.55)'); cdg.addColorStop(1, 'transparent');
  ctx.fillStyle = cdg; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(167,139,250,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.restore();

  const defImg = await loadImg(DEFAULT_AVATAR);
  for (let i = 0; i < seats.length; i++) {
    const { x, y } = positions[i];
    await drawAvatar(ctx, x, y, 28, seats[i], defImg, 'rgba(124,58,237,0.8)', 'rgba(167,139,250,0.35)', true);
  }

  const divY = H * 0.665;
  const dv = ctx.createLinearGradient(40, divY, W - 40, divY);
  dv.addColorStop(0, 'transparent'); dv.addColorStop(0.5, 'rgba(167,139,250,0.4)'); dv.addColorStop(1, 'transparent');
  ctx.strokeStyle = dv; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, divY); ctx.lineTo(W - 40, divY); ctx.stroke();

  await drawQrCard(ctx, divY + 14, 130, qrDataUrl, shareUrl, true);
  drawBrand(ctx, H - 50, true);
}

// ── Master dispatcher ──────────────────────────────────────────────────────────
async function drawPoster(
  canvas: HTMLCanvasElement, seats: Seat[], roomName: string,
  presenceCount: number, qrDataUrl: string, shareUrl: string, template: TemplateId,
) {
  if (template === 1) return drawTemplate1(canvas, seats, roomName, qrDataUrl, shareUrl);
  if (template === 2) return drawTemplate2(canvas, seats, roomName, qrDataUrl, shareUrl);
  return drawTemplate3(canvas, seats, roomName, qrDataUrl, shareUrl);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LivePosterCard({ roomId, roomName, presenceCount = 0, seats, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [template, setTemplate] = useState<TemplateId>(1);
  const lastDrawnKeyRef = useRef('');
  const isDrawingRef = useRef(false);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snap = JSON.stringify(seats.map(s => ({ t: s.type, n: s.name, u: s.avatarUrl })));
    const key = `${snap}|${roomName}|${roomId}|${template}`;
    if (key === lastDrawnKeyRef.current) return;
    lastDrawnKeyRef.current = key;
    isDrawingRef.current = true; setReady(false);
    // 优先使用 NEXT_PUBLIC_APP_URL（生产域名），dev 环境 fallback 到当前 origin
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    const shareUrl = `${appBase}/?roomId=${roomId}`;
    const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 200, margin: 1, color: { dark: '#1a1060', light: '#ffffff' } });
    await drawPoster(canvas, seats, roomName, presenceCount, qrDataUrl, shareUrl, template);
    isDrawingRef.current = false; setReady(true);
  }, [seats, roomName, roomId, template, presenceCount]);

  useEffect(() => { render(); }, [render]);

  const getBlob = (): Promise<Blob | null> => {
    if (isDrawingRef.current) return new Promise(res => setTimeout(() => res(getBlob()), 150));
    return new Promise(res => canvasRef.current?.toBlob(res, 'image/png'));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await getBlob(); if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `zhiji-live-${roomId}.png`; a.click();
    } finally { setSaving(false); }
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      const blob = await getBlob(); if (!blob) return;
      const fd = new FormData(); fd.append('poster', blob, `${roomId}.png`);
      const res = await fetch(`/api/roundtable/${roomId}/poster`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        const full = `${window.location.origin}${data.url}`;
        setUploadedUrl(full);
        await navigator.clipboard.writeText(full).catch(() => {});
      }
    } finally { setUploading(false); }
  };

  const TEMPLATES: { id: TemplateId; label: string; accent: string }[] = [
    { id: 1, label: '模板1 · 星际', accent: '#00d4ff' },
    { id: 2, label: '模板2 · 量子', accent: '#a855f7' },
    { id: 3, label: '模板3 · 极光', accent: '#7c3aed' },
  ];

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '12px 0',
        animation: 'fadeIn 0.2s ease', overflowY: 'auto',
      }}>

      {/* ── Template switcher (compact single row) ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {TEMPLATES.map(t => (
          <button key={t.id} onClick={() => setTemplate(t.id)} style={{
            padding: '6px 14px', borderRadius: 20, border: 'none',
            background: template === t.id ? '#10b981' : 'rgba(255,255,255,0.12)',
            color: template === t.id ? '#fff' : 'rgba(255,255,255,0.6)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s', fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Canvas ── */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef} width={W} height={H}
          style={{ borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.7)', maxHeight: '68vh', width: 'auto', display: 'block' }}
        />
        {!ready && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(9,9,28,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(200,190,255,0.7)', fontSize: 14 }}>
            海报生成中…
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
        position: 'relative', zIndex: 10 }}>
        <button onClick={handleSave} disabled={!ready || saving} style={btnStyle(ready, '#10b981')}>
          {saving ? '保存中…' : '保存海报'}
        </button>
        <button onClick={handleUpload} disabled={!ready || uploading} style={btnStyle(ready, '#10b981')}>
          {uploading ? '上传中…' : '上传到服务器'}
        </button>
        <button onClick={onClose} style={{
          padding: '11px 22px', borderRadius: 12, border: 'none',
          background: 'rgba(255,255,255,0.9)', color: '#374151',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          fontFamily: 'inherit',
        }}>
          关闭
        </button>
      </div>

      {uploadedUrl && (
        <div style={{ background: 'rgba(8,145,178,0.15)', border: '1px solid rgba(8,145,178,0.4)', borderRadius: 10, padding: '10px 16px', maxWidth: 340, textAlign: 'center' }}>
          <div style={{ color: '#67e8f9', fontSize: 12, marginBottom: 4 }}>✅ 已上传，链接已复制到剪贴板</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, wordBreak: 'break-all', fontFamily: 'monospace' }}>{uploadedUrl}</div>
        </div>
      )}

      <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, margin: 0 }}>长按图片保存 · 或点击按钮下载/上传</p>
      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  );
}

const btnStyle = (ready: boolean, color: string): React.CSSProperties => ({
  padding: '11px 22px', borderRadius: 12, border: 'none',
  background: `linear-gradient(135deg,${color}cc,${color})`,
  color: '#fff', fontSize: 13, fontWeight: 700,
  cursor: ready ? 'pointer' : 'not-allowed',
  opacity: ready ? 1 : 0.45,
  boxShadow: ready ? `0 4px 14px ${color}55` : 'none',
  transition: 'opacity 0.25s',
  fontFamily: 'inherit',
});
