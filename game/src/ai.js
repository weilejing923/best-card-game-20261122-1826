// Vex, the Moon Trickster: the rival's brain. Vex cannot see the player's card
// (the duel is simultaneous), so she plays the prize, the trump and her own
// hand — which is exactly what a good human does, and what makes her readable:
// big prizes pull big cards out of her, small prizes make her dump her worst
// card, and she saves trump for when it matters. A whisper of randomness keeps
// her from being a solved puzzle.
import { ECHO_BONUS, TRUMP_BONUS } from './config.js';

/** How strong a card is this round, before the Spark rule (rank 1 beats 9). */
export function cardPower(card, trump) {
  return card.rank + (card.sigil === trump ? TRUMP_BONUS : 0);
}

/** What Vex thinks a card is worth keeping: power, plus an echo she can chain. */
function keepValue(card, trump, lastSigil) {
  let value = cardPower(card, trump);
  if (lastSigil !== null && card.sigil === lastSigil) value += ECHO_BONUS + 1;
  return value;
}

/**
 * Pick the index of the card Vex plays.
 * ctx: { prize, trump, lastSigil, aiLife, playerLife, random }
 */
export function chooseAiCard(hand, ctx) {
  const scored = hand.map((card, index) => ({
    index,
    power: cardPower(card, ctx.trump),
    keep: keepValue(card, ctx.trump, ctx.lastSigil),
    isTrump: card.sigil === ctx.trump,
  }));
  const byKeep = [...scored].sort((a, b) => a.keep - b.keep);
  const worst = byKeep[0];
  const best = byKeep[byKeep.length - 1];

  // Desperate or far behind: swing with the best card whatever the prize.
  if (ctx.aiLife <= 3 || ctx.playerLife - ctx.aiLife >= 6) return best.index;

  // A 1-gem round is a dumping ground — unless the worst card still wins often
  // (a mid trump), in which case take the cheap win.
  if (ctx.prize <= 1) {
    if (worst.power >= 12) return worst.index;
    const dump = byKeep.find((s) => !s.isTrump) ?? worst;
    return dump.index;
  }

  // A 3-gem round deserves a real card: the cheapest one likely to win
  // (power 8+ beats most of a fresh hand), else the best card in hand.
  if (ctx.prize >= 3) {
    const enough = byKeep.find((s) => s.power >= 8);
    if (enough && ctx.random() > 0.15) return enough.index;
    return best.index;
  }

  // A 2-gem round: play the cheapest card with power 7+, sometimes the echo
  // card to keep a chain alive, sometimes a mid card at random.
  const mid = byKeep.find((s) => s.power >= 7);
  if (mid && ctx.random() > 0.25) return mid.index;
  const echoCard = byKeep.find((s) => ctx.lastSigil !== null && hand[s.index].sigil === ctx.lastSigil);
  if (echoCard) return echoCard.index;
  return byKeep[Math.floor(ctx.random() * Math.min(3, byKeep.length))].index;
}

/** One line of table talk that hints at what Vex just did, shown after a reveal. */
export function vexQuip(outcome, ctx) {
  if (outcome === 'ai') {
    if (ctx.prize >= 3) return 'Vex: “A fat prize deserves a sharp card.”';
    if (ctx.echo) return 'Vex: “Hear that? My sigils sing together.”';
    return 'Vex: “The Moon provides.”';
  }
  if (outcome === 'player') {
    if (ctx.spark) return 'Vex: “A Spark fells a giant?! …Well played.”';
    if (ctx.prize >= 3) return 'Vex: “You spent well. This time.”';
    return 'Vex: “Take the gem. I have more tricks.”';
  }
  return 'Vex: “Steel on steel. Again!”';
}
