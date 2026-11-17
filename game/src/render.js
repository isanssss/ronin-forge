// Canvas drawing for the battle scene and the shared pieces every screen uses: the night-dojo
// backdrop, panels, buttons' base shapes, bars, floating combat text, banners, the ultimate
// cut-in, and the hero card that menus, summon and results all reuse.

import { COLORS, VIEW } from './config.js';
import { ELEMENTS, RARITIES } from './data.js';
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

/** The night-dojo backdrop: moon, rooftops, a torii, lantern light and drifting petals. */
export function drawBackdrop(ctx, t, opts = {}) {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  sky.addColorStop(0, COLORS.nightTop);
  sky.addColorStop(0.62, '#141a33');
  sky.addColorStop(0.63, '#232038');
  sky.addColorStop(1, COLORS.nightBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // stars (fixed pseudo-random field, twinkling)
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 80; i += 1) {
    const sx = (i * 173 + 41) % VIEW.width;
    const sy = (i * 97 + 13) % 300;
    ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 0.7 + i * 1.7));
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // moon and its halo
  const moonGlow = ctx.createRadialGradient(1090, 108, 10, 1090, 108, 130);
  moonGlow.addColorStop(0, 'rgba(245,240,214,0.5)');
  moonGlow.addColorStop(1, 'rgba(245,240,214,0)');
  ctx.fillStyle = moonGlow;
  ctx.fillRect(950, 0, 280, 260);
  ctx.fillStyle = '#f5f0d6';
  ctx.beginPath();
  ctx.arc(1090, 108, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(210,205,180,0.5)';
  ctx.beginPath();
  ctx.arc(1072, 94, 9, 0, Math.PI * 2);
  ctx.arc(1106, 124, 6, 0, Math.PI * 2);
  ctx.fill();

  // distant roofs and mountains
  ctx.fillStyle = '#11142a';
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

  // the dojo hall, centre-back, windows lit
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

  // torii gate, left
  ctx.fillStyle = '#10122a';
  ctx.fillRect(96, 300, 176, 16);
  ctx.fillRect(112, 340, 144, 12);
  ctx.fillRect(122, 300, 16, 190);
  ctx.fillRect(230, 300, 16, 190);

  // ground: packed earth with plank lines and a stone path to the dojo
  ctx.fillStyle = '#1d1830';
  ctx.fillRect(0, 508, VIEW.width, VIEW.height - 508);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, 552 + i * 44);
    ctx.lineTo(VIEW.width, 552 + i * 44);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(120,110,150,0.16)';
  ctx.beginPath();
  ctx.moveTo(560, 800);
  ctx.lineTo(612, 512);
  ctx.lineTo(668, 512);
  ctx.lineTo(720, 800);
  ctx.closePath();
  ctx.fill();

  // lantern posts with warm flickering light
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

  // drifting petals
  ctx.fillStyle = 'rgba(244,178,194,0.75)';
  for (let i = 0; i < 14; i += 1) {
    const px = ((i * 211 + t * (14 + (i % 5) * 5)) % (VIEW.width + 60)) - 30;
    const py = 120 + ((i * 89 + t * 22) % 560) + Math.sin(t * 1.4 + i * 2.2) * 14;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(t * 1.2 + i);
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (!opts.calm) ctx.globalAlpha = 1;
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
  // name and level
  text(ctx, `${unit.hero.first} · Lv ${unit.hero.level}`, unit.x, by - 6, {
    size: 13, align: 'center', color: isPlayer ? COLORS.parchment : '#e8a0a0', weight: 'bold',
  });
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
}

/** The full battle frame: backdrop, units, floaters, wave banner and ultimate cut-in. */
export function drawBattleScene(ctx, battle, t) {
  ctx.save();
  if (battle.shake > 0.2) {
    const s = battle.shake;
    ctx.translate(Math.sin(t * 91) * s, Math.cos(t * 83) * s * 0.7);
  }
  drawBackdrop(ctx, t);
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

  const portraitH = opts.showStats ? h * 0.46 : h * 0.6;
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

  if (opts.showStats) {
    const s = heroStats(hero);
    cy += 20;
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
