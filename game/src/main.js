// Boot and the frame loop. Sigil Clash is turn-based: the loop only animates
// (card flips, gem bursts, hover lifts) and moves the match between its
// phases — title → choose → reveal (1.25 s) → choose … → game over.
//
// ?seed=N fixes the deal. ?shot=start|play|win|lose (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, PHASE_CHOOSE, PHASE_OVER, PHASE_REVEAL, PHASE_TITLE } from './world.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { soundClash, soundClick, soundFlip, soundLose, soundWin } from './sound.js';

const REVEAL_SECONDS = 1.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the streak then lasts this visit only.
  }
}

function runShot(name) {
  stageShot(name, world);
  // The staged duel is frozen a breath after impact: a burst of gold, mid-air.
  if (name === 'play') renderer.burst(730, 345, 16);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, { hover: name === 'play' ? 1 : -1, best: 2, dt: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  // The input needs the renderer's view transform; the renderer owns it, so
  // recompute the same fit here from the canvas size.
  const view = { scale: 1, x: 0, y: 0 };
  function fitView() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(width / 1280, height / 720);
    view.x = (width - 1280 * view.scale) / 2;
    view.y = (height - 720 * view.scale) / 2;
  }
  fitView();
  window.addEventListener('resize', fitView);

  const input = createInput(canvas, view);
  let best = readBest();
  let last = performance.now();
  let announcedPhase = '';

  function announce(message) {
    status.textContent = message;
  }

  function startMatch() {
    world.startMatch();
    soundClick();
    announce(`A new duel. You and Vex both hold ${world.state.playerLife} hearts. Pick a card.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const s = world.state;

    if (s.phase !== announcedPhase) {
      announcedPhase = s.phase;
      if (s.phase === PHASE_OVER) {
        announce(s.winner === 'player' ? 'Victory! You broke all of Vex’s hearts.' : 'Defeat. Vex broke all your hearts.');
        if (s.winner === 'player') {
          soundWin();
          renderer.burst(640, 330, 26);
          if (s.wins > best) { best = s.wins; saveBest(best); }
        } else soundLose();
      }
    }

    const difficultyPick = input.takeDifficulty();
    if (s.phase === PHASE_TITLE && difficultyPick >= 0 && difficultyPick !== s.difficulty) {
      world.setDifficulty(difficultyPick);
      soundClick();
      announce(`Difficulty: ${['Calm', 'Standard', 'Ruthless'][difficultyPick]}. Click or press Enter to play.`);
    }

    const confirm = input.takeConfirm();
    if ((s.phase === PHASE_TITLE || s.phase === PHASE_OVER) && confirm) {
      startMatch();
      input.takePick(s.playerHand.length); // the starting click must not also play a card
    }

    if (s.phase === PHASE_CHOOSE) {
      const pick = input.takePick(s.playerHand.length);
      if (pick >= 0) {
        const played = world.playCard(pick);
        if (played) {
          soundFlip();
          announce('Cards are cast. Vex reveals hers…');
        }
      }
    } else {
      input.takePick(s.playerHand.length);
    }

    if (s.phase === PHASE_REVEAL) {
      s.revealT += dt;
      if (s.revealT >= REVEAL_SECONDS) {
        const result = world.settleReveal();
        if (result) {
          if (result.outcome === 'player') { soundWin(); renderer.burst(700, 330, 12); }
          else if (result.outcome === 'ai') soundLose();
          else soundClash();
          announce(resultLineFor(result));
        }
      }
    }

    renderer.draw(s, { hover: input.hoverIndex(s.playerHand.length), best, dt });
  }

  function resultLineFor(r) {
    if (r.outcome === 'player') return `You win the round. Vex loses ${r.damage} life.`;
    if (r.outcome === 'ai') return `Vex wins the round. You lose ${r.damage} life.`;
    return 'A clash. Both lose 1 life.';
  }

  world.startMatch();
  world.state.phase = PHASE_TITLE;
  announce('Sigil Clash. Click or press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
