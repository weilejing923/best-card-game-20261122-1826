// The screenshot scenes behind ?shot=start|play|win|lose. Each one builds a
// real match state with the game's own rules and cards — the play scene is a
// genuine mid-match table (round 4, trump Moon, a 3-gem prize, both hands
// dealt), and the win/lose scenes are settled matches — so what the camera
// sees is what a player sees, never a mock-up.
import { makeCard } from './deck.js';
import { PHASE_OVER, PHASE_REVEAL, PHASE_TITLE } from './world.js';

function dealSceneHands(world) {
  const s = world.state;
  s.playerHand = [makeCard(0, 3), makeCard(1, 7), makeCard(1, 2), makeCard(2, 9), makeCard(3, 5)];
  s.aiHand = [makeCard(0, 8), makeCard(1, 4), makeCard(2, 2), makeCard(3, 9), makeCard(0, 1)];
  s.deck = Array.from({ length: 18 }, (_, i) => makeCard(i % 4, (i % 9) + 1));
}

/** Set `world` to the named scene and return nothing; main.js paints it. */
export function stageShot(name, world) {
  const s = world.state;
  world.startMatch();
  if (name === 'play') {
    // The duel moment itself: both cards face up in the middle, Vex's giant
    // Sun 9 against the player's trump Moon 7 (power 17), a 3-gem prize on
    // the line, both hands down to four cards.
    dealSceneHands(world);
    s.phase = PHASE_REVEAL;
    s.revealT = 2;
    s.round = 4;
    s.trump = 1; // Moon
    s.prize = 3;
    s.playerLife = 9;
    s.aiLife = 7;
    s.playerGems = 4;
    s.aiGems = 3;
    s.lastSigil = 1;
    s.playerPlayed = makeCard(1, 7);
    s.aiPlayed = makeCard(0, 9);
    s.playerHand = [makeCard(0, 3), makeCard(1, 2), makeCard(2, 9), makeCard(3, 5)];
    s.aiHand = [makeCard(0, 8), makeCard(1, 4), makeCard(2, 2), makeCard(3, 9)];
    s.lastResult = null;
    return;
  }
  if (name === 'win' || name === 'lose') {
    dealSceneHands(world);
    const won = name === 'win';
    s.phase = PHASE_OVER;
    s.winner = won ? 'player' : 'ai';
    s.round = 9;
    s.trump = 0;
    s.prize = 2;
    s.playerLife = won ? 6 : 0;
    s.aiLife = won ? 0 : 5;
    s.playerGems = won ? 11 : 5;
    s.aiGems = won ? 5 : 10;
    s.playerPlayed = makeCard(0, 9);
    s.aiPlayed = makeCard(3, 6);
    if (!won) { s.playerPlayed = makeCard(2, 4); s.aiPlayed = makeCard(1, 9); }
    return;
  }
  // start: the title over a freshly dealt table
  dealSceneHands(world);
  s.phase = PHASE_TITLE;
  s.trump = 0;
  s.prize = 2;
}
