import { describe, it, expect } from 'vitest';
import type { GameState } from '@re/game-core';
import { formatTurnHistory } from './turnHistory';

/** The minimum state formatTurnHistory reads: seats (for names) + the log. */
function stateWith(log: ReadonlyArray<{ seq: number; action: Record<string, unknown> }>): GameState {
  return {
    version: 2,
    seed: 1,
    rngState: 1,
    phase: 'main',
    activeSeat: 0,
    turnNumber: 1,
    seats: [
      { seat: 0, name: 'Ada', characterInstanceId: '', hp: 80, maxHp: 80, decorations: 0, level: 0, turnAmmo: 0, turnGold: 0, actionsLeft: 1, buysLeft: 1, exploresLeft: 1, weaponDamageBonusThisTurn: 0, attached: [], inventory: [], hand: [], discard: [], playArea: [], downed: false, dead: false, controller: 'human' },
      { seat: 1, name: 'Leon', characterInstanceId: '', hp: 90, maxHp: 90, decorations: 0, level: 0, turnAmmo: 0, turnGold: 0, actionsLeft: 1, buysLeft: 1, exploresLeft: 1, weaponDamageBonusThisTurn: 0, attached: [], inventory: [], hand: [], discard: [], playArea: [], downed: false, dead: false, controller: 'human' },
    ],
    marketPiles: {},
    mansionDeck: [],
    removed: [],
    cards: {},
    cardDefs: {},
    prompts: [],
    winners: [],
    log: log.map(e => ({ seq: e.seq, action: e.action as never })),
  } as unknown as GameState;
}

const EXPLORE = { type: 'explore', seat: 1, weapons: [], exploreCount: 1 };

describe('turn history: explore lines name the revealed card and the result', () => {
  it('appends the revealed card name and the damage taken', () => {
    const lines = formatTurnHistory(stateWith([
      { seq: 1, action: EXPLORE },
      { seq: 2, action: { type: 'exploreReveal', seat: 1, instanceId: 'ma-001#1', name: 'Majini', outcome: 'notDefeated', damageTaken: 30 } },
    ]));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.seatName).toBe('Leon');
    expect(lines[0]?.text).toContain('explored the Mansion');
    expect(lines[0]?.text).toContain('revealed Majini');
    expect(lines[0]?.text).toContain('took 30 damage');
  });

  it('says "defeated" and omits the damage clause when the Infected fell', () => {
    const lines = formatTurnHistory(stateWith([
      { seq: 1, action: EXPLORE },
      { seq: 2, action: { type: 'exploreReveal', seat: 0, instanceId: 'ma-001#2', name: 'Majini', outcome: 'defeated', damageTaken: 0 } },
    ]));
    expect(lines[0]?.text).toContain('revealed Majini — defeated');
    expect(lines[0]?.text).not.toContain('damage');
  });

  it('names a removed card', () => {
    const lines = formatTurnHistory(stateWith([
      { seq: 1, action: EXPLORE },
      { seq: 2, action: { type: 'exploreReveal', seat: 0, instanceId: 'ev-001#1', name: 'Zombie Grab', outcome: 'removed' } },
    ]));
    expect(lines[0]?.text).toContain('removed from the game');
  });

  it('still works for older logs that carry no outcome fields', () => {
    const lines = formatTurnHistory(stateWith([
      { seq: 1, action: EXPLORE },
      { seq: 2, action: { type: 'exploreReveal', seat: 1, instanceId: 'ma-001#1', name: 'Majini' } },
    ]));
    expect(lines[0]?.seatName).toBe('Leon');
    expect(lines[0]?.text).toContain('explored the Mansion');
    expect(lines[0]?.text).toContain('— revealed Majini');
    expect(lines[0]?.text).not.toContain('damage');
  });
});
