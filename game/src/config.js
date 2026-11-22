// Sigil Clash — every tuning number, colour and layout constant in one place.
// The table is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule or hit-test below depends on the real screen size.

export const FIELD = { width: 1280, height: 720 };

/** Both duelists start with this much life; the winner of a round deals the prize as damage. */
export const START_LIFE = 12;
/** Cards each duelist holds; both draw back up to this after every round. */
export const HAND_SIZE = 5;
/** Ranks run 1..9 in every sigil. Rank 1 is the Spark: it beats a 9 (see world.js). */
export const RANK_MIN = 1;
export const RANK_MAX = 9;
/** A card in the round's trump sigil gets this much extra power. */
export const TRUMP_BONUS = 10;
/** Winning with the same sigil that won the last round echoes: +1 damage. */
export const ECHO_BONUS = 1;

/** The four sigils, in trump-rotation order. Colour + shape + name tell them apart. */
export const SIGILS = [
  { name: 'SUN', color: '#e8a812', deep: '#9a6a00', soft: '#fdf0cd' },
  { name: 'MOON', color: '#8b6fd8', deep: '#543d9e', soft: '#e9e2fb' },
  { name: 'LEAF', color: '#3da35d', deep: '#1f6b3a', soft: '#dcf2e2' },
  { name: 'TIDE', color: '#2f7fd0', deep: '#17507f', soft: '#d9ecfc' },
];

export const PALETTE = {
  backdrop: '#0b0f14',
  feltInner: '#14532d',
  feltOuter: '#071f12',
  feltRing: '#c9a227',
  panel: '#101820ee',
  panelEdge: '#c9a227',
  text: '#f4f1e6',
  muted: '#b9c2b2',
  cream: '#fffaf0',
  cardEdge: '#2b2b2b',
  backA: '#5b2a86',
  backB: '#2c1454',
  danger: '#e5534b',
  heart: '#ef476f',
  gem: '#ffd23f',
};

export const FONT = 'Georgia, "Times New Roman", serif';
export const FONT_UI = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Player hand layout (bottom centre) — shared by the renderer and the click hit-test. */
export const HAND_LAYOUT = { cardW: 118, cardH: 166, gap: 14, y: 516 };
/** The two face-off slots in the middle of the table. */
export const DUEL_LAYOUT = { cardW: 118, cardH: 166, aiX: 500, playerX: 662, y: 268 };
/** The rival's face-down hand along the top. */
export const AI_HAND_LAYOUT = { cardW: 74, cardH: 104, gap: 8, y: 64 };

/** x of the first player-hand card: the hand is centred as a row. */
export function handStartX(count) {
  const total = count * HAND_LAYOUT.cardW + (count - 1) * HAND_LAYOUT.gap;
  return (FIELD.width - total) / 2;
}

/** Where the best-of record is kept between visits (this browser only). */
export const BEST_KEY = 'sigil-clash.best';
