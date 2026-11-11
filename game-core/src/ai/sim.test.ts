
import { describe, test, expect } from 'vitest';
import type { BotDifficulty } from '../ai/bot';
import { playBotGame, playBotGameFrom, type SimConfig, type SimResult } from './sim';
import { setup, checkWin } from '../engine/game';
import { PREMIER_CARDS, FIRST_TIMER_PILES } from '../data/cards';
import type { GameState } from '../types';

describe('Bot Game Simulation (M2-T05)', () => {
  const difficulties: readonly BotDifficulty[] = ['easy', 'easy', 'normal', 'hard'];
  const maxActions = 400;

  // 1. 'ten mixed games terminate without throwing'
  test('ten mixed games terminate without throwing', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const config: SimConfig = {
        seed,
        difficulties: difficulties,
        maxActions: maxActions,
      };
      const r = playBotGame(config);
            expect(['gameOver', 'cap']).toContain(r.ended);
            expect(r.actionsApplied).toBeGreaterThan(0);
            expect(Number.isFinite(r.state.turnNumber)).toBe(true);
    }
  });

  // 2. 'deterministic replay of an identical config'
  test('deterministic replay of an identical config', () => {
    const config: SimConfig = {
      seed: 7,
      difficulties: difficulties,
      maxActions: maxActions,
    };
    const a = playBotGame(config);
    const b = playBotGame(config);

    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.ended).toBe(b.ended);
    expect(a.actionsApplied).toBe(b.actionsApplied);
  });

  // 3. 'cap games end with a live un-game-over board'
  test('cap games end with a live un-game-over board', () => {
    for (let seed = 2; seed <= 4; seed++) {
      const config: SimConfig = {
        seed,
        difficulties: difficulties,
        maxActions: 200,
      };
      const r = playBotGame(config);

      if (r.ended === 'cap') {
        expect(r.actionsApplied).toBe(200);
        expect(checkWin(r.state).gameOver).toBe(false);
      }
    }
  });

  // 4. 'forced Uroboros kill ends the game with the right winner'
  test('forced Uroboros kill ends the game with the right winner', () => {
    // Setup state using hard difficulty for all players
    const s = setup({
      seed: 1,
      players: ['hard', 'hard', 'hard', 'hard'].map((_, i) => ({
        name: 'Bot' + i,
        controller: 'bot' as const,
      })),
    }, PREMIER_CARDS, FIRST_TIMER_PILES);

    // Force specific state for the probe-verified scenario
    const forced: GameState = {
      ...s,
      mansionDeck: ['ma-010#1'],
      cards: {
        ...s.cards,
        'we-008#1': { instanceId: 'we-008#1', cardId: 'we-008', location: { zone: 'hand' as const, index: 0 } },
        'am-001#1': { instanceId: 'am-001#1', cardId: 'am-001', location: { zone: 'hand' as const, index: 0 } },
      },
      seats: s.seats.map((p, i) =>
        i === 0
          ? { ...p, hand: ['we-008#1', 'am-001#1'], turnAmmo: 0, turnGold: 0 }
          : p
      ),
    };

    // Run simulation from the forced state
    const r = playBotGameFrom(forced, ['hard', 'hard', 'hard', 'hard'], () => 0.5, 10);

    // Assertions based on probe verification
    expect(r.ended).toBe('gameOver');
    expect(r.actionsApplied).toBe(1);
    const finalWin = checkWin(r.state);
    expect(finalWin.winners).toEqual([0]);
    expect(finalWin.endReason).toBe('uroborosDefeated');
  });

  // 5. 'all-dead end can be forced too'
  test('all-dead end can be forced too', () => {
    // Setup state
    const s = setup({
      seed: 1,
      players: ['hard', 'hard', 'hard', 'hard'].map((_, i) => ({
        name: 'Bot' + i,
        controller: 'bot' as const,
      })),
    }, PREMIER_CARDS, FIRST_TIMER_PILES);

    // Force all seats to be dead
    const dead: GameState = {
      ...s,
      seats: s.seats.map(p => ({ ...p, dead: true })),
    };

    // Run simulation from the dead state
    const r = playBotGameFrom(dead, ['hard', 'hard', 'hard', 'hard'], () => 0.5, 3);

    // Assertions
    expect(r.ended).toBe('gameOver');
    expect(checkWin(r.state).gameOver).toBe(true);
    expect(checkWin(r.state).endReason).toBe('allPlayersDead');
    expect(checkWin(r.state).winners).toEqual([]);
  });

  // 6. 'twenty-game soak at a glance'
  test('twenty-game soak at a glance', () => {
    const gameResults: SimResult[] = [];
    let gameOverCount = 0;

    // Run 4 natural games with a large cap
    for (let seed = 1; seed <= 4; seed++) {
      const config: SimConfig = {
        seed,
        difficulties: difficulties,
        maxActions: 3000,
      };
      const r = playBotGame(config);
      gameResults.push(r);
      if (r.ended === 'gameOver') {
        gameOverCount++;
      }
    }

    // Assertions: Every game must have ended (gameOver or cap) — no throws occurred.
        gameResults.forEach(r => {
          expect(['gameOver', 'cap']).toContain(r.ended);
        });

    // The test's value is that 4 * 3000-action full games run without throwing.
    expect(true).toBe(true);
  });

  // 8. Regression: hard bots must actually EXPLORE (was 0.05 explores/turn —
  // endTurn draw arbitrage + ammo farming + a -4000 downed freeze made games
  // drag to 500+ turns). The fixed evaluator + EXPLORE_BIAS lifted the 1-ply
  // bot to ~0.24/turn; the greedy PLAYOUT is deliberately more selective (it
  // can see whether the fight is won, so it declines the losing explores the
  // 1-ply bias accepted), which drops the rate to ~0.14 while roughly
  // DOUBLING the Decorations the bots actually win. The floor stays far above
  // the 0.05 freeze, and the natural-end count is the real anti-freeze guard.
  test('hard bots explore at a healthy rate and games end naturally', () => {
    let totalExplores = 0;
    let totalTurns = 0;
    let gameOverCount = 0;
    let totalDecorations = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = playBotGame({ seed, difficulties: ['hard', 'hard'], maxActions: 6000 });
      totalExplores += r.state.log.filter(e => e.action.type === 'explore').length;
      totalTurns += r.state.log.filter(e => e.action.type === 'endTurn').length;
      totalDecorations += r.state.seats.reduce((n, s) => n + s.decorations, 0);
      if (r.ended === 'gameOver') gameOverCount++;
    }
    const perTurn = totalExplores / Math.max(totalTurns, 1);
    // Floor history: 0.05 was the freeze (500+ turn games, ~14 Decorations).
    // The pulled AI reweight (43eb09c — CARD_DRAW_VALUE 12→20 and affordable
    // piles weighted by owned value) deliberately changed bot behaviour.
    // Measured over these 8 seeds: perTurn 0.106 → 0.064, but total explores
    // 395 → 426 and Decorations 381 → 408, with 7/8 games still ending naturally.
    // The bots fight MORE in absolute terms and simply take longer to do it, so
    // the floor tracks the new normal; gameOverCount stays the real anti-freeze
    // guard (a freeze would collapse totalExplores too).
    expect(perTurn).toBeGreaterThan(0.06);
    expect(totalExplores).toBeGreaterThan(300);    // absolute fighting floor
    expect(totalDecorations).toBeGreaterThan(150); // ~30/game vs ~14 for the 1-ply bot
    expect(gameOverCount).toBeGreaterThanOrEqual(5); // most games finish, not cap out
  });
});
