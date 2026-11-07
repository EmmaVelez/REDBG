import { describe, test, expect } from 'vitest';
import { playBotGame } from './sim';
import type { SimResult } from './sim';
import { SCENARIOS, cardsForScenario, pilesForScenario } from '../data/cards';
import type { ScenarioId } from '../data/cards';
import { checkWin } from '../engine/game';
import { MAX_INFECTION_LEVEL } from '../engine/actions';
import type { GameState } from '../types';

/**
 * M5-T04: full-game bot soak.
 *
 * M2-T05 ran a handful of First Timer games and asserted only "no throw".
 * This suite plays EVERY scenario end to end with four hard bots and checks
 * the invariants that a throw cannot catch:
 *
 * - CONSERVATION: every registered card instance is either in exactly one
 *   zone, attached to a character, or in `removed` — and no zone holds an id
 *   twice. This is what caught the starting-deck id collision (all four seats
 *   dealt the same `am-001#1`), which made `state.cards` unable to name three
 *   of the four physical cards.
 * - SANITY: pools never negative, HP within [0, maxHp], activeSeat in range,
 *   Outbreak infection levels within 0..MAX_INFECTION_LEVEL.
 * - TERMINATION: the reported `ended` agrees with the engine's own win check,
 *   and most games finish naturally instead of hitting the action cap.
 *
 * Character instances are registered but intentionally outside every zone
 * (setup registers them without placing them), so they are accounted for
 * separately rather than treated as leaks.
 */

const DIFFICULTIES = ['hard', 'hard', 'hard', 'hard'] as const;
const SEEDS = [1, 2, 3];
const MAX_ACTIONS = 4000;

/** Every instance id placed in a zone. Character cards live outside zones. */
function zoneInstanceIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const seat of state.seats) {
    ids.push(...seat.hand, ...seat.inventory, ...seat.discard, ...seat.playArea, ...seat.attached, ...(seat.infectionCards ?? []), ...(seat.partnerAttached ?? []));
  }
  for (const pile of Object.values(state.marketPiles)) ids.push(...pile.cards);
  ids.push(...state.mansionDeck, ...state.mansionBottom);
  ids.push(...(state.infectionDeck ?? []));
  return ids;
}

function characterInstanceIds(state: GameState): string[] {
  return Object.values(state.cards)
    .filter(ci => state.cardDefs[ci.cardId]?.type === 'character')
    .map(ci => ci.instanceId);
}

function assertNoDuplicatePlacements(state: GameState, ctx: string): void {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const id of zoneInstanceIds(state)) {
    if (seen.has(id)) dupes.push(id);
    seen.add(id);
  }
  expect(dupes, `${ctx}: same instance in two zones: ${dupes.slice(0, 8).join(', ')}`).toEqual([]);
}

function assertConserved(state: GameState, ctx: string): void {
  const zoneSet = new Set(zoneInstanceIds(state));
  for (const id of zoneSet) {
    expect(state.cards[id], `${ctx}: zone instance ${id} is not registered`).toBeDefined();
  }
  const union = new Set([...zoneSet, ...state.removed, ...characterInstanceIds(state)]);
  const registered = new Set(Object.keys(state.cards));
  const orphans = [...registered].filter(id => !union.has(id));
  expect(orphans, `${ctx}: registered instances in no zone: ${orphans.slice(0, 8).join(', ')}`).toEqual([]);
  const ghost = [...union].filter(id => !registered.has(id));
  expect(ghost, `${ctx}: zone instances never registered: ${ghost.slice(0, 8).join(', ')}`).toEqual([]);
  expect(union.size, `${ctx}: union vs registered`).toBe(registered.size);
}

