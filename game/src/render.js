// Drawing only: the match state in, pixels out. The 1280x720 table is scaled
// to fit the window and centred. Cards are cream-faced with a sigil-coloured
// frame, a big rank and a drawn sigil glyph (sun disc, crescent, leaf, wave),
// so suits read by colour AND shape at thumbnail size. Trump cards glow gold.
import {
  AI_HAND_LAYOUT, DUEL_LAYOUT, FIELD, FONT, FONT_UI, HAND_LAYOUT, PALETTE, SIGILS, handStartX,
} from './config.js';
import { PHASE_CHOOSE, PHASE_OVER, PHASE_REVEAL, PHASE_TITLE, compareCards } from './world.js';
import { cardPower, DIFFICULTY_LABELS } from './ai.js';

export function createRenderer(canvas) {
  // `ctx` is swapped for a sprite's context while a card is being painted
  // into the cache (see cardFace below); every helper reads it live.
  let ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const particles = [];
  let clock = 0; // seconds of animation time, for pulses and rotating rays
  let bgCanvas = null; // the static table, painted once and blitted per frame

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'center', font = FONT_UI, weight = '') {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // --- sigil glyphs, drawn with paths so they survive any font --------------
  // `g` is the target context — the table's cached background paints its
  // watermark sigils through here too.
  function drawSigil(sigil, cx, cy, r, color, g = ctx) {
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = Math.max(2, r * 0.16);
    g.lineCap = 'round';
    if (sigil === 0) { // SUN: disc and eight rays
      g.beginPath(); g.arc(cx, cy, r * 0.52, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68);
        g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
        g.stroke();
      }
    } else if (sigil === 1) { // MOON: a crescent — outer disc minus an offset inner disc (even-odd fill)
      g.beginPath();
      g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      g.arc(cx + r * 0.44, cy - r * 0.24, r * 0.6, 0, Math.PI * 2);
      g.fill('evenodd');
    } else if (sigil === 2) { // LEAF: two arcs and a stem
      g.beginPath();
      g.moveTo(cx - r * 0.7, cy + r * 0.7);
      g.quadraticCurveTo(cx - r * 0.75, cy - r * 0.6, cx + r * 0.65, cy - r * 0.7);
      g.quadraticCurveTo(cx + r * 0.7, cy + r * 0.6, cx - r * 0.7, cy + r * 0.7);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.moveTo(cx - r * 0.55, cy + r * 0.55); g.lineTo(cx + r * 0.45, cy - r * 0.5); g.stroke();
    } else { // TIDE: three stacked waves
      for (let row = -1; row <= 1; row += 1) {
        const yy = cy + row * r * 0.42;
        g.beginPath();
        g.moveTo(cx - r * 0.85, yy);
        g.bezierCurveTo(cx - r * 0.4, yy - r * 0.34, cx - r * 0.1, yy + r * 0.34, cx + r * 0.3, yy);
        g.bezierCurveTo(cx + r * 0.55, yy - r * 0.24, cx + r * 0.7, yy - r * 0.1, cx + r * 0.85, yy);
        g.stroke();
      }
    }
    g.restore();
  }

  function drawHeart(x, y, size, filled) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.9);
    ctx.bezierCurveTo(x - size * 1.15, y + size * 0.1, x - size * 0.55, y - size * 0.95, x, y - size * 0.25);
    ctx.bezierCurveTo(x + size * 0.55, y - size * 0.95, x + size * 1.15, y + size * 0.1, x, y + size * 0.9);
    ctx.fillStyle = filled ? PALETTE.heart : 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.restore();
  }

  function drawGem(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.gem;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-size / 2, -size / 2, size / 2, size / 2);
    ctx.restore();
  }

  // --- cards -----------------------------------------------------------------
  // Card art is painted ONCE per (sigil, rank, trump, size) into a sprite
  // cache — shadow blur and gradients are the most expensive things a 2D
  // canvas does, and a match only ever shows 36 distinct faces. Every frame
  // after the first is a drawImage per card, so the richer the table gets,
  // the frame cost stays flat.
  const spriteCache = new Map();
  const SPRITE_PAD = 30; // room for the shadow / trump glow around the card

  function paintInto(key, w, h, paint) {
    let sprite = spriteCache.get(key);
    if (sprite) return sprite;
    sprite = document.createElement('canvas');
    sprite.width = w + SPRITE_PAD * 2;
    sprite.height = h + SPRITE_PAD * 2;
    const home = ctx;
    ctx = sprite.getContext('2d');
    paint(SPRITE_PAD, SPRITE_PAD);
    ctx = home;
    spriteCache.set(key, sprite);
    return sprite;
  }

  function cardFace(card, x, y, w, h, isTrump) {
    const key = `face|${card.sigil}|${card.rank}|${isTrump ? 1 : 0}|${w}x${h}`;
    const sprite = paintInto(key, w, h, (px, py) => paintCardFace(card, px, py, w, h, isTrump));
    ctx.drawImage(sprite, x - SPRITE_PAD, y - SPRITE_PAD);
  }

  function cardBack(x, y, w, h) {
    const key = `back|${w}x${h}`;
    const sprite = paintInto(key, w, h, (px, py) => paintCardBack(px, py, w, h));
    ctx.drawImage(sprite, x - SPRITE_PAD, y - SPRITE_PAD);
  }

  function paintCardFace(card, x, y, w, h, isTrump) {
    const sigil = SIGILS[card.sigil];
    ctx.save();
    // A soft drop shadow gives every card weight on the felt; trump cards glow gold instead.
    ctx.shadowColor = isTrump ? PALETTE.gem : 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = isTrump ? 22 : 10;
    ctx.shadowOffsetY = isTrump ? 0 : 4;
    roundRect(x, y, w, h, w * 0.09);
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#fffdf6');
    grad.addColorStop(1, sigil.soft);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = Math.max(2, w * 0.045);
    ctx.strokeStyle = isTrump ? PALETTE.gem : sigil.color;
    ctx.stroke();
    // rank, top-left and bottom-right
    text(String(card.rank), x + w * 0.2, y + h * 0.13, w * 0.3, sigil.deep, 'center', FONT, 'bold');
    ctx.save();
    ctx.translate(x + w * 0.8, y + h * 0.87);
    ctx.rotate(Math.PI);
    text(String(card.rank), 0, 0, w * 0.3, sigil.deep, 'center', FONT, 'bold');
    ctx.restore();
    drawSigil(card.sigil, x + w / 2, y + h * 0.47, w * 0.26, sigil.color);
    text(sigil.name, x + w / 2, y + h * 0.76, w * 0.17, sigil.deep, 'center', FONT, 'bold');
    if (card.rank === 1) text('SPARK', x + w / 2, y + h * 0.885, w * 0.13, sigil.deep, 'center', FONT_UI, 'bold');
    if (isTrump) text('TRUMP', x + w / 2, y + h * 0.06, w * 0.12, '#9a6a00', 'center', FONT_UI, 'bold');
    ctx.restore();
  }

  function paintCardBack(x, y, w, h) {
    ctx.save();
    roundRect(x, y, w, h, w * 0.09);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, PALETTE.backA);
    grad.addColorStop(1, PALETTE.backB);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.feltRing;
    ctx.stroke();
    ctx.save();
    roundRect(x + w * 0.09, y + h * 0.07, w * 0.82, h * 0.86, w * 0.06);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,210,63,0.35)';
    ctx.lineWidth = 1.5;
    for (let d = -h; d < w + h; d += 14) {
      ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w * 0.21, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.gem;
    ctx.stroke();
    drawSigil(1, x + w / 2, y + h / 2, w * 0.13, PALETTE.gem);
    ctx.restore();
  }

  // --- table furniture ---------------------------------------------------------
  /**
   * The static table, painted once into an offscreen canvas: layered felt,
   * four giant watermark sigils in the corners, gold rings and a vignette.
   * Per frame it costs a single drawImage, however rich it gets — that is
   * how the visuals go up without the frame rate coming down.
   */
  function buildBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = FIELD.width;
    bgCanvas.height = FIELD.height;
    const g = bgCanvas.getContext('2d');
    const grad = g.createRadialGradient(640, 350, 120, 640, 360, 760);
    grad.addColorStop(0, PALETTE.feltInner);
    grad.addColorStop(1, PALETTE.feltOuter);
    g.fillStyle = grad;
    g.fillRect(0, 0, FIELD.width, FIELD.height);
    // Watermark sigils, barely-there, one per corner.
    const marks = [[0, 208, 168], [1, 1072, 168], [2, 208, 552], [3, 1072, 552]];
    for (const [sigil, x, y] of marks) {
      g.globalAlpha = 0.05;
      drawSigil(sigil, x, y, 96, SIGILS[sigil].color, g);
    }
    g.globalAlpha = 1;
    // A lighter pool of felt inside the ring.
    g.beginPath();
    g.ellipse(640, 356, 520, 252, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,240,0.045)';
    g.fill();
    g.strokeStyle = PALETTE.feltRing;
    g.lineWidth = 5;
    g.stroke();
    g.beginPath();
    g.ellipse(640, 356, 486, 224, 0, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(201,162,39,0.35)';
    g.lineWidth = 2;
    g.stroke();
    // Vignette: darken the corners so the table glows in the middle.
    const shade = g.createRadialGradient(640, 360, 380, 640, 360, 900);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.34)');
    g.fillStyle = shade;
    g.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawTable(state) {
    if (!bgCanvas) buildBackground();
    ctx.drawImage(bgCanvas, 0, 0);
    // deck stack, right of centre
    for (let i = 0; i < 3; i += 1) cardBack(1052 - i * 3, 300 - i * 3, 74, 104);
    text(`Deck ${state.deck.length}`, 1089, 428, 17, PALETTE.muted);
  }

  function lifeRow(x, y, life, maxLife, alignRight) {
    const step = 21;
    for (let i = 0; i < maxLife; i += 1) {
      const hx = alignRight ? x - i * step : x + i * step;
      drawHeart(hx, y, 9, i < life);
    }
  }

  function drawHud(state, best) {
    // Rival panel, top-left
    text('VEX · the Moon Trickster', 28, 34, 22, PALETTE.text, 'left', FONT, 'bold');
    lifeRow(36, 66, state.aiLife, 12, false);
    drawGem(300, 66, 13);
    text(String(state.aiGems), 318, 66, 19, PALETTE.text, 'left', FONT_UI, 'bold');
    // Player panel, bottom-left lives under the hand hint instead: top-right shows round/score
    text(`ROUND ${Math.max(1, state.round)}`, 640, 34, 22, PALETTE.text, 'center', FONT, 'bold');
    text(`Deck ${state.deck.length} · Best streak ${best}`, 1252, 34, 17, PALETTE.muted, 'right');
    text('YOU', 28, 486, 22, PALETTE.text, 'left', FONT, 'bold');
    lifeRow(110, 486, state.playerLife, 12, false);
    drawGem(378, 486, 13);
    text(String(state.playerGems), 396, 486, 19, PALETTE.text, 'left', FONT_UI, 'bold');
  }

  /** Vex herself: a crescent-moon trickster portrait in a gold medallion, crowned. */
  function drawVexPortrait() {
    const cx = 92;
    const cy = 158;
    const r = 45;
    ctx.save();
    // Little three-point crown above the medallion.
    ctx.fillStyle = PALETTE.gem;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy - r - 2);
    ctx.lineTo(cx - 20, cy - r - 16);
    ctx.lineTo(cx - 10, cy - r - 6);
    ctx.lineTo(cx, cy - r - 18);
    ctx.lineTo(cx + 10, cy - r - 6);
    ctx.lineTo(cx + 20, cy - r - 16);
    ctx.lineTo(cx + 20, cy - r - 2);
    ctx.closePath();
    ctx.fill();
    // Medallion: deep-violet disc in a gold ring.
    const grad = ctx.createRadialGradient(cx - 12, cy - 14, 6, cx, cy, r);
    grad.addColorStop(0, '#4b3577');
    grad.addColorStop(1, '#221739');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.gem;
    ctx.stroke();
    // Her crescent, with a sly closed eye and smirk on its lit face.
    drawSigil(1, cx - 4, cy + 4, 26, '#d9cdf7');
    ctx.strokeStyle = '#221739';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); // closed, amused eye
    ctx.arc(cx + 2, cy - 2, 6, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath(); // smirk
    ctx.arc(cx + 6, cy + 8, 7, Math.PI * 0.15, Math.PI * 0.75);
    ctx.stroke();
    // Two sparkles, because she is showing off.
    for (const [sx, sy, sr] of [[cx + 26, cy - 24, 6], [cx - 28, cy + 22, 4.5]]) {
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(sx, sy - sr);
      ctx.lineTo(sx + sr * 0.28, sy - sr * 0.28);
      ctx.lineTo(sx + sr, sy);
      ctx.lineTo(sx + sr * 0.28, sy + sr * 0.28);
      ctx.lineTo(sx, sy + sr);
      ctx.lineTo(sx - sr * 0.28, sy + sr * 0.28);
      ctx.lineTo(sx - sr, sy);
      ctx.lineTo(sx - sr * 0.28, sy - sr * 0.28);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    text('VEX', cx, cy + r + 20, 13, PALETTE.gem, 'center', FONT, 'bold');
  }

  /**
   * The Echo rule, made visible on the table: once a sigil has won a round,
   * a little gold plaque says what winning with it again would pay.
   */
  /** The Echo plaque's wording for this frame, or null when no Echo is in play. */
  function echoLabel(state) {
    if (state.phase !== PHASE_CHOOSE && state.phase !== PHASE_REVEAL) return null;
    if (state.lastSigil === null || state.streak < 1) return null;
    const name = SIGILS[state.lastSigil].name;
    if (state.phase === PHASE_CHOOSE) {
      return `ECHO ARMED · ${name} won last round — win with ${name} again: +1 damage`;
    }
    if (state.playerPlayed && state.aiPlayed) {
      const echoLive = state.playerPlayed.sigil === state.lastSigil || state.aiPlayed.sigil === state.lastSigil;
      if (echoLive) return `ECHO LIVE · a ${name} win pays +1 damage`;
    }
    return null;
  }

  function drawEchoChip(state) {
    const label = echoLabel(state);
    if (!label) return;
    ctx.save();
    ctx.font = `600 14px ${FONT_UI}`;
    const w = ctx.measureText(label).width + 28;
    roundRect(640 - w / 2, 484, w, 30, 15);
    ctx.fillStyle = 'rgba(13,21,36,0.88)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.gem;
    ctx.stroke();
    text(label, 640, 499, 14, PALETTE.gem, 'center', FONT_UI, '600');
    ctx.restore();
  }

  function drawTrumpAndPrize(state) {
    const trump = SIGILS[state.trump];
    ctx.beginPath();
    ctx.arc(150, 330, 62, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = trump.color;
    ctx.stroke();
    drawSigil(state.trump, 150, 318, 34, trump.color);
    text('TRUMP', 150, 372, 15, PALETTE.muted, 'center', FONT_UI, 'bold');
    text(trump.name, 150, 392, 19, trump.color, 'center', FONT, 'bold');
    // prize gems, top of the duel zone
    for (let i = 0; i < state.prize; i += 1) drawGem(606 + i * 37, 232, 20);
    text(`PRIZE ${state.prize}`, 640, 206, 19, PALETTE.gem, 'center', FONT_UI, 'bold');
  }

  function drawAiHand(state) {
    const total = state.aiHand.length * AI_HAND_LAYOUT.cardW + (state.aiHand.length - 1) * AI_HAND_LAYOUT.gap;
    const startX = (FIELD.width - total) / 2;
    for (let i = 0; i < state.aiHand.length; i += 1) {
      cardBack(startX + i * (AI_HAND_LAYOUT.cardW + AI_HAND_LAYOUT.gap), AI_HAND_LAYOUT.y, AI_HAND_LAYOUT.cardW, AI_HAND_LAYOUT.cardH);
    }
  }

  function drawPlayerHand(state, hover) {
    const startX = handStartX(state.playerHand.length);
    for (let i = 0; i < state.playerHand.length; i += 1) {
      const card = state.playerHand[i];
      const x = startX + i * (HAND_LAYOUT.cardW + HAND_LAYOUT.gap);
      const lift = i === hover ? 18 : 0;
      cardFace(card, x, HAND_LAYOUT.y - lift, HAND_LAYOUT.cardW, HAND_LAYOUT.cardH, card.sigil === state.trump);
    }
  }

  function resultLine(state) {
    const r = state.lastResult;
    if (!r) return 'Win the round, take the gems, break her hearts.';
    if (r.outcome === 'player') return `You take the round! Vex loses ${r.damage} life${r.echo ? ' — ECHO bonus!' : ''}${r.spark ? ' — SPARK fells the giant!' : ''}`;
    if (r.outcome === 'ai') return `Vex takes the round. You lose ${r.damage} life${r.echo ? ' — her sigils echo!' : ''}`;
    return 'CLASH! Equal power — you both lose 1 life.';
  }

  function drawDuel(state) {
    const { aiX, playerX, y, cardW, cardH } = DUEL_LAYOUT;
    // Played cards slide in from their owners' sides and settle in the middle.
    const slide = state.phase === PHASE_REVEAL ? Math.min(1, state.revealT / 0.35) : 1;
    const ease = 1 - (1 - slide) * (1 - slide);
    const playerY = y + (1 - ease) * 52;
    const aiY = y - (1 - ease) * 52;
    // Between rounds the last duel stays on the table, faded, so the result
    // line below it has something to point at.
    if (!state.playerPlayed && state.phase === PHASE_CHOOSE && state.lastResult) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      cardFace(state.lastResult.aiCard, aiX, y, cardW, cardH, state.lastResult.aiCard.sigil === state.trump);
      cardFace(state.lastResult.playerCard, playerX, y, cardW, cardH, state.lastResult.playerCard.sigil === state.trump);
      ctx.restore();
      text('LAST ROUND', 640, y - 18, 14, PALETTE.muted, 'center', FONT_UI, 'bold');
    }
    // Once the flip lands, the duel reads itself: golden rays turn slowly
    // behind the winning card, a light-ring breathes around it, and the
    // losing card falls into shadow. Twelve triangles and two round-rects —
    // spectacle at a fixed, tiny cost.
    const fxOn = state.phase === PHASE_REVEAL && state.revealT > 0.6 && state.playerPlayed && state.aiPlayed;
    const verdict = fxOn ? compareCards(state.playerPlayed, state.aiPlayed, state.trump) : 0;
    if (fxOn && verdict !== 0) {
      const wx = verdict > 0 ? playerX : aiX;
      const wy = verdict > 0 ? playerY : aiY;
      ctx.save();
      ctx.translate(wx + cardW / 2, wy + cardH / 2);
      ctx.rotate((clock * 0.25) % (Math.PI / 6));
      ctx.fillStyle = 'rgba(244,197,66,0.10)';
      for (let i = 0; i < 12; i += 1) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(178, -13);
        ctx.lineTo(178, 13);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (state.playerPlayed) cardFace(state.playerPlayed, playerX, playerY, cardW, cardH, state.playerPlayed.sigil === state.trump);
    if (state.aiPlayed) {
      if (state.phase === PHASE_REVEAL) {
        const flip = Math.min(1, state.revealT / 0.55);
        if (flip < 0.5) cardBack(aiX, aiY, cardW, cardH);
        else {
          ctx.save();
          const cx = aiX + cardW / 2;
          ctx.translate(cx, 0); ctx.scale(Math.abs(Math.cos(flip * Math.PI)) || 0.02, 1); ctx.translate(-cx, 0);
          cardFace(state.aiPlayed, aiX, aiY, cardW, cardH, state.aiPlayed.sigil === state.trump);
          ctx.restore();
        }
      } else {
        cardFace(state.aiPlayed, aiX, aiY, cardW, cardH, state.aiPlayed.sigil === state.trump);
      }
    }
    if (fxOn && verdict !== 0) {
      const wx = verdict > 0 ? playerX : aiX;
      const wy = verdict > 0 ? playerY : aiY;
      const lx = verdict > 0 ? aiX : playerX;
      const ly = verdict > 0 ? aiY : playerY;
      // The loser, shadowed.
      ctx.save();
      roundRect(lx, ly, cardW, cardH, cardW * 0.09);
      ctx.fillStyle = 'rgba(6,10,8,0.38)';
      ctx.fill();
      ctx.restore();
      // The winner, ringed in breathing gold.
      const grow = 5 + 2.2 * Math.sin(clock * 6);
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(clock * 6);
      roundRect(wx - grow, wy - grow, cardW + grow * 2, cardH + grow * 2, cardW * 0.11);
      ctx.lineWidth = 3;
      ctx.strokeStyle = PALETTE.gem;
      ctx.stroke();
      ctx.restore();
      // A Spark — the 1 felling the 9 — gets a stamp on the winner's corner,
      // so the screenshot tells the story before any caption does.
      const winnerCard = verdict > 0 ? state.playerPlayed : state.aiPlayed;
      const loserCard = verdict > 0 ? state.aiPlayed : state.playerPlayed;
      const isSpark = winnerCard.rank === 1 && loserCard.rank === 9
        && winnerCard.sigil !== state.trump && loserCard.sigil !== state.trump;
      if (isSpark) {
        ctx.save();
        ctx.translate(wx + cardW - 4, wy - 4);
        ctx.rotate(-0.16);
        roundRect(-57, -16, 114, 32, 16);
        ctx.fillStyle = PALETTE.gem;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(90,55,0,0.65)';
        ctx.stroke();
        text('SPARK!', 0, 1, 19, '#4a3200', 'center', FONT_UI, 'bold');
        ctx.restore();
      }
    }
    text('VS', 640, y + cardH / 2, 30, PALETTE.gem, 'center', FONT, 'bold');
  }

  /** The face-off in words, once Vex's card has landed: powers, trump and the Spark rule. */
  function duelLine(state) {
    const a = state.playerPlayed;
    const b = state.aiPlayed;
    if (!a || !b) return 'The cards are cast…';
    const pa = cardPower(a, state.trump);
    const pb = cardPower(b, state.trump);
    const name = (c) => `${SIGILS[c.sigil].name} ${c.rank}${c.sigil === state.trump ? ' · TRUMP' : ''}`;
    if (a.rank === 1 && b.rank === 9 && a.sigil !== state.trump && b.sigil !== state.trump) {
      return `SPARK! Your ${name(a)} fells her giant ${name(b)}!`;
    }
    if (b.rank === 1 && a.rank === 9 && a.sigil !== state.trump && b.sigil !== state.trump) {
      return `SPARK! Her ${name(b)} fells your giant ${name(a)}!`;
    }
    return `Your ${name(a)} — power ${pa}  ·  Vex's ${name(b)} — power ${pb}`;
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      drawGem(p.x, p.y, p.size);
      ctx.globalAlpha = 1;
    }
  }

  function burst(x, y, count = 14) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 220;
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 120, life: 0.7 + Math.random() * 0.6, size: 8 + Math.random() * 9 });
    }
  }

  /**
   * Cover art for the title screen: the two cards the whole game turns on —
   * a Sun 9 Giant and a Moon 1 Spark — fanned against the panel's sides.
   */
  function drawCoverCards(state) {
    const w = 132;
    const h = 184;
    const cy = 360;
    ctx.save();
    ctx.translate(212, cy);
    ctx.rotate(-0.16);
    cardFace({ sigil: 0, rank: 9 }, -w / 2, -h / 2, w, h, state.trump === 0);
    ctx.restore();
    ctx.save();
    ctx.translate(1068, cy);
    ctx.rotate(0.16);
    cardFace({ sigil: 1, rank: 1 }, -w / 2, -h / 2, w, h, state.trump === 1);
    ctx.restore();
  }

  function panel(title, lines, prompt, accent) {
    const w = 760;
    const h = 150 + lines.length * 36 + 70;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    ctx.fillStyle = 'rgba(4,8,6,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    roundRect(x, y, w, h, 18);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent;
    ctx.stroke();
    text(title, FIELD.width / 2, y + 66, 54, accent, 'center', FONT, 'bold');
    lines.forEach((line, i) => text(line, FIELD.width / 2, y + 128 + i * 36, 22, PALETTE.text));
    text(prompt, FIELD.width / 2, y + h - 38, 23, PALETTE.gem, 'center', FONT_UI, 'bold');
  }

  /** Paint one frame. `ui`: { hover, best, dt } */
  function draw(state, ui) {
    clock += ui.dt || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    drawTable(state);
    drawHud(state, ui.best);
    drawAiHand(state);
    drawTrumpAndPrize(state);
    drawVexPortrait();
    drawDuel(state);
    drawEchoChip(state);
    drawPlayerHand(state, state.phase === PHASE_CHOOSE ? ui.hover : -1);
    drawParticles(ui.dt || 0);

    if (state.phase === PHASE_CHOOSE) {
      text(resultLine(state), 640, 462, 21, PALETTE.text);
      // Her table talk for THIS round outranks last round's quip: it is a tell
      // about the card she has already committed to (about 70% honest).
      if (state.vexTell) text(state.vexTell, 640, 490, 17, PALETTE.gem);
      else if (state.lastResult && !echoLabel(state)) text(state.lastResult.quip, 640, 490, 17, PALETTE.muted);
      text('Click a card — or press 1–5, left to right — to duel for the prize.', 640, 702, 16, PALETTE.muted);
    } else if (state.phase === PHASE_REVEAL) {
      text(state.revealT > 0.6 ? duelLine(state) : 'The cards are cast…', 640, 470, 21, PALETTE.text);
    }

    if (state.phase === PHASE_TITLE) {
      panel('SIGIL CLASH', [
        'SUN · MOON · LEAF · TIDE — four sigils, one table.',
        'A duel of cards against Vex, the Moon Trickster.',
        'Beat her card to deal the prize as damage. Trump sigil: +10 power.',
        'A Spark (1) fells a Giant (9). Win twice with one sigil for an ECHO +1.',
        'Her table talk is a tell — seven parts true, three parts bluff.',
        `First to break all ${12} hearts wins the match.`,
      ], `Enter to play · Difficulty: ${DIFFICULTY_LABELS[state.difficulty ?? 1].toUpperCase()} — keys 1 · 2 · 3`, PALETTE.gem);
      drawCoverCards(state);
    } else if (state.phase === PHASE_OVER) {
      const won = state.winner === 'player';
      panel(won ? 'VICTORY!' : 'DEFEAT', [
        won ? 'Vex’s hearts are broken — the table is yours!' : 'Your hearts are broken — Vex keeps the table… this time.',
        `Rounds played: ${state.round} · Gems won: ${state.playerGems} to ${state.aiGems}`,
        `Life left — you ${state.playerLife}, Vex ${state.aiLife}`,
      ], 'Click or press Enter to play again', won ? PALETTE.gem : PALETTE.danger);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, burst };
}
