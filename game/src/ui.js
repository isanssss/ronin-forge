// Every screen and every interaction: Title, Home, stage select, Summon, Formation, the battle
// HUD and the results screen. The UI owns the GameState and the current Battle, routes mouse
// and keyboard input, turns battle events into sounds, and applies rewards when a battle ends.
// Buttons are declared while drawing (each registers its hit-box for the next click), which
// keeps layout and behaviour in one place per screen.

import { COLORS, ECONOMY, VIEW } from './config.js';
import { STAGE_MODIFIERS, STAGE_NAMES, STAGE_TIPS } from './data.js';
import { Battle } from './battle.js';
import { GameState } from './state.js';
import { Rng } from './random.js';
import { drawHero, generateHero } from './heroes.js';
import { GEAR_SLOTS, SLOT_LABELS, describeGear, gearById } from './gear.js';
import {
  FONT_BODY, FONT_DISPLAY, bar, drawBackdrop, drawBattleScene, drawGem, drawHeroCard, panel, roundRectPath, text, textFit,
} from './render.js';

const SUB_SCREENS = ['stages', 'summon', 'formation'];

export class UI {
  constructor(audio) {
    this.audio = audio;
    this.S = GameState.loadOrNew();
    this.screen = 'title';
    this.buttons = [];
    this.mouse = { x: -1, y: -1 };
    this.t = 0;
    this.battle = null;
    this.battleStage = 1;
    this.battleEndless = false;
    this.speed = 1;
    this.paused = false;
    this.result = null;
    this.resultApplied = false;
    this.endTimer = 0;
    this.summon = null;
    this.rosterPage = 0;
    this.toast = null;
    this.confirmReset = false;
    this.shotMode = false;
    this.shotTeam = null;
    // the posing team on the title screen: a fixed, handsome lineup
    const rng = new Rng(20261);
    const rarities = ['Rare', 'Epic', 'Legendary', 'Rare', 'Epic'];
    const classes = ['Blade', 'Guardian', 'Assassin', 'Caster', 'Medic'];
    this.titleTeam = classes.map((cls, i) => {
      const hero = generateHero(rng, { cls, rarity: rarities[i] });
      hero.level = 9;
      return hero;
    });
  }

  // --- input plumbing -----------------------------------------------------------------------

  btn(x, y, w, h, label, action, opts = {}) {
    const disabled = Boolean(opts.disabled);
    this.buttons.push({ x, y, w, h, action, disabled });
    const hover = !disabled && this.mouse.x >= x && this.mouse.x <= x + w && this.mouse.y >= y && this.mouse.y <= y + h;
    const ctx = this.ctx;
    ctx.save();
    if (disabled) ctx.globalAlpha = 0.42;
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fillStyle = opts.fill || (hover ? '#2c3560' : 'rgba(22,27,52,0.92)');
    ctx.fill();
    ctx.lineWidth = hover ? 3 : 2;
    ctx.strokeStyle = opts.edge || (hover ? COLORS.gold : COLORS.panelEdge);
    ctx.stroke();
    textFit(ctx, label, x + w / 2, y + h / 2 + (opts.size || 18) * 0.36, w - 16, {
      size: opts.size || 18, align: 'center', weight: 'bold',
      color: opts.color || COLORS.parchment, font: opts.font || FONT_DISPLAY, shadow: false,
    });
    ctx.restore();
  }

