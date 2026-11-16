import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { abilitiesForLevel } from './characters';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * AW-001 Albert Wesker: THREE abilities starting at level 0 (Manny correction).
 *   L0: (drawOncePerTurnIfDamaged) once per turn, if HP < maxHP, draw +1 card —
 *       delivered as a turn-start prompt.
 *   L1: (allDamageReduction) all Damage Albert receives is reduced by 10.
 *   L2: (exploreDamageIfHpAtMost) when Exploring at HP <= 50, +20 Damage.
 * The opening tier is level 0 — no decorations required.
 */

function wesker(hp: number, level: 0 | 1 | 2): GameState {
  const players = [
    { name: 'A', controller: 'human' as const, characterCardId: 'aw-001' },
    { name: 'B', controller: 'human' as const, characterCardId: 'ch-003' },
  ];
  const s = setup(
    { seed: 11, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp, maxHp: 100, level } : p)) };
}

describe('AW-001 Wesker — level-0 starting ability', () => {
  it('abilitiesForLevel gates the three abilities at 0 / 1 / 2', () => {
    const def = CUSTOM_CARDS.find(c => c.id === 'aw-001');
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.map(a => a.level)).toEqual([0, 1, 2]);
    // Manny's correction: the card's opening tier is LEVEL 0, not gate-2.
    expect(def?.level1At).toBe(2);
    expect(abilitiesForLevel(def?.abilities, 0).map(a => a.kind)).toEqual(['drawOncePerTurnIfDamaged']);
    expect(abilitiesForLevel(def?.abilities, 1).map(a => a.kind)).toEqual(['drawOncePerTurnIfDamaged', 'allDamageReduction']);
    expect(abilitiesForLevel(def?.abilities, 2).map(a => a.kind)).toHaveLength(3);
  });

  it('the level-0 draw fires as a turn-start prompt at level 0 (hp < max)', () => {
    const s = startTurn(wesker(80, 0));
    const p = s.prompts.find(pr => pr.payload?.kind === 'drawOncePerTurnIfDamaged');
    expect(p).toBeDefined();
    const resolved = applyAction(s, { type: 'chooseOption', seat: 0, promptId: p?.id ?? '', option: 0 });
    expect(resolved.seats[0]!.hand.length).toBe(s.seats[0]!.hand.length + 1);
  });

  it('the L2 damage passive is inactive at level 0 and active at level 2', () => {
    // hp 40 <= 50: +20 only when the L2 tier is unlocked.
    const low0 = wesker(40, 0);
    expect(exploreDamage(low0, 0, [])).toBe(0);
    const low2 = wesker(40, 2);
    expect(exploreDamage(low2, 0, [])).toBe(20);
  });
});