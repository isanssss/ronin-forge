// Canvas drawing for the battle scene and the shared pieces every screen uses: the night-dojo
// backdrop, panels, buttons' base shapes, bars, floating combat text, banners, the ultimate
// cut-in, and the hero card that menus, summon and results all reuse.

import { COLORS, VIEW } from './config.js';
import { ELEMENTS, RARITIES, STATUS_EFFECTS } from './data.js';
import { drawHero, heroStats, xpForNext } from './heroes.js';

export const FONT_DISPLAY = `'Palatino Linotype', 'Book Antiqua', Georgia, serif`;
export const FONT_BODY = `'Segoe UI', Verdana, Geneva, sans-serif`;

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function panel(ctx, x, y, w, h, opts = {}) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, opts.radius ?? 14);
  ctx.fillStyle = opts.fill || COLORS.panel;
  ctx.fill();
  ctx.lineWidth = opts.edgeWidth || 2;
  ctx.strokeStyle = opts.edge || COLORS.panelEdge;
  ctx.stroke();
  ctx.restore();
}

export function text(ctx, str, x, y, opts = {}) {
  ctx.save();
  ctx.font = `${opts.weight || ''} ${opts.size || 18}px ${opts.font || FONT_BODY}`.trim();
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  if (opts.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(str, x + 2, y + 2);
  }
  ctx.fillStyle = opts.color || COLORS.parchment;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** Fit `str` into maxWidth by shrinking the font from `size` down; returns the size used. */
export function textFit(ctx, str, x, y, maxWidth, opts = {}) {
  let size = opts.size || 18;
  ctx.save();
  while (size > 9) {
    ctx.font = `${opts.weight || ''} ${size}px ${opts.font || FONT_BODY}`.trim();
    if (ctx.measureText(str).width <= maxWidth) break;
    size -= 1;
  }
  ctx.restore();
  text(ctx, str, x, y, { ...opts, size });
  return size;
}

export function bar(ctx, x, y, w, h, frac, color, opts = {}) {
  const f = Math.max(0, Math.min(1, frac));
  ctx.save();
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = opts.back || COLORS.barBack;
  ctx.fill();
  if (f > 0) {
    roundRectPath(ctx, x, y, Math.max(h, w * f), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

/** A little faceted gem, the currency icon. */
export function drawGem(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.8, -r * 0.3);
  ctx.lineTo(r * 0.45, r);
  ctx.lineTo(-r * 0.45, r);
  ctx.lineTo(-r * 0.8, -r * 0.3);
  ctx.closePath();
  ctx.fillStyle = '#6ee7ff';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.8, -r * 0.3);
  ctx.lineTo(0, r * 0.1);
  ctx.lineTo(-r * 0.8, -r * 0.3);
  ctx.closePath();
  ctx.fillStyle = '#b8f4ff';
  ctx.fill();
  ctx.restore();
}

/**
 * Per-biome art direction: sky and ground palettes, the ambient particle kind, and the
 * moon's tint. The silhouettes themselves are drawn per biome below.
 */
const BIOME_ART = {
  dojo: {
    skyTop: '#1b2340', skyMid: '#141a33', ground: '#1d1830', groundDeep: '#0a0d1a', hill: '#11142a',
    moon: '#f5f0d6', particle: 'petals', particleColor: 'rgba(244,178,194,0.75)', stars: true,
  },
  bamboo: {
    skyTop: '#17382c', skyMid: '#10241f', ground: '#16241b', groundDeep: '#0a140e', hill: '#0c1d16',
    moon: '#e9f6d8', particle: 'leaves', particleColor: 'rgba(140,220,150,0.7)', stars: true,
  },
  ember: {
    skyTop: '#401824', skyMid: '#2a1016', ground: '#241418', groundDeep: '#120709', hill: '#1c0d12',
    moon: '#ffb054', particle: 'embers', particleColor: 'rgba(255,150,60,0.85)', stars: false,
  },
  frost: {
    skyTop: '#2a3a56', skyMid: '#1d2a40', ground: '#333f55', groundDeep: '#131c2c', hill: '#1a2436',
    moon: '#eef4ff', particle: 'snow', particleColor: 'rgba(240,248,255,0.9)', stars: true,
  },
  court: {
    skyTop: '#271c40', skyMid: '#1a1230', ground: '#221836', groundDeep: '#0d0819', hill: '#150c28',
    moon: '#f5ecd0', particle: 'petals', particleColor: 'rgba(244,178,194,0.75)', stars: true,
  },
  rift: {
    skyTop: '#301848', skyMid: '#200f36', ground: '#211334', groundDeep: '#0e0619', hill: '#170b2a',
    moon: '#c9a6ff', particle: 'motes', particleColor: 'rgba(190,140,255,0.8)', stars: true,
  },
};

/**
 * The backdrop, in the biome of the fight (opts.biome, default the Night Dojo the menus
 * live in): sky, a moon or ember sun or void planet, biome silhouettes, the ground, and
 * ambient particles — petals, leaves, rising embers, snow or rift motes.
 */
export function drawBackdrop(ctx, t, opts = {}) {
  const biomeName = opts.biome || 'dojo';
  const art = BIOME_ART[biomeName] || BIOME_ART.dojo;
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  sky.addColorStop(0, art.skyTop);
  sky.addColorStop(0.62, art.skyMid);
  sky.addColorStop(0.63, art.ground);
  sky.addColorStop(1, art.groundDeep);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // stars (fixed pseudo-random field, twinkling) — the ember sky is too smoked for them
  if (art.stars) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 80; i += 1) {
      const sx = (i * 173 + 41) % VIEW.width;
      const sy = (i * 97 + 13) % 300;
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 0.7 + i * 1.7));
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  drawCelestial(ctx, t, biomeName, art);
  drawSilhouettes(ctx, t, biomeName, art);

  // ground with its biome dressing
  ctx.fillStyle = art.ground;
  ctx.fillRect(0, 508, VIEW.width, VIEW.height - 508);
  if (biomeName === 'dojo' || biomeName === 'court' || biomeName === 'bamboo') {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, 552 + i * 44);
      ctx.lineTo(VIEW.width, 552 + i * 44);
      ctx.stroke();
    }
  }
  if (biomeName === 'dojo' || biomeName === 'court') {
    ctx.fillStyle = 'rgba(120,110,150,0.16)';
    ctx.beginPath();
    ctx.moveTo(560, 800);
    ctx.lineTo(612, 512);
    ctx.lineTo(668, 512);
    ctx.lineTo(720, 800);
    ctx.closePath();
    ctx.fill();
  }
  if (biomeName === 'frost') {
    ctx.fillStyle = 'rgba(240,248,255,0.14)';
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.ellipse(80 + i * 190, 560 + (i % 3) * 74, 90, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (biomeName === 'ember' || biomeName === 'rift') {
    ctx.strokeStyle = biomeName === 'ember' ? 'rgba(255,120,40,0.4)' : 'rgba(170,110,255,0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const cx = 120 + i * 260;
      const cy = 566 + (i % 3) * 66;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 44, cy + 10);
      ctx.lineTo(cx + 74, cy + 4);
      ctx.stroke();
    }
  }

  if (biomeName === 'dojo' || biomeName === 'court') drawLanterns(ctx, t);
  drawParticles(ctx, t, art);
  if (!opts.calm) ctx.globalAlpha = 1;
}

/** The sky's one bright body: a moon, the low ember sun, or the rift's ringed planet. */
function drawCelestial(ctx, t, biomeName, art) {
  if (biomeName === 'ember') {
    const glow = ctx.createRadialGradient(1090, 150, 10, 1090, 150, 190);
    glow.addColorStop(0, 'rgba(255,130,50,0.55)');
    glow.addColorStop(1, 'rgba(255,130,50,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(880, 0, 420, 360);
    ctx.fillStyle = '#ff9a3d';
    ctx.beginPath();
    ctx.arc(1090, 150, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,190,90,0.65)';
    ctx.beginPath();
    ctx.arc(1090, 150, 44, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const moonGlow = ctx.createRadialGradient(1090, 108, 10, 1090, 108, 130);
  moonGlow.addColorStop(0, 'rgba(245,240,214,0.5)');
  moonGlow.addColorStop(1, 'rgba(245,240,214,0)');
  ctx.fillStyle = moonGlow;
  ctx.fillRect(950, 0, 280, 260);
  ctx.fillStyle = art.moon;
  ctx.beginPath();
  ctx.arc(1090, 108, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,120,140,0.35)';
  ctx.beginPath();
  ctx.arc(1072, 94, 9, 0, Math.PI * 2);
  ctx.arc(1106, 124, 6, 0, Math.PI * 2);
  ctx.fill();
  if (biomeName === 'rift') {
    ctx.save();
    ctx.translate(1090, 108);
    ctx.rotate(-0.32);
    ctx.strokeStyle = 'rgba(220,180,255,0.75)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 74, 17, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** The middle distance, per biome: hall and torii, bamboo, shrine and volcano, pines, shards. */
function drawSilhouettes(ctx, t, biomeName, art) {
  if (biomeName === 'bamboo') {
    // layered bamboo: a pale back row, then dark stalks with leaf clusters
    for (let i = 0; i < 16; i += 1) {
      const bx = 20 + i * 82 + ((i * 53) % 30);
      ctx.fillStyle = i % 2 ? '#0e2a1e' : '#0a2016';
      ctx.fillRect(bx, 120 + (i % 4) * 30, 13, 400);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for (let s = 0; s < 4; s += 1) ctx.fillRect(bx, 190 + s * 88 + (i % 4) * 30, 13, 3);
      ctx.fillStyle = '#0e2a1e';
      for (let l = 0; l < 3; l += 1) {
        ctx.save();
        ctx.translate(bx + 7, 170 + l * 96 + (i % 3) * 22);
        ctx.rotate(0.7 + l * 0.5 + (i % 2) * -1.2);
        ctx.beginPath();
        ctx.ellipse(16, 0, 17, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    const mist = ctx.createLinearGradient(0, 420, 0, 520);
    mist.addColorStop(0, 'rgba(190,230,200,0)');
    mist.addColorStop(0.5, 'rgba(190,230,200,0.13)');
    mist.addColorStop(1, 'rgba(190,230,200,0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, 420, VIEW.width, 100);
    return;
  }
  if (biomeName === 'ember') {
    // a volcano cone on the horizon, its rim breathing firelight
    ctx.fillStyle = art.hill;
    ctx.beginPath();
    ctx.moveTo(700, 512);
    ctx.lineTo(960, 268);
    ctx.lineTo(1030, 268);
    ctx.lineTo(1280, 512);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,110,40,${0.5 + 0.25 * Math.sin(t * 2.3)})`;
    ctx.beginPath();
    ctx.ellipse(995, 272, 42, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // the shrine hall, smaller and darker than the dojo, flanked by flame braziers
    ctx.fillStyle = '#160a10';
    ctx.fillRect(330, 396, 330, 114);
    ctx.beginPath();
    ctx.moveTo(306, 400);
    ctx.quadraticCurveTo(495, 336, 684, 400);
    ctx.lineTo(648, 412);
    ctx.quadraticCurveTo(495, 366, 342, 412);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255,140,60,${0.7 + 0.25 * Math.sin(t * 8)})`;
    ctx.fillRect(452, 436, 26, 34);
    ctx.fillRect(512, 436, 26, 34);
    // torii, far left, in cinder red-black
    ctx.fillStyle = '#1d0d10';
    ctx.fillRect(96, 300, 176, 16);
    ctx.fillRect(112, 340, 144, 12);
    ctx.fillRect(122, 300, 16, 190);
    ctx.fillRect(230, 300, 16, 190);
    for (const bx of [240, 760]) {
      ctx.fillStyle = '#160a10';
      ctx.fillRect(bx - 6, 452, 52, 10);
      ctx.fillRect(bx + 14, 462, 12, 44);
      const flick = 0.75 + 0.25 * Math.sin(t * 11 + bx);
      const glow = ctx.createRadialGradient(bx + 20, 440, 4, bx + 20, 440, 66);
      glow.addColorStop(0, `rgba(255,150,60,${0.55 * flick})`);
      glow.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(bx - 46, 374, 132, 132);
      ctx.fillStyle = '#ffb054';
      ctx.beginPath();
      ctx.ellipse(bx + 20, 444, 9, 15 * flick, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (biomeName === 'frost') {
    // jagged ridge with snow-lit peaks, then pines at the edges
    ctx.fillStyle = art.hill;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    ctx.lineTo(150, 330);
    ctx.lineTo(300, 430);
    ctx.lineTo(470, 290);
    ctx.lineTo(650, 420);
    ctx.lineTo(830, 320);
    ctx.lineTo(1010, 440);
    ctx.lineTo(1160, 350);
    ctx.lineTo(1280, 430);
    ctx.lineTo(1280, 512);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(240,248,255,0.75)';
    for (const [px, py] of [[150, 330], [470, 290], [830, 320], [1160, 350]]) {
      ctx.beginPath();
      ctx.moveTo(px - 26, py + 34);
      ctx.lineTo(px, py);
      ctx.lineTo(px + 26, py + 34);
      ctx.lineTo(px + 8, py + 22);
      ctx.lineTo(px, py + 30);
      ctx.lineTo(px - 8, py + 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#101a2a';
    for (const [px, ph] of [[60, 190], [150, 150], [1140, 170], [1225, 210]]) {
      for (let tier = 0; tier < 3; tier += 1) {
        const w = 54 - tier * 13;
        const ty = 512 - ph + tier * (ph / 3.4);
        ctx.beginPath();
        ctx.moveTo(px - w / 2, ty + ph / 3);
        ctx.lineTo(px, ty);
        ctx.lineTo(px + w / 2, ty + ph / 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(px - 3, 512 - ph / 6, 6, ph / 6);
    }
    return;
  }
  if (biomeName === 'rift') {
    // nebula wash and floating shards, adrift on a slow tide
    for (const [nx, ny, nr, hue] of [[300, 150, 130, '150,90,255'], [880, 90, 100, '255,110,200'], [620, 220, 80, '110,140,255']]) {
      const neb = ctx.createRadialGradient(nx, ny, 6, nx, ny, nr);
      neb.addColorStop(0, `rgba(${hue},0.16)`);
      neb.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = neb;
      ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }
    ctx.fillStyle = art.hill;
    for (let i = 0; i < 9; i += 1) {
      const sx = 60 + i * 140 + ((i * 71) % 50);
      const sy = 300 + (i % 4) * 52 + Math.sin(t * 0.6 + i * 1.9) * 9;
      const s = 16 + (i % 3) * 11;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(0.4 + i * 0.7 + Math.sin(t * 0.4 + i) * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = art.hill;
    ctx.fillRect(0, 470, VIEW.width, 42);
    return;
  }
  // dojo and court: distant roofs, the hall, the torii
  ctx.fillStyle = art.hill;
  ctx.beginPath();
  ctx.moveTo(0, 470);
  ctx.lineTo(180, 380);
  ctx.lineTo(360, 450);
  ctx.lineTo(560, 360);
  ctx.lineTo(760, 448);
  ctx.lineTo(980, 372);
  ctx.lineTo(1280, 452);
  ctx.lineTo(1280, 520);
  ctx.lineTo(0, 520);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0c0f22';
  ctx.fillRect(430, 380, 420, 130);
  ctx.beginPath();
  ctx.moveTo(400, 384);
  ctx.quadraticCurveTo(640, 316, 880, 384);
  ctx.lineTo(838, 398);
  ctx.quadraticCurveTo(640, 348, 442, 398);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(255, 190, 92, ${0.75 + 0.2 * Math.sin(t * 7)})`;
  for (let i = 0; i < 5; i += 1) ctx.fillRect(478 + i * 76, 424, 34, 44);
  ctx.fillStyle = '#0c0f22';
  for (let i = 0; i < 5; i += 1) ctx.fillRect(492 + i * 76, 424, 3, 44);
  if (biomeName === 'court') {
    // the warlord's banners: crimson silk, gold crest, hanging either side of the hall
    for (const bx of [368, 862]) {
      ctx.fillStyle = '#7e1f2a';
      ctx.fillRect(bx, 372, 50, 118);
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(bx, 372, 50, 7);
      ctx.beginPath();
      ctx.arc(bx + 25, 414, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7e1f2a';
      ctx.beginPath();
      ctx.arc(bx + 25, 414, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#10122a';
  ctx.fillRect(96, 300, 176, 16);
  ctx.fillRect(112, 340, 144, 12);
  ctx.fillRect(122, 300, 16, 190);
  ctx.fillRect(230, 300, 16, 190);
}

/** Lantern posts with warm flickering light (the dojo and the court). */
function drawLanterns(ctx, t) {
  for (const lx of [56, 1200]) {
    ctx.fillStyle = '#0c0f22';
    ctx.fillRect(lx, 430, 10, 110);
    const flicker = 0.8 + 0.2 * Math.sin(t * 9 + lx);
    const glow = ctx.createRadialGradient(lx + 5, 420, 4, lx + 5, 420, 74);
    glow.addColorStop(0, `rgba(255,176,84,${0.5 * flicker})`);
    glow.addColorStop(1, 'rgba(255,176,84,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lx - 74, 346, 158, 158);
    ctx.fillStyle = '#ffb054';
    roundRectPath(ctx, lx - 8, 402, 26, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#7a4416';
    ctx.fillRect(lx - 10, 398, 30, 6);
    ctx.fillRect(lx - 10, 434, 30, 6);
  }
}

/** Ambient particles: each biome breathes something different into the air. */
function drawParticles(ctx, t, art) {
  ctx.fillStyle = art.particleColor;
  for (let i = 0; i < 14; i += 1) {
    if (art.particle === 'embers') {
      const px = (i * 173 + 60) % VIEW.width + Math.sin(t * 1.6 + i * 2.4) * 12;
      const py = 720 - ((i * 67 + t * (26 + (i % 4) * 9)) % 620);
      ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(t * 3 + i * 1.8));
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (art.particle === 'snow') {
      const px = ((i * 149 + t * 9) % (VIEW.width + 40)) - 20 + Math.sin(t * 0.9 + i * 2.1) * 18;
      const py = ((i * 83 + t * (16 + (i % 3) * 6)) % 700) + 30;
      ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(t * 1.2 + i));
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (art.particle === 'motes') {
      const px = (i * 197 + 40) % VIEW.width + Math.sin(t * 0.7 + i * 1.6) * 22;
      const py = 140 + ((i * 91) % 480) + Math.cos(t * 0.55 + i * 2.3) * 16;
      ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.8 + i * 2.7));
      ctx.beginPath();
      ctx.arc(px, py, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // petals (dojo, court) and leaves (bamboo): flat ellipses on a drifting tumble
      const speed = art.particle === 'leaves' ? 30 : 20;
      const px = ((i * 211 + t * (14 + (i % 5) * 5)) % (VIEW.width + 60)) - 30;
      const py = 120 + ((i * 89 + t * speed) % 560) + Math.sin(t * 1.4 + i * 2.2) * 14;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 1.2 + i);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** One combatant: portrait, lunge/flash animation, HP and ultimate gauges, name plate. */
function drawUnit(ctx, battle, unit, t) {
  if (!unit.alive && unit.deathT > 1.1) return;
  const isPlayer = unit.side === 'player';
  const boss = unit.hero.boss;
  const scale = boss ? 1.5 : 1.04;
  let dx = 0;
  if (unit.lungeT > 0) {
    const progress = 1 - unit.lungeT / 0.28;
    dx = Math.sin(progress * Math.PI) * 52 * (isPlayer ? 1 : -1);
  }
  const pose = !unit.alive ? 'down' : unit.lungeT > 0.08 ? 'attack' : 'idle';
  const flash = unit.flashT > 0 ? unit.flashT / 0.22 : 0;

  // cast glow under a ranged attacker or healer as they act
  if (unit.castT > 0 && unit.alive) {
    ctx.save();
    ctx.globalAlpha = unit.castT * 1.4;
    ctx.fillStyle = ELEMENTS[unit.hero.element].color;
    ctx.beginPath();
    ctx.ellipse(unit.x, unit.y + 4, 44, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawHero(ctx, unit.hero, unit.x + dx, unit.y, scale, {
    t,
    flip: !isPlayer,
    flash,
    pose,
    alpha: unit.alive ? 1 : Math.max(0, 1 - unit.deathT * 0.4),
  });

  if (!unit.alive) return;
  const w = boss ? 128 : 88;
  const bx = unit.x - w / 2;
  const by = unit.y - (boss ? 218 : 152);
  // name and level — the boss carries its full grand name, fitted to a wide measure
  if (boss) {
    textFit(ctx, `${unit.hero.name} · Lv ${unit.hero.level}`, unit.x, by - 6, 320, {
      size: 13, align: 'center', color: '#ff9d5c', weight: 'bold', family: FONT_BODY,
    });
  } else {
    text(ctx, `${unit.hero.first} · Lv ${unit.hero.level}`, unit.x, by - 6, {
      size: 13, align: 'center', color: isPlayer ? COLORS.parchment : '#e8a0a0', weight: 'bold',
    });
  }
  const hpFrac = unit.hp / unit.maxHp;
  bar(ctx, bx, by, w, 10, hpFrac, hpFrac > 0.3 ? COLORS.hpGreen : COLORS.hpLow);
  text(ctx, `${Math.ceil(unit.hp)}`, unit.x, by + 9.5, { size: 10, align: 'center', color: '#ffffff', weight: 'bold' });
  // ultimate gauge: full and pulsing means ready (for enemies, a warning)
  const ultFrac = unit.ult / 100;
  const ready = ultFrac >= 1;
  bar(ctx, bx, by + 13, w, 6, ultFrac, ready ? '#fff3b0' : COLORS.ultYellow, { back: 'rgba(0,0,0,0.55)' });
  if (ready) {
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 8);
    ctx.strokeStyle = COLORS.ultYellow;
    ctx.lineWidth = 2;
    roundRectPath(ctx, bx - 2, by + 11, w + 4, 10, 5);
    ctx.stroke();
    ctx.restore();
  }
  // status pips: one small disc per active effect, glyph lettered, under the ult bar
  if (unit.statuses && unit.statuses.length > 0) {
    const pipR = 6.5;
    const totalW = unit.statuses.length * (pipR * 2 + 3) - 3;
    let px = unit.x - totalW / 2 + pipR;
    for (const s of unit.statuses) {
      const def = STATUS_EFFECTS[s.kind];
      if (!def) continue;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(px, by + 30, pipR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      text(ctx, def.glyph, px, by + 30, { size: 8.5, weight: 800, align: 'center', color: '#14101c' });
      px += pipR * 2 + 3;
    }
  }
}

/**
 * The ultimate spectacle: one element, one full-field moment, drawn over the units.
 * Fire blooms in rings over its victims, Lightning calls bolts out of the sky, Water
 * sweeps a wave across the field, Earth throws spikes up under every target, and Wind
 * writes three slash arcs across each. Alpha swells in fast and drains away.
 */
function drawUltFx(ctx, fx) {
  const targets = (fx.targets || []).filter((u) => u && u.x !== undefined);
  if (targets.length === 0) return;
  const color = ELEMENTS[fx.element] ? ELEMENTS[fx.element].color : '#ffffff';
  const p = Math.min(1, fx.t / fx.dur);
  const alpha = p < 0.25 ? p / 0.25 : 1 - Math.max(0, (p - 0.5) / 0.5);
  const cx = targets.reduce((sum, u) => sum + u.x, 0) / targets.length;
  const cy = targets.reduce((sum, u) => sum + u.y, 0) / targets.length - 70;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  if (fx.element === 'Fire') {
    const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 190 * p + 30);
    glow.addColorStop(0, 'rgba(255,170,60,0.5)');
    glow.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 230, cy - 230, 460, 460);
    ctx.strokeStyle = color;
    for (let ring = 0; ring < 3; ring += 1) {
      const rp = Math.max(0, p - ring * 0.12);
      ctx.globalAlpha = Math.max(0, alpha * (1 - rp * 0.6));
      ctx.lineWidth = 5 - ring;
      ctx.beginPath();
      ctx.arc(cx, cy, 24 + rp * 170, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (fx.element === 'Lightning') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    targets.forEach((u, i) => {
      const j = Math.floor(fx.t * 18) + i * 7;
      const off = (n) => (((j * 37 + n * 53) % 41) - 20);
      ctx.beginPath();
      ctx.moveTo(u.x + off(0), 36);
      ctx.lineTo(u.x + off(1) * 0.6, u.y - 130);
      ctx.lineTo(u.x + off(2) * 0.35, u.y - 66);
      ctx.lineTo(u.x, u.y - 8);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(u.x, u.y - 4, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (fx.element === 'Water') {
    const sweepX = -160 + p * (VIEW.width + 320);
    ctx.fillStyle = 'rgba(110,190,255,0.30)';
    ctx.beginPath();
    ctx.moveTo(sweepX - 150, 800);
    ctx.lineTo(sweepX - 60, 300);
    ctx.quadraticCurveTo(sweepX + 30, 260, sweepX + 90, 320);
    ctx.lineTo(sweepX + 170, 800);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sweepX - 60, 300);
    ctx.quadraticCurveTo(sweepX + 30, 260, sweepX + 90, 320);
    ctx.stroke();
    ctx.fillStyle = color;
    for (const u of targets) {
      ctx.beginPath();
      ctx.ellipse(u.x, u.y - 60, 20 + p * 16, 8 + p * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (fx.element === 'Earth') {
    const grow = Math.sin(Math.PI * Math.min(1, p * 1.4));
    ctx.fillStyle = color;
    for (const u of targets) {
      for (let s = -1; s <= 1; s += 1) {
        const h = (s === 0 ? 86 : 54) * grow;
        ctx.beginPath();
        ctx.moveTo(u.x + s * 26 - 11, u.y + 6);
        ctx.lineTo(u.x + s * 26, u.y + 6 - h);
        ctx.lineTo(u.x + s * 26 + 11, u.y + 6);
        ctx.closePath();
        ctx.fill();
      }
    }
  } else if (fx.element === 'Wind') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    for (const u of targets) {
      for (let s = 0; s < 3; s += 1) {
        const r = 34 + s * 17;
        const start = -2.4 + p * 1.1 + s * 0.5;
        ctx.beginPath();
        ctx.arc(u.x, u.y - 62, r, start, start + 1.5);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** The full battle frame: backdrop, units, floaters, wave banner and ultimate cut-in. */
export function drawBattleScene(ctx, battle, t) {
  ctx.save();
  if (battle.shake > 0.2) {
    const s = battle.shake;
    ctx.translate(Math.sin(t * 91) * s, Math.cos(t * 83) * s * 0.7);
  }
  drawBackdrop(ctx, t, { biome: battle.biome });
  const sorted = [...battle.units].sort((a, b) => a.y - b.y);
  for (const unit of sorted) drawUnit(ctx, battle, unit, t);

  // floating combat text
  for (const f of battle.floaters) {
    const a = 1 - f.t / f.dur;
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, f.text, f.x, f.y - f.t * 52, {
      size: f.size, align: 'center', color: f.color, weight: 'bold', font: FONT_DISPLAY,
    });
    ctx.restore();
  }

  // wave banner
  if (battle.banner) {
    const b = battle.banner;
    const a = b.t < 0.2 ? b.t / 0.2 : b.t > b.dur - 0.3 ? Math.max(0, (b.dur - b.t) / 0.3) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,10,24,0.55)';
    ctx.fillRect(0, 168, VIEW.width, 84);
    text(ctx, b.text, VIEW.width / 2, 224, {
      size: 40, align: 'center', color: COLORS.gold, weight: 'bold', font: FONT_DISPLAY,
    });
    ctx.restore();
  }

  // ultimate cut-in: dark bands, a big portrait, the technique's name in lights
  if (battle.cutin) {
    const c = battle.cutin;
    const unit = c.unit;
    const inT = Math.min(1, c.t / 0.16);
    const outT = c.t > c.dur - 0.25 ? Math.max(0, (c.dur - c.t) / 0.25) : 1;
    const a = Math.min(inT, outT);
    const fromLeft = unit.side === 'player';
    const slide = (1 - inT) * 130 * (fromLeft ? -1 : 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,6,16,0.72)';
    ctx.fillRect(0, 250, VIEW.width, 300);
    ctx.fillStyle = ELEMENTS[unit.hero.element].color;
    ctx.fillRect(0, 250, VIEW.width, 4);
    ctx.fillRect(0, 546, VIEW.width, 4);
    const px = fromLeft ? 210 + slide : VIEW.width - 210 + slide;
    drawHero(ctx, unit.hero, px, 520, 2.1, { t, flip: !fromLeft, pose: 'attack' });
    const tx = fromLeft ? 380 : VIEW.width - 380;
    text(ctx, unit.hero.ult.name, tx, 392, {
      size: 47, align: fromLeft ? 'left' : 'right', color: '#ffffff', weight: 'bold', font: FONT_DISPLAY,
    });
    text(ctx, `${unit.hero.name}`, tx, 432, {
      size: 20, align: fromLeft ? 'left' : 'right', color: RARITIES[unit.hero.rarity].color, weight: 'bold',
    });
    text(ctx, unit.hero.ult.desc, tx, 466, {
      size: 17, align: fromLeft ? 'left' : 'right', color: COLORS.parchmentDim,
    });
    ctx.restore();
  }

  // the ultimate's element spectacle plays over everything, cut-in included
  if (battle.ultFx) drawUltFx(ctx, battle.ultFx);
  ctx.restore();
}

/**
 * The hero card used by Home, Formation, Summon and Results: rarity-framed, portrait on top,
 * name, element/class line, and (with showStats) the four stats and an XP bar.
 */
export function drawHeroCard(ctx, hero, x, y, w, h, opts = {}) {
  const rarity = RARITIES[hero.rarity];
  ctx.save();
  if (opts.dim) ctx.globalAlpha = 0.45;
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.fillStyle = opts.fill || 'rgba(20,24,46,0.92)';
  ctx.fill();
  ctx.lineWidth = opts.selected ? 4 : 2;
  ctx.strokeStyle = opts.selected ? COLORS.gold : rarity.color;
  ctx.stroke();

  const portraitH = opts.showStats ? h * 0.42 : (hero.passive ? h * 0.52 : h * 0.6);
  // portrait backdrop tinted by element
  ctx.save();
  roundRectPath(ctx, x + 6, y + 6, w - 12, portraitH - 6, 9);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, y, 0, y + portraitH);
  grad.addColorStop(0, ELEMENTS[hero.element].deep);
  grad.addColorStop(1, '#141830');
  ctx.fillStyle = grad;
  ctx.fillRect(x + 6, y + 6, w - 12, portraitH);
  drawHero(ctx, hero, x + w / 2, y + portraitH - 2, (portraitH / 132) * (hero.boss ? 1.25 : 1), { t: opts.t || 0 });
  ctx.restore();

  let cy = y + portraitH + 19;
  textFit(ctx, hero.name, x + w / 2, cy, w - 14, {
    size: 16, align: 'center', weight: 'bold', color: COLORS.parchment, font: FONT_DISPLAY,
  });
  cy += 19;
  text(ctx, `${hero.rarity} · Lv ${hero.level}`, x + w / 2, cy, {
    size: 13, align: 'center', color: rarity.color, weight: 'bold',
  });
  cy += 18;
  // element chip and class
  const el = ELEMENTS[hero.element];
  ctx.fillStyle = el.color;
  ctx.beginPath();
  ctx.arc(x + w / 2 - 52, cy - 4, 7, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, `${hero.element} ${hero.cls}`, x + w / 2 - 40, cy, { size: 13, color: COLORS.parchmentDim });

  // the hero's passive trait, in gold under the element line
  if (hero.passive) {
    cy += 16;
    textFit(ctx, `✦ ${hero.passive.name}`, x + w / 2, cy, w - 14, {
      size: 12, align: 'center', weight: 'bold', color: '#ffd94d',
    });
  }

  if (opts.showStats) {
    const s = heroStats(hero);
    cy += 18;
    const stats = [['HP', s.maxHp], ['ATK', s.atk], ['DEF', s.def], ['SPD', s.spd]];
    stats.forEach(([label, value], i) => {
      const sx = x + 14 + (i % 2) * ((w - 20) / 2);
      const sy = cy + Math.floor(i / 2) * 17;
      text(ctx, `${label} ${value}`, sx, sy, { size: 13, color: COLORS.parchment });
    });
    cy += 40;
    bar(ctx, x + 12, cy, w - 24, 6, hero.xp / xpForNext(hero.level), COLORS.azure);
    text(ctx, `XP ${hero.xp}/${xpForNext(hero.level)}`, x + w / 2, cy + 20, {
      size: 11, align: 'center', color: COLORS.parchmentDim,
    });
  }
  ctx.restore();
}