function assertSane(state: GameState, scenario: ScenarioId): void {
  expect(state.activeSeat, 'activeSeat in range').toBeGreaterThanOrEqual(0);
  expect(state.activeSeat).toBeLessThan(state.seats.length);
  expect(state.turnNumber, 'turnNumber >= 1').toBeGreaterThanOrEqual(1);
  expect(Number.isFinite(state.turnNumber), 'turnNumber finite').toBe(true);

  for (const seat of state.seats) {
    const pools: ReadonlyArray<readonly [string, number]> = [
      ['turnAmmo', seat.turnAmmo],
      ['turnGold', seat.turnGold],
      ['actionsLeft', seat.actionsLeft],
      ['buysLeft', seat.buysLeft],
      ['exploresLeft', seat.exploresLeft],
    ];
    for (const [name, value] of pools) {
      expect(value, `seat ${seat.seat} ${name} negative`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(value), `seat ${seat.seat} ${name} finite`).toBe(true);
    }
    // maxHp can go negative for a character who died on revive (rule: death at
    // maxHp 0), so the upper bound is clamped at 0 rather than maxHp.
    expect(seat.hp, `seat ${seat.seat} hp >= 0`).toBeGreaterThanOrEqual(0);
    expect(seat.hp, `seat ${seat.seat} hp <= maxHp`).toBeLessThanOrEqual(Math.max(seat.maxHp, 0));
  }

  if (scenario === 'outbreak') {
    expect(Array.isArray(state.infectionDeck), 'outbreak has an Infection Deck').toBe(true);
    for (const seat of state.seats) {
      const level = (seat.infectionCards ?? []).length;
      // Rulebook: "All Characters have a Maximum Infection Level of 10."
      // (This bound used to be a heuristic 0..3; seed 16 at the pre-dedup HEAD
      //  already reached 7, so it was a latent flake rather than a rule.)
      expect(level, `seat ${seat.seat} infection level in 0..${MAX_INFECTION_LEVEL}`).toBeLessThanOrEqual(MAX_INFECTION_LEVEL);
    }
  }
}

describe('M5-T04 full-game bot soak', () => {
  test('every scenario plays a full game with conserved, sane, terminating state', () => {
    const scenarioIds = SCENARIOS.map(s => s.id as ScenarioId);
    expect(scenarioIds).toHaveLength(10);

    let natural = 0;
    let total = 0;
    const perScenario: Record<string, string> = {};

    for (const scenario of scenarioIds) {
      let scenarioNatural = 0;
      for (const seed of SEEDS) {
        let r: SimResult;
        try {
          r = playBotGame({ seed, difficulties: DIFFICULTIES, maxActions: MAX_ACTIONS, scenario });
        } catch (e) {
          throw new Error(`${scenario}/${seed}: ${(e as Error).message}`);
        }
        total++;
        if (r.ended === 'gameOver') {
          natural++;
          scenarioNatural++;
        }

        assertNoDuplicatePlacements(r.state, `${scenario}/${seed}`);
        assertConserved(r.state, `${scenario}/${seed}`);
        assertSane(r.state, scenario);

        // The reported ending must agree with the engine's own win check.
        const win = checkWin(r.state);
        if (r.ended === 'gameOver') {
          expect(win.gameOver, `${scenario}/${seed} ended=gameOver but engine disagrees`).toBe(true);
        } else {
          expect(win.gameOver, `${scenario}/${seed} hit the cap but the engine says game over`).toBe(false);
        }
      }
      perScenario[scenario] = `${scenarioNatural}/${SEEDS.length} natural`;
    }

    // Most games must finish on their own; a scenario whose bots can never
    // end the game is a balance/AI defect, not a soak formality.
    expect(natural / total, `natural-end rate ${natural}/${total}: ${JSON.stringify(perScenario)}`).toBeGreaterThanOrEqual(0.6);
    console.log(`soak: ${natural}/${total} games ended naturally`, perScenario);
  }, 180000);

  test('expansion scenarios are deterministic for a fixed seed', () => {
    for (const scenario of ['alliance', 'partnersInEscape', 'outbreak'] as const) {
      const a = playBotGame({ seed: 11, difficulties: DIFFICULTIES, maxActions: MAX_ACTIONS, scenario });
      const b = playBotGame({ seed: 11, difficulties: DIFFICULTIES, maxActions: MAX_ACTIONS, scenario });
      expect(JSON.stringify(a.state), scenario).toBe(JSON.stringify(b.state));
      expect(a.ended, scenario).toBe(b.ended);
      expect(a.actionsApplied, scenario).toBe(b.actionsApplied);
    }
  }, 180000);

  test('every scenario pile + mansion card resolves in its own card pool', () => {
    const unresolved: string[] = [];
    for (const scenario of SCENARIOS) {
      const pool = new Set(cardsForScenario(scenario.id as ScenarioId).map(c => c.id));
      for (const pile of pilesForScenario(scenario.id as ScenarioId)) {
        for (const id of pile.cardIds) {
          if (!pool.has(id)) unresolved.push(`${scenario.id} pile ${pile.pileId}: ${id}`);
        }
      }
      for (const mc of (scenario as { mansionCards?: ReadonlyArray<{ cardId: string; count: number }> }).mansionCards ?? []) {
        if (!pool.has(mc.cardId)) unresolved.push(`${scenario.id} mansion: ${mc.cardId}`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});