  onClick(x, y) {
    this.audio.unlock();
    for (let i = this.buttons.length - 1; i >= 0; i -= 1) {
      const b = this.buttons[i];
      if (b.disabled) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.audio.click();
        b.action();
        return true;
      }
    }
    return false;
  }

  onKey(key) {
    this.audio.unlock();
    if (key === 'm' || key === 'M') {
      this.audio.setMuted(!this.audio.muted);
      return;
    }
    if (this.screen === 'battle') {
      if (key >= '1' && key <= '5') {
        if (this.battle && this.battle.tryUlt(Number(key) - 1)) this.audio.ult();
      } else if (key === ' ') {
        this.paused = !this.paused;
      } else if (key === 'Escape') {
        this.paused = !this.paused;
      }
      return;
    }
    if (key === 'Escape') {
      if (SUB_SCREENS.includes(this.screen) || this.screen === 'result') this.screen = 'home';
      else if (this.screen === 'home') this.screen = 'title';
    }
    if (this.screen === 'title' && (key === 'Enter' || key === ' ')) this.screen = 'home';
  }

  showToast(message) {
    this.toast = { text: message, t: 0, dur: 2.4 };
  }

  // --- battle lifecycle -----------------------------------------------------------------------

  startBattle(stage, endless) {
    const team = this.S.teamHeroes();
    if (team.length === 0) {
      this.showToast('Your team is empty — add heroes in Formation first.');
      this.screen = 'formation';
      return;
    }
    const rng = new Rng(((Date.now() % 90000) + stage * 131 + (endless ? 777 : 0)) >>> 0);
    this.battle = new Battle({ team, stage, endless, rng });
    this.battleStage = stage;
    this.battleEndless = endless;
    this.speed = 1;
    this.paused = false;
    this.result = null;
    this.resultApplied = false;
    this.endTimer = 0;
    this.screen = 'battle';
    if (this.battle.modifier) this.showToast(this.battle.modifier.desc);
  }

  applyBattleEnd() {
    const b = this.battle;
    let result = b.rewards;
    if (!result) {
      result = { won: false, fled: true, endless: b.endless, stage: b.stage, waves: b.wavesCleared, gems: 0, xpGains: [] };
    }
    this.S.gems += result.gems;
    if (result.endless) {
      if (result.waves > this.S.endlessBest) {
        this.S.endlessBest = result.waves;
        result.isBest = true;
      }
    } else if (result.won && b.stage > this.S.cleared) {
      this.S.cleared = b.stage;
      result.newClear = true;
    }
    // a dropped piece joins the inventory — unless it is already owned anywhere, in
    // which case it is salvaged into gems on the spot
    if (result.gear) {
      const item = gearById(result.gear);
      if (item) {
        if (this.S.ownsGear(item.id)) {
          this.S.gems += item.salvage;
          result.gearSalvaged = item;
        } else {
          this.S.inventory.push(item.id);
          result.gearFound = item;
        }
      }
    }
    this.S.save();
    this.result = result;
    if (result.won) this.audio.victory();
    else if (!result.fled) this.audio.defeat();
    if (result.xpGains.some((g) => g.levels > 0)) this.audio.levelup();
    this.screen = 'result';
  }

  drainBattleEvents() {
    if (!this.battle) return;
    const played = new Set();
    for (const ev of this.battle.events) {
      if (played.has(ev.type)) continue;
      played.add(ev.type);
      if (ev.type === 'hit' || ev.type === 'death') this.audio.hit();
      else if (ev.type === 'crit') this.audio.crit();
      else if (ev.type === 'skill') this.audio.skill();
      else if (ev.type === 'ult') this.audio.ult();
      else if (ev.type === 'heal') this.audio.heal();
      else if (ev.type === 'buff' || ev.type === 'status') this.audio.buff();
      else if (ev.type === 'secondwind') this.audio.levelup();
    }
    this.battle.events.length = 0;
  }

  // --- per-frame update -------------------------------------------------------------------------

  update(dt) {
    this.t += dt;
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t > this.toast.dur) this.toast = null;
    }
    if (this.summon && this.summon.phase === 'reveal') {
      this.summon.t += dt;
      if (this.summon.t > 0.95) this.summon.phase = 'shown';
    }
    if (this.screen === 'battle' && this.battle && !this.shotMode) {
      // The engine gates combat by its own state, so updating after the end only ages
      // floaters, banners and the cut-in while the results are prepared.
      if (!this.paused) this.battle.update(dt * this.speed);
      this.drainBattleEvents();
      const ended = ['won', 'lost', 'fled'].includes(this.battle.state);
      if (ended && !this.resultApplied) {
        this.endTimer += dt;
        if (this.endTimer > 1.15) {
          this.resultApplied = true;
          this.applyBattleEnd();
        }
      }
    }
  }

  // --- drawing ------------------------------------------------------------------------------------

  draw(ctx) {
    this.ctx = ctx;
    this.buttons = [];
    if (this.screen === 'battle' && this.battle) this.drawBattle();
    else if (this.screen === 'title') this.drawTitle();
    else if (this.screen === 'home') this.drawHome();
    else if (this.screen === 'stages') this.drawStages();
    else if (this.screen === 'summon') this.drawSummon();
    else if (this.screen === 'formation') this.drawFormation();
    else if (this.screen === 'result') this.drawResult();
    if (this.toast) this.drawToast();
    if (this.confirmReset) this.drawConfirmReset();
  }

  drawToast() {
    const ctx = this.ctx;
    const a = this.toast.t > this.toast.dur - 0.4 ? (this.toast.dur - this.toast.t) / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    const w = 560;
    panel(ctx, VIEW.width / 2 - w / 2, 706, w, 48, { fill: 'rgba(30,16,20,0.94)', edge: COLORS.crimson });
    textFit(ctx, this.toast.text, VIEW.width / 2, 737, w - 30, { size: 17, align: 'center', color: '#ffd9d9' });
    ctx.restore();
  }

  drawTopBar(title) {
    const ctx = this.ctx;
    text(ctx, title, 36, 52, { size: 30, weight: 'bold', color: COLORS.gold, font: FONT_DISPLAY });
    // gems pill
    panel(ctx, 986, 20, 160, 44, { radius: 22 });
    drawGem(ctx, 1012, 42, 12);
    text(ctx, `${this.S.gems}`, 1034, 50, { size: 20, weight: 'bold', color: '#b8f4ff' });
    this.btn(1158, 20, 92, 44, this.audio.muted ? '♪ Off' : '♪ On', () => this.audio.setMuted(!this.audio.muted), { size: 15 });
  }

  backButton() {
    this.btn(36, 706, 130, 52, '← Back', () => { this.screen = 'home'; });
  }

  // --- title ---------------------------------------------------------------------------------------

  drawTitle() {
    const ctx = this.ctx;
    drawBackdrop(ctx, this.t, { calm: true });
    const team = this.shotTeam || this.titleTeam;
    team.forEach((hero, i) => {
      const x = 300 + i * 170;
      drawHero(ctx, hero, x, 668, 1.32, { t: this.t, pose: 'idle' });
    });
    // logo
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold 96px ${FONT_DISPLAY}`;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText('RONIN FORGE', VIEW.width / 2 + 4, 190 + 4);
    const grad = ctx.createLinearGradient(0, 100, 0, 196);
    grad.addColorStop(0, '#ffe9a8');
    grad.addColorStop(0.55, COLORS.gold);
    grad.addColorStop(1, COLORS.goldDeep);
    ctx.fillStyle = grad;
    ctx.fillText('RONIN FORGE', VIEW.width / 2, 190);
    ctx.restore();
    text(ctx, 'R A N D O M   H E R O   A R E N A', VIEW.width / 2, 238, {
      size: 22, align: 'center', color: COLORS.parchment, weight: 'bold',
    });
    text(ctx, 'Every hero is rolled from fate: name, element, class and destiny. Forge a team of five,', VIEW.width / 2, 292, { size: 17, align: 'center', color: COLORS.parchmentDim });
    text(ctx, 'storm ten stages of the shadow clan, and time your ultimates to turn the tide.', VIEW.width / 2, 318, { size: 17, align: 'center', color: COLORS.parchmentDim });

    const hasProgress = this.S.cleared > 0 || this.S.roster.length > ECONOMY.starterHeroes;
    this.btn(490, 356, 300, 62, hasProgress ? 'Continue' : 'Play', () => { this.screen = 'home'; }, { size: 24 });
    this.btn(490, 434, 300, 52, 'New Game', () => { this.confirmReset = true; }, { size: 19 });
    this.btn(490, 500, 300, 52, this.audio.muted ? 'Sound: Off' : 'Sound: On', () => this.audio.setMuted(!this.audio.muted), { size: 19 });
    text(ctx, 'Mouse or keyboard · 1-5 fire ultimates · Space pauses · M mutes', VIEW.width / 2, 762, {
      size: 14, align: 'center', color: 'rgba(203,191,163,0.7)',
    });
  }

  drawConfirmReset() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(4,5,12,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(ctx, 390, 290, 500, 220, { fill: 'rgba(18,14,28,0.97)', edge: COLORS.crimson });
    text(ctx, 'Start over?', VIEW.width / 2, 348, { size: 28, align: 'center', weight: 'bold', color: '#ffd9d9', font: FONT_DISPLAY });
    text(ctx, 'Your roster, gems and stage progress', VIEW.width / 2, 388, { size: 16, align: 'center', color: COLORS.parchmentDim });
    text(ctx, 'will be wiped and a new forge lit.', VIEW.width / 2, 412, { size: 16, align: 'center', color: COLORS.parchmentDim });
    ctx.restore();
    this.btn(430, 440, 190, 50, 'Yes, wipe it', () => {
      GameState.wipe();
      this.S = GameState.loadOrNew();
      this.confirmReset = false;
      this.screen = 'home';
    }, { edge: COLORS.crimson, size: 17 });
    this.btn(660, 440, 190, 50, 'Keep my game', () => { this.confirmReset = false; }, { size: 17 });
  }

  // --- home ------------------------------------------------------------------------------------------

  drawHome() {
    const ctx = this.ctx;
    drawBackdrop(ctx, this.t, { calm: true });
    this.drawTopBar('Home Camp');
    const S = this.S;
    text(ctx, `Stage progress: ${S.cleared} of 10 cleared${S.endlessBest > 0 ? ` · Endless best: wave ${S.endlessBest}` : ''} · Roster: ${S.roster.length} heroes`, 36, 88, { size: 16, color: COLORS.parchmentDim });

    // team cards
    text(ctx, 'Your Team', 36, 138, { size: 20, weight: 'bold', color: COLORS.parchment, font: FONT_DISPLAY });
    const team = S.teamHeroes();
    for (let i = 0; i < ECONOMY.teamSize; i += 1) {
      const x = 36 + i * 178;
      const y = 154;
      if (team[i]) {
        drawHeroCard(ctx, team[i].hero, x, y, 164, 268, { t: this.t, showStats: true });
        text(ctx, team[i].row === 'front' ? 'FRONT' : 'BACK', x + 82, y + 292, {
          size: 13, align: 'center', color: team[i].row === 'front' ? '#ffb054' : '#8fd0ff', weight: 'bold',
        });
      } else {
        panel(ctx, x, y, 164, 268, { fill: 'rgba(14,17,34,0.6)', edge: 'rgba(58,68,112,0.6)' });
        text(ctx, 'Empty slot', x + 82, y + 128, { size: 15, align: 'center', color: COLORS.parchmentDim });
        text(ctx, 'fill it in', x + 82, y + 150, { size: 13, align: 'center', color: COLORS.parchmentDim });
        text(ctx, 'Formation', x + 82, y + 168, { size: 13, align: 'center', color: COLORS.parchmentDim });
      }
    }

    // main actions
    const bx = 956;
    this.btn(bx, 154, 288, 74, '⚔  Battle', () => { this.screen = 'stages'; }, { size: 24, edge: COLORS.gold });
    this.btn(bx, 242, 288, 62, `✦  Summon  ·  ${ECONOMY.summonCost} gems`, () => { this.screen = 'summon'; this.summon = null; }, { size: 19 });
    this.btn(bx, 318, 288, 62, '▦  Formation', () => { this.screen = 'formation'; }, { size: 19 });
    this.btn(bx, 394, 288, 62, S.endlessUnlocked ? '∞  Endless Mode' : '∞  Endless (clear stage 10)', () => {
      if (S.endlessUnlocked) this.startBattle(10, true);
    }, { size: 17, disabled: !S.endlessUnlocked });
    text(ctx, 'Forge wisdom', bx, 510, { size: 16, weight: 'bold', color: COLORS.gold, font: FONT_DISPLAY });
    const tip = STAGE_TIPS[Math.floor(this.t / 7) % STAGE_TIPS.length];
    this.wrapText(tip, bx, 536, 288, 19, { size: 14, color: COLORS.parchmentDim });

    this.btn(36, 706, 170, 52, 'Reset Save', () => { this.confirmReset = true; }, { size: 16, edge: COLORS.crimson });
    this.btn(1074, 706, 170, 52, 'Title', () => { this.screen = 'title'; }, { size: 16 });
  }

  wrapText(str, x, y, maxWidth, lineHeight, opts) {
    const ctx = this.ctx;
    const words = str.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      ctx.save();
      ctx.font = `${opts.size || 15}px ${FONT_BODY}`;
      const wide = ctx.measureText(trial).width;
      ctx.restore();
      if (wide > maxWidth && line) {
        text(ctx, line, x, cy, opts);
        line = word;
        cy += lineHeight;
      } else line = trial;
    }
    if (line) text(ctx, line, x, cy, opts);
  }

  // --- stage select -------------------------------------------------------------------------------------

  drawStages() {
    const ctx = this.ctx;
    drawBackdrop(ctx, this.t, { calm: true });
    this.drawTopBar('Choose a Stage');
    text(ctx, 'Three waves each. A warlord waits at the end of stages 5 and 10.', 36, 92, { size: 16, color: COLORS.parchmentDim });
    for (let i = 0; i < 10; i += 1) {
      const stage = i + 1;
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 36 + col * 246;
      const y = 122 + row * 196;
      const w = 224;
      const h = 168;
      const unlocked = this.S.stageUnlocked(stage);
      const cleared = stage <= this.S.cleared;
      const boss = stage === 5 || stage === 10;
      panel(ctx, x, y, w, h, {
        fill: unlocked ? 'rgba(22,27,52,0.92)' : 'rgba(12,14,28,0.85)',
        edge: cleared ? COLORS.jade : boss ? COLORS.crimson : COLORS.panelEdge,
      });
      text(ctx, `Stage ${stage}`, x + 18, y + 40, { size: 22, weight: 'bold', color: unlocked ? COLORS.parchment : 'rgba(203,191,163,0.4)', font: FONT_DISPLAY });
      textFit(ctx, STAGE_NAMES[i], x + 18, y + 68, w - 36, { size: 16, color: unlocked ? COLORS.parchmentDim : 'rgba(203,191,163,0.35)' });
      const modifier = STAGE_MODIFIERS[stage];
      if (modifier) {
        text(ctx, `◈ ${modifier.name}`, x + 18, y + 94, { size: 13, weight: 'bold', color: '#ffd94d' });
        textFit(ctx, modifier.short, x + 18, y + 112, w - 36, { size: 11, color: COLORS.parchmentDim });
      }
      const bossY = modifier ? y + 136 : y + 100;
      const statusY = modifier ? y + 150 : y + 128;
      if (boss) text(ctx, '☠ BOSS', x + 18, bossY, { size: 15, weight: 'bold', color: COLORS.crimson });
      if (cleared) text(ctx, '✓ Cleared', x + 18, statusY, { size: 15, weight: 'bold', color: COLORS.jade });
      else if (!unlocked) text(ctx, 'Locked — clear the stage before', x + 18, statusY, { size: 13, color: 'rgba(203,191,163,0.4)' });
      else if (!modifier) text(ctx, 'Enemy strength rises…', x + 18, statusY, { size: 13, color: COLORS.parchmentDim });
      if (unlocked) {
        this.buttons.push({ x, y, w, h, disabled: false, action: () => this.startBattle(stage, false) });
      }
    }
    if (this.S.endlessUnlocked) {
      this.btn(36, 540, 400, 58, '∞  Endless Mode — how long can you stand?', () => this.startBattle(10, true), { size: 17, edge: COLORS.violet });
      text(ctx, `Best: wave ${this.S.endlessBest}`, 452, 577, { size: 16, color: COLORS.parchmentDim });
    }
    this.backButton();
  }

  // --- summon --------------------------------------------------------------------------------------------

  drawSummon() {
    const ctx = this.ctx;
    drawBackdrop(ctx, this.t, { calm: true });
    this.drawTopBar('The Summoning Forge');
    const S = this.S;

    // the forge circle
    const cx = 640;
    const cy = 330;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t * 0.15);
    ctx.strokeStyle = 'rgba(245,197,66,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 128, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(-this.t * 0.3);
    ctx.strokeStyle = 'rgba(110,231,255,0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, 102, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + this.t * 0.3;
      ctx.fillStyle = 'rgba(245,197,66,0.8)';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 102, Math.sin(a) * 102, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const revealing = this.summon && this.summon.phase === 'reveal';
    if (revealing) {
      const p = this.summon.t / 0.95;
      const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 190 * p + 30);
      glow.addColorStop(0, 'rgba(255,244,190,0.85)');
      glow.addColorStop(1, 'rgba(255,244,190,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 240, cy - 240, 480, 480);
    }

    if (this.summon && this.summon.result) {
      const { result } = this.summon;
      const hero = result.hero;
      const shown = this.summon.phase === 'shown';
      const scaleIn = shown ? 1 : 0.6 + 0.4 * (this.summon.t / 0.95);
      ctx.save();
      ctx.translate(cx, cy + 150);
      ctx.scale(scaleIn, scaleIn);
      ctx.translate(-cx, -(cy + 150));
      drawHeroCard(ctx, hero, cx - 130, cy - 118, 260, 330, { t: this.t, showStats: true });
      ctx.restore();
      if (shown) {
        if (result.merged) {
          text(ctx, `✦ Spirit Merge! ${hero.first} returns — and rises to level ${hero.level}!`, cx, 616, {
            size: 20, align: 'center', weight: 'bold', color: COLORS.gold, font: FONT_DISPLAY,
          });
        } else {
          text(ctx, hero.rarity === 'Legendary' ? '✦ A LEGEND is forged! ✦' : `A new hero joins the forge: ${hero.rarity}!`, cx, 616, {
            size: 20, align: 'center', weight: 'bold', color: '#ffe9a8', font: FONT_DISPLAY,
          });
        }
        textFit(ctx, `"${hero.skill.name}" · Ultimate: ${hero.ult.name}`, cx, 644, 700, { size: 15, align: 'center', color: COLORS.parchmentDim });
      }
    } else {
      text(ctx, 'The forge rolls a hero from fate:', cx, cy - 178, { size: 19, align: 'center', color: COLORS.parchment, font: FONT_DISPLAY });
      text(ctx, 'any name, any element, any class — Common to Legendary.', cx, cy - 150, { size: 15, align: 'center', color: COLORS.parchmentDim });
      text(ctx, 'Summoning a name you already own merges its spirit:', cx, cy + 196, { size: 15, align: 'center', color: COLORS.parchmentDim });
      text(ctx, 'the hero you keep gains a level instead.', cx, cy + 220, { size: 15, align: 'center', color: COLORS.parchmentDim });
    }

    const canAfford = S.gems >= ECONOMY.summonCost;
    this.btn(440, 668, 400, 58, revealing ? 'Forging…' : `Summon a Hero — ${ECONOMY.summonCost} gems`, () => this.doSummon(), {
      size: 19, edge: COLORS.gold, disabled: !canAfford || revealing,
    });
    if (!canAfford) text(ctx, 'Not enough gems — clear stages to earn more.', cx, 660, { size: 14, align: 'center', color: '#e8a0a0' });
    this.backButton();
  }

  doSummon() {
    const rng = new Rng(((Date.now() % 900000) + this.S.seedCounter * 104729) >>> 0);
    this.S.seedCounter += 1;
    const result = this.S.performSummon(rng);
    if (!result.ok) {
      this.showToast(result.reason === 'full' ? 'Your roster is full (60 heroes).' : 'Not enough gems.');
      return;
    }
    this.S.save();
    this.summon = { phase: 'reveal', t: 0, result };
    this.audio.summon();
    if (result.merged) setTimeout(() => this.audio.levelup(), 500);
  }

  // --- formation -------------------------------------------------------------------------------------------

  drawFormation() {
    const ctx = this.ctx;
    drawBackdrop(ctx, this.t, { calm: true });
    this.drawTopBar('Formation');
    const S = this.S;
    text(ctx, `Team ${S.team.length}/${ECONOMY.teamSize} — click a hero to add or remove. Front row (max ${ECONOMY.frontRowMax}) is struck first; back row (max ${ECONOMY.backRowMax}) is sheltered. The three buttons under each hero cycle its gear.`, 36, 88, { size: 15, color: COLORS.parchmentDim });

    // formation slots on the left
    const slotFor = (row, idx) => ({ x: row === 'front' ? 210 : 36, y: 128 + idx * 148, w: 148, h: 136 });
    for (const row of ['front', 'back']) {
      const members = S.teamHeroes().filter((m) => m.row === row);
      const cap = row === 'front' ? ECONOMY.frontRowMax : ECONOMY.backRowMax;
      text(ctx, row === 'front' ? 'FRONT' : 'BACK', row === 'front' ? 284 : 110, 122, { size: 15, align: 'center', weight: 'bold', color: row === 'front' ? '#ffb054' : '#8fd0ff' });
      for (let i = 0; i < cap; i += 1) {
        const s = slotFor(row, i);
        const member = members[i];
        panel(ctx, s.x, s.y, s.w, s.h, { fill: 'rgba(14,17,34,0.75)' });
        if (member) {
          drawHero(ctx, member.hero, s.x + s.w / 2, s.y + s.h - 34, 0.72, { t: this.t });
          textFit(ctx, member.hero.first, s.x + s.w / 2, s.y + 20, s.w - 10, { size: 13, align: 'center', weight: 'bold' });
          // row toggle
          this.btn(s.x + 22, s.y + s.h - 30, 104, 24, row === 'front' ? '→ Back' : '→ Front', () => {
            const target = row === 'front' ? 'back' : 'front';
            if (!S.setRow(member.hero.id, target)) this.showToast(`The ${target} row is full.`);
            else S.save();
          }, { size: 12 });
        } else {
          text(ctx, '— empty —', s.x + s.w / 2, s.y + s.h / 2 + 5, { size: 13, align: 'center', color: COLORS.parchmentDim });
        }
      }
    }

    // roster grid on the right, paged
    const perPage = 12;
    const pages = Math.max(1, Math.ceil(S.roster.length / perPage));
    this.rosterPage = Math.min(this.rosterPage, pages - 1);
    const start = this.rosterPage * perPage;
    const visible = S.roster.slice(start, start + perPage);
    visible.forEach((hero, i) => {
      const col = i % 4;
      const rowI = Math.floor(i / 4);
      const x = 420 + col * 208;
      const y = 118 + rowI * 186;
      const inTeam = S.team.includes(hero.id);
      drawHeroCard(ctx, hero, x, y, 192, 166, { t: this.t, selected: inTeam });
      this.buttons.push({
        x, y, w: 192, h: 166, disabled: false,
        action: () => {
          if (inTeam) S.removeFromTeam(hero.id);
          else if (!S.addToTeam(hero.id)) {
            this.showToast(S.team.length >= ECONOMY.teamSize ? 'Team is full (5). Remove someone first.' : 'No room in that row.');
            return;
          }
          S.save();
        },
      });
      // the gear strip: one small button per slot, cycling what the hero wears there
      GEAR_SLOTS.forEach((slot, si) => {
        const equipped = hero.gear ? gearById(hero.gear[slot]) : null;
        const label = equipped ? `${SLOT_LABELS[slot][0]}: ${equipped.short}` : `+ ${SLOT_LABELS[slot]}`;
        this.btn(x + si * 65.5, y + 172, 61, 22, label, () => this.cycleGear(hero, slot), {
          size: 11, edge: equipped ? COLORS.gold : COLORS.panelEdge,
        });
      });
    });
    if (pages > 1) {
      this.btn(420, 706, 120, 44, '← Prev', () => { this.rosterPage = Math.max(0, this.rosterPage - 1); }, { size: 15, disabled: this.rosterPage === 0 });
      text(ctx, `Page ${this.rosterPage + 1} of ${pages}`, 700, 734, { size: 15, align: 'center', color: COLORS.parchmentDim });
      this.btn(860, 706, 120, 44, 'Next →', () => { this.rosterPage = Math.min(pages - 1, this.rosterPage + 1); }, { size: 15, disabled: this.rosterPage >= pages - 1 });
    }
    this.backButton();
  }

  /**
   * One click on a hero's gear slot: if the slot is occupied, swap in the first spare piece
   * of that slot from the inventory (or take the piece off when there is no spare); if it is
   * empty, put the first spare on. Either way the change is toasted and saved.
   */
  cycleGear(hero, slot) {
    const S = this.S;
    const equippedId = hero.gear ? hero.gear[slot] : null;
    const spare = S.inventory.find((id) => {
      const item = gearById(id);
      return item && item.slot === slot;
    });
    if (equippedId) {
      if (spare) {
        S.equipGear(hero.id, spare);
        const item = gearById(spare);
        this.showToast(`${item.name} equipped on ${hero.first} — ${describeGear(item)}`);
      } else {
        const off = S.unequipGear(hero.id, slot);
        this.showToast(`${off ? off.name : 'Gear'} removed from ${hero.first}.`);
      }
    } else if (spare) {
      S.equipGear(hero.id, spare);
      const item = gearById(spare);
      this.showToast(`${item.name} equipped on ${hero.first} — ${describeGear(item)}`);
    } else {
      this.showToast(`No spare ${SLOT_LABELS[slot].toLowerCase()} gear — clear stages to find some.`);
      return;
    }
    S.save();
    this.audio.click();
  }

  // --- battle -------------------------------------------------------------------------------------------------

  drawBattle() {
    const ctx = this.ctx;
    const b = this.battle;
    drawBattleScene(ctx, b, this.t);

    // top bar: where we are (and the stage's omen, when it has one)
    panel(ctx, 24, 18, 470, 52, { radius: 12 });
    let label = b.endless
      ? `Endless Mode · Wave ${b.wave}`
      : `Stage ${b.stage} — ${STAGE_NAMES[b.stage - 1]} · Wave ${Math.min(b.wave, 3)} of 3`;
    if (b.modifier) label += ` · ${b.modifier.name}`;
    textFit(ctx, label, 42, 51, 440, { size: 18, weight: 'bold', color: COLORS.parchment });
    this.btn(1010, 18, 76, 46, this.paused ? '▶' : '❚❚', () => { this.paused = !this.paused; }, { size: 17 });
    this.btn(1096, 18, 76, 46, `${this.speed}×`, () => { this.speed = this.speed === 1 ? 2 : 1; }, { size: 17 });
    this.btn(1182, 18, 82, 46, 'Flee', () => { if (!this.shotMode) { b.flee(); } }, { size: 16, edge: COLORS.crimson });

    // bottom HUD: portraits with ultimate buttons
    const players = b.players;
    players.forEach((unit, i) => {
      const w = 128;
      const h = 108;
      const x = 196 + i * 178;
      const y = 676;
      const ready = unit.alive && unit.ult >= 100;
      ctx.save();
      if (!unit.alive) ctx.globalAlpha = 0.4;
      roundRectPath(ctx, x, y, w, h, 12);
      ctx.fillStyle = 'rgba(16,20,38,0.9)';
      ctx.fill();
      ctx.lineWidth = ready ? 3.5 : 2;
      ctx.strokeStyle = ready ? COLORS.ultYellow : COLORS.panelEdge;
      ctx.stroke();
      ctx.save();
      roundRectPath(ctx, x + 4, y + 4, w - 8, 62, 9);
      ctx.clip();
      drawHero(ctx, unit.hero, x + w / 2, y + 66, 0.52, { t: this.t });
      ctx.restore();
      bar(ctx, x + 10, y + 72, w - 20, 8, unit.hp / unit.maxHp, unit.hp / unit.maxHp > 0.3 ? COLORS.hpGreen : COLORS.hpLow);
      bar(ctx, x + 10, y + 84, w - 20, 8, unit.ult / 100, ready ? '#fff3b0' : COLORS.ultYellow);
      text(ctx, ready ? `ULT [${i + 1}]` : `${unit.hero.first} [${i + 1}]`, x + w / 2, y + 104, {
        size: 12, align: 'center', weight: 'bold', color: ready ? COLORS.ultYellow : COLORS.parchmentDim, shadow: false,
      });
      ctx.restore();
      if (ready && !this.shotMode) {
        this.buttons.push({
          x, y, w, h, disabled: false,
          action: () => { if (b.tryUlt(i)) this.audio.ult(); },
        });
      }
    });
    text(ctx, 'Click a glowing portrait (or press 1-5) to unleash its ultimate', VIEW.width / 2, 668, {
      size: 13, align: 'center', color: 'rgba(203,191,163,0.65)',
    });

    if (this.paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,5,12,0.7)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      panel(ctx, 440, 250, 400, 300, { fill: 'rgba(18,20,40,0.97)' });
      text(ctx, 'Paused', VIEW.width / 2, 316, { size: 32, align: 'center', weight: 'bold', color: COLORS.gold, font: FONT_DISPLAY });
      ctx.restore();
      this.btn(490, 348, 300, 54, 'Resume', () => { this.paused = false; }, { size: 19 });
      this.btn(490, 416, 300, 54, 'Restart Battle', () => this.startBattle(this.battleStage, this.battleEndless), { size: 19 });
      this.btn(490, 484, 300, 54, 'Abandon (Flee)', () => { this.paused = false; b.flee(); }, { size: 19, edge: COLORS.crimson });
    }
  }

  // --- results ---------------------------------------------------------------------------------------------------

  drawResult() {
    const ctx = this.ctx;
    drawBackdrop(ctx, this.t, { calm: true });
    const r = this.result;
    const b = this.battle;
    // the team, cheering or fallen, behind the panel
    if (b) {
      b.players.forEach((unit, i) => {
        drawHero(ctx, unit.hero, 190 + i * 225, 690, 1.05, {
          t: this.t, pose: r.won ? 'cheer' : unit.alive ? 'idle' : 'down',
        });
      });
    }
    const title = r.won ? 'VICTORY!' : r.fled ? 'RETREATED' : 'DEFEAT';
    text(ctx, title, VIEW.width / 2, 128, {
      size: 58, align: 'center', weight: 'bold', font: FONT_DISPLAY,
      color: r.won ? COLORS.gold : r.fled ? COLORS.parchmentDim : COLORS.crimson,
    });
    const subtitle = r.endless
      ? `You stood for ${r.waves} wave${r.waves === 1 ? '' : 's'}${r.isBest ? ' — a new best!' : ` · Best: ${this.S.endlessBest}`}`
      : r.won
        ? (r.stage === 10 ? 'The Umbral Shogun falls! Endless Mode is unlocked.' : `Stage ${r.stage} — ${STAGE_NAMES[r.stage - 1]} cleared!`)
        : `The shadow clan holds ${STAGE_NAMES[r.stage - 1]}… this time.`;
    text(ctx, subtitle, VIEW.width / 2, 166, { size: 18, align: 'center', color: COLORS.parchment });

    panel(ctx, 340, 196, 600, 300, {});
    text(ctx, 'Spoils', 372, 240, { size: 20, weight: 'bold', color: COLORS.gold, font: FONT_DISPLAY });
    drawGem(ctx, 386, 276, 13);
    text(ctx, `+${r.gems} gems`, 410, 284, { size: 20, weight: 'bold', color: '#b8f4ff' });
    if (r.gearFound) {
      textFit(ctx, `⚙ Found gear: ${r.gearFound.name} (${describeGear(r.gearFound)}) — equip it in Formation`, 372, 312, 556, { size: 14, weight: 'bold', color: '#ffd94d' });
    } else if (r.gearSalvaged) {
      textFit(ctx, `⚙ Duplicate ${r.gearSalvaged.name} salvaged: +${r.gearSalvaged.salvage} gems`, 372, 312, 556, { size: 14, weight: 'bold', color: '#ffd94d' });
    }
    let cy = 330;
    for (const gain of r.xpGains) {
      textFit(ctx, gain.hero.name, 372, cy, 300, { size: 15, color: COLORS.parchment });
      text(ctx, `+${gain.xp} XP${gain.survived ? '' : ' (fallen: half)'}`, 690, cy, { size: 15, color: COLORS.azure });
      if (gain.levels > 0) {
        text(ctx, `LEVEL UP → ${gain.hero.level}!`, 800, cy, { size: 15, weight: 'bold', color: COLORS.gold });
      }
      cy += 28;
    }
    if (r.xpGains.length === 0) text(ctx, 'No spoils on a retreat.', 372, cy, { size: 15, color: COLORS.parchmentDim });

    const by = 540;
    if (r.won && !r.endless && r.stage < 10) {
      this.btn(290, by, 220, 58, 'Next Stage →', () => this.startBattle(r.stage + 1, false), { size: 19, edge: COLORS.gold });
    }
    this.btn(530, by, 220, 58, r.endless ? 'Delve Again' : 'Retry Stage', () => this.startBattle(r.stage, r.endless), { size: 19 });
    this.btn(770, by, 220, 58, 'Home', () => { this.screen = 'home'; }, { size: 19 });
  }
}
