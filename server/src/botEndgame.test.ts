import { describe, it, expect, afterEach } from 'vitest';
import { createGameServer } from './ws';
import type { GameServer } from './ws';
import type { ServerMessage } from './protocol';
import { connect, open, waitFor, drain, isWelcome, isRoomState, isGameStarted, isStateSync } from './testHelpers';
import { enumerateLegalActions } from '@re/game-core';
import type { GameState } from '@re/game-core';

const servers: GameServer[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** Deterministic RNG so the whole run (seed, bot characters, draws) is fixed. */
function makeRand(seed0: number): () => number {
  let s = seed0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Regression: a room whose human seats are all dead must not freeze on a bot's
 * turn.
 *
 * `advanceBots` used to run one bounded pass after the human's move and then
 * stop. With every human dead nothing could nudge the game forward again, so
 * the room sat on "Waiting for Bot N…" forever. Seed 131 reproduces it: the
 * human is permanently defeated at turn 496 and the pre-fix server never
 * broadcasts anything again (no gameOver, no views).
 *
 * The fix plays the bot-only endgame out in background passes — visible as
 * repeated stateSyncs — until the match reaches a result. The budget override
 * keeps the test short: a bot-only endgame the bots cannot finish is
 * concluded instead of grinding forever.
 */
describe('bot-only endgame after the human dies', () => {
  it('keeps broadcasting and reaches a result instead of going silent', async () => {
    const server = createGameServer({ port: 0, heartbeatMs: 0, rand: makeRand(131), botEndgameBudget: 2500 });
    servers.push(server);
    const host = connect(server);
    await open(host);
    await waitFor(host, isWelcome, 3000, 'welcome');
    host.send({ kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer', partnerMode: false, mainCharacterId: 'pr-010', partnerCharacterId: undefined, skillSystem: false, customCards: [] });
    await waitFor(host, isRoomState, 3000, 'room');
    host.send({ kind: 'addBot', seat: 1 });
    await waitFor(host, isRoomState, 3000, 'bot1');
    host.send({ kind: 'addBot', seat: 2 });
    await waitFor(host, isRoomState, 3000, 'bot2');
    host.send({ kind: 'startGame' });
    await waitFor(host, isGameStarted, 5000, 'started');

    // Drive the human into the mansion with the weakest weapon every turn so
    // the Infected wins the fight and the human is eventually permanently
    // defeated (revive at max Health <= 0). Every batch is scanned: the death
    // view and the endgame's result can arrive in the same burst.
    let deadSeen = false;
    let gameOver = false;
    let updates = 0;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !gameOver) {
      const msgs = await drain(host, 100);
      let last: GameState | null = null;
      for (const m of msgs) {
        if (m.kind === 'gameOver') {
          gameOver = true;
          continue;
        }
        if (!isStateSync(m)) continue;
        const st = m.view.state as GameState;
        last = st;
        if (deadSeen) {
          updates++;
        } else if (st.seats[0]?.dead === true) {
          deadSeen = true;
        }
      }
      // Act for the human on the newest view of the batch, only while the
      // human is still alive and it is their turn.
      if (!deadSeen && last !== null && last.phase === 'main' && last.activeSeat === 0) {
        const legal = enumerateLegalActions(last, 0);
        const explores = legal.filter(a => a.type === 'explore');
        const knives = explores.filter(a => a.type === 'explore' && a.weapons.length === 1);
        const pick = knives[0] ?? explores[0] ?? legal.find(a => a.type === 'endTurn');
        if (pick !== undefined) host.send({ kind: 'sendAction', action: pick } as never);
      }
    }
    expect(deadSeen, 'the human should be permanently defeated during the drive').toBe(true);
    expect(updates, 'the bots-only endgame must keep producing views').toBeGreaterThanOrEqual(2);
    expect(gameOver, 'the bots-only endgame must reach a result').toBe(true);
  }, 240000);
});
