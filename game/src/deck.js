// The deck: 36 original cards — ranks 1..9 in each of the four sigils
// (Sun, Moon, Leaf, Tide). A card is a plain object { id, sigil, rank };
// its power in a round is decided by the rules in world.js, not stored here.
import { RANK_MAX, RANK_MIN, SIGILS } from './config.js';
import { shuffle } from './random.js';

let nextId = 1;

/** One card. `sigil` is an index into SIGILS, `rank` is RANK_MIN..RANK_MAX. */
export function makeCard(sigil, rank) {
  const card = { id: nextId, sigil, rank };
  nextId += 1;
  return card;
}

/** A fresh, shuffled 36-card deck drawn with `random` (top of deck = end of array). */
export function buildDeck(random) {
  const cards = [];
  for (let sigil = 0; sigil < SIGILS.length; sigil += 1) {
    for (let rank = RANK_MIN; rank <= RANK_MAX; rank += 1) cards.push(makeCard(sigil, rank));
  }
  return shuffle(random, cards);
}

/** Sort a hand for display: by sigil, then by rank, so a hand reads at a glance. */
export function sortHand(hand) {
  hand.sort((a, b) => (a.sigil - b.sigil) || (a.rank - b.rank));
  return hand;
}
