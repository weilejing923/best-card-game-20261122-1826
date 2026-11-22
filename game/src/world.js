// Sigil Clash — the rules and the match state, with no drawing and no browser
// in it. A duel round, step by step:
//   1. A prize of 1..3 gems is shown and one sigil is trump (it rotates
//      Sun → Moon → Leaf → Tide every round).
//   2. The player picks a card; Vex picks hers at the same moment (ai.js).
//   3. Power = rank, +10 for trump. The Spark rule: a rank 1 beats a rank 9
//      when neither card is trump. Equal power is a clash: both take 1 damage.
//   4. The winner deals the prize as damage to the loser's life. Winning with
//      the same sigil that won the last round is an Echo: +1 damage.
//   5. Both draw back to 5 cards. First to 0 life loses; if the deck runs out
//      first, the higher life wins, then the higher gem count.
import { ECHO_BONUS, HAND_SIZE, RANK_MAX, RANK_MIN, START_LIFE } from './config.js';
import { buildDeck, sortHand } from './deck.js';
import { cardPower, chooseAiCard, vexQuip } from './ai.js';
import { randomInt } from './random.js';

export const PHASE_TITLE = 'title';
export const PHASE_CHOOSE = 'choose';
export const PHASE_REVEAL = 'reveal';
export const PHASE_OVER = 'over';

/** Compare two played cards under `trump`: 1 if `a` wins, -1 if `b` wins, 0 for a clash. */
export function compareCards(a, b, trump) {
  const aTrump = a.sigil === trump;
  const bTrump = b.sigil === trump;
  if (aTrump === bTrump) {
    // The Spark rule: the smallest flame fells the tallest giant.
    if (a.rank === RANK_MIN && b.rank === RANK_MAX) return 1;
    if (b.rank === RANK_MIN && a.rank === RANK_MAX) return -1;
  }
  const diff = cardPower(a, trump) - cardPower(b, trump);
  if (diff > 0) return 1;
  if (diff < 0) return -1;
  return 0;
}

export function createWorld(random) {
  const state = {
    phase: PHASE_TITLE,
    deck: [],
    playerHand: [],
    aiHand: [],
    playerLife: START_LIFE,
    aiLife: START_LIFE,
    playerGems: 0,
    aiGems: 0,
    round: 0,
    trump: 0,
    prize: 1,
    playerPlayed: null,
    aiPlayed: null,
    lastSigil: null,
    lastResult: null,
    winner: null,
    revealT: 0,
    wins: 0,
  };

  function drawUp(hand) {
    while (hand.length < HAND_SIZE && state.deck.length > 0) hand.push(state.deck.pop());
    sortHand(hand);
  }

  function startMatch() {
    state.deck = buildDeck(random);
    state.playerHand = [];
    state.aiHand = [];
    state.playerLife = START_LIFE;
    state.aiLife = START_LIFE;
    state.playerGems = 0;
    state.aiGems = 0;
    state.round = 0;
    state.lastSigil = null;
    state.lastResult = null;
    state.winner = null;
    drawUp(state.playerHand);
    drawUp(state.aiHand);
    nextRound();
  }

  function nextRound() {
    state.round += 1;
    state.trump = (state.round - 1) % 4;
    state.prize = randomInt(random, 1, 3);
    state.playerPlayed = null;
    state.aiPlayed = null;
    state.revealT = 0;
    state.phase = PHASE_CHOOSE;
  }

  function finishIfOver() {
    if (state.playerLife > 0 && state.aiLife > 0) return false;
    state.winner = state.aiLife <= 0 && state.playerLife > 0 ? 'player' : 'ai';
    if (state.playerLife <= 0 && state.aiLife <= 0) {
      state.winner = state.playerGems >= state.aiGems ? 'player' : 'ai';
    }
    state.phase = PHASE_OVER;
    if (state.winner === 'player') state.wins += 1;
    return true;
  }

  function finishByDeck() {
    if (state.playerLife !== state.aiLife) state.winner = state.playerLife > state.aiLife ? 'player' : 'ai';
    else if (state.playerGems !== state.aiGems) state.winner = state.playerGems > state.aiGems ? 'player' : 'ai';
    else state.winner = 'player'; // a perfect tie goes to the challenger: you.
    state.phase = PHASE_OVER;
    if (state.winner === 'player') state.wins += 1;
  }

  /** The player commits the card at `index` of their hand; Vex answers at once. */
  function playCard(index) {
    if (state.phase !== PHASE_CHOOSE) return null;
    if (index < 0 || index >= state.playerHand.length) return null;
    const aiIndex = chooseAiCard(state.aiHand, {
      prize: state.prize,
      trump: state.trump,
      lastSigil: state.lastSigil,
      aiLife: state.aiLife,
      playerLife: state.playerLife,
      random,
    });
    state.playerPlayed = state.playerHand.splice(index, 1)[0];
    state.aiPlayed = state.aiHand.splice(aiIndex, 1)[0];
    state.revealT = 0;
    state.phase = PHASE_REVEAL;
    return state.aiPlayed;
  }

  /** Settle the revealed duel. Called once the flip animation has landed. */
  function settleReveal() {
    const a = state.playerPlayed;
    const b = state.aiPlayed;
    const verdict = compareCards(a, b, state.trump);
    const spark = (a.rank === RANK_MIN && b.rank === RANK_MAX) || (b.rank === RANK_MIN && a.rank === RANK_MAX);
    let outcome = 'tie';
    let damage = 0;
    let echo = false;
    if (verdict > 0) {
      outcome = 'player';
      echo = state.lastSigil !== null && a.sigil === state.lastSigil;
      damage = state.prize + (echo ? ECHO_BONUS : 0);
      state.aiLife = Math.max(0, state.aiLife - damage);
      state.playerGems += state.prize;
      state.lastSigil = a.sigil;
    } else if (verdict < 0) {
      outcome = 'ai';
      echo = state.lastSigil !== null && b.sigil === state.lastSigil;
      damage = state.prize + (echo ? ECHO_BONUS : 0);
      state.playerLife = Math.max(0, state.playerLife - damage);
      state.aiGems += state.prize;
      state.lastSigil = b.sigil;
    } else {
      state.playerLife = Math.max(0, state.playerLife - 1);
      state.aiLife = Math.max(0, state.aiLife - 1);
      state.lastSigil = null;
    }
    const quip = vexQuip(outcome, { prize: state.prize, echo, spark });
    state.lastResult = { outcome, damage, echo, spark, quip, playerCard: a, aiCard: b };
    if (finishIfOver()) return state.lastResult;
    drawUp(state.playerHand);
    drawUp(state.aiHand);
    if (state.playerHand.length === 0 || state.aiHand.length === 0) {
      finishByDeck();
      return state.lastResult;
    }
    nextRound();
    return state.lastResult;
  }

  return { state, startMatch, playCard, settleReveal };
}
