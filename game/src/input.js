// Mouse and keyboard input. Clicks on the player's cards become card picks;
// number keys 1..5 pick by position; Enter/Space confirms (start, restart);
// P pauses nothing here — the duel is turn-based — but Esc clears the hover.
// Pointer position is tracked in logical table coordinates so the renderer
// can lift the hovered card.
import { FIELD, HAND_LAYOUT, handStartX } from './config.js';

export function createInput(canvas, view) {
  let hover = -1;
  let pick = -1;
  let confirm = false;

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  /** Index of the hand card under a logical point, or -1. `count` = hand size. */
  function cardAt(point, count) {
    if (point.y < HAND_LAYOUT.y - 26 || point.y > HAND_LAYOUT.y + HAND_LAYOUT.cardH) return -1;
    const startX = handStartX(count);
    for (let i = 0; i < count; i += 1) {
      const x = startX + i * (HAND_LAYOUT.cardW + HAND_LAYOUT.gap);
      if (point.x >= x && point.x <= x + HAND_LAYOUT.cardW) return i;
    }
    return -1;
  }

  canvas.addEventListener('pointermove', (event) => {
    hover = toLogical(event);
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = toLogical(event);
    hover = point;
    pick = point; // resolved against the live hand by main.js
    confirm = true;
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      if (!event.repeat) confirm = true;
      event.preventDefault();
    } else if (/^Digit[1-5]$/.test(event.code)) {
      pick = Number(event.code.slice(5)) - 1;
    }
  });

  return {
    /** Logical pointer position {x,y} or null before the first move. */
    pointer() { return hover; },
    /** Card index under the pointer for a hand of `count`, or -1. */
    hoverIndex(count) {
      if (!hover || typeof hover !== 'object' || hover.x === undefined) return -1;
      return cardAt(hover, count);
    },
    /** A pending pick: a card index, or -2 for "clicked somewhere", or -1 for none. */
    takePick(count) {
      if (pick === -1 || pick === null) return -1;
      const taken = pick;
      pick = -1;
      if (typeof taken === 'object') {
        const idx = cardAt(taken, count);
        return idx >= 0 ? idx : -2;
      }
      return taken;
    },
    takeConfirm() {
      const taken = confirm;
      confirm = false;
      return taken;
    },
  };
}
