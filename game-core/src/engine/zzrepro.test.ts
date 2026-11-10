import { describe, test, expect } from 'vitest';
import { setup, startTurn, checkWin } from './game';
import { applyAction } from './actions';
import { enumerateLegalActions } from '../ai/enumerate';
import { chooseBotAction } from '../ai/bot';
import { PREMIER_CARDS, FIRST_TIMER_PILES, ALL_CARDS, OUTBREAK_PILES, OUTBREAK_MANSION } from '../data/cards';
import type { GameState } from '../types';

const human = (name: string) => ({ name, controller: 'human' as const });
const bot = (name: string) => ({ name, controller: 'bot' as const });

function threeSeat(over: (s: GameState) => GameState = s => s): GameState {
  return over(setup(
    { seed: 7, players: [human('HUNK'), bot('Bot 1'), bot('Bot 2')], scenario: 'outbreak' },
    ALL_CARDS,
    OUTBREAK_PILES,
    OUTBREAK_MANSION,
  ));
}

describe('repro: final down then bot turns', () => {
  test('HUNK downed at 20 max hp -> dead, turn passes to a bot that can act', () => {
    const base = threeSeat(st => ({
      ...st,
      activeSeat: 0,
      phase: 'main' as const,
      seats: st.seats.map((p, i) => (i === 0
        ? { ...p, characterInstanceId: 'pr-010#1', downed: true, dead: false, hp: 0, maxHp: 20, hand: [], discard: [], playArea: [] }
        : p)),
    }));
    const cards = { ...base.cards };
    cards['pr-010#1'] = { instanceId: 'pr-010#1', cardId: 'pr-010', location: { zone: 'hand', index: 0 } };
    const s = { ...base, cards };

    console.log('BEFORE  activeSeat=%d hp=%d/%d downed=%s dead=%s',
      s.activeSeat, s.seats[0]!.hp, s.seats[0]!.maxHp, s.seats[0]!.downed, s.seats[0]!.dead);

    const after = startTurn(s);
    const hunk = after.seats[0]!;
    console.log('AFTER   activeSeat=%d turn=%d hp=%d/%d downed=%s dead=%s phase=%s win=%j',
      after.activeSeat, after.turnNumber, hunk.hp, hunk.maxHp, hunk.downed, hunk.dead, after.phase,
      checkWin(after));

    expect(hunk.dead).toBe(true);
    expect(after.activeSeat).not.toBe(0);

    // the new active seat must be a live seat that can actually act
    const active = after.seats[after.activeSeat]!;
    console.log('ACTIVE  seat=%d name=%s dead=%s downed=%s hp=%d',
      active.seat, active.name, active.dead, active.downed, active.hp);
    expect(active.dead).toBe(false);

    const legal = enumerateLegalActions(after, after.activeSeat);
    console.log('LEGAL   %d actions: %s', legal.length, legal.map(a => a.type).join(','));
    expect(legal.length).toBeGreaterThan(0);

    const botAction = chooseBotAction(after, after.activeSeat, 'hard', () => 0.5);
    console.log('BOT     %j', botAction);
    const next = applyAction(after, botAction);
    console.log('NEXT    activeSeat=%d turn=%d win=%j', next.activeSeat, next.turnNumber, checkWin(next));
  });

  test('same but the human seat is the ONLY seat left alive besides one bot', () => {
    const base = threeSeat(st => ({
      ...st,
      activeSeat: 0,
      phase: 'main' as const,
      seats: st.seats.map((p, i) => {
        if (i === 0) return { ...p, characterInstanceId: 'pr-010#1', downed: true, dead: false, hp: 0, maxHp: 20, hand: [], discard: [], playArea: [] };
        if (i === 1) return { ...p, dead: true, downed: false };
        return p;
      }),
    }));
    const cards = { ...base.cards };
    cards['pr-010#1'] = { instanceId: 'pr-010#1', cardId: 'pr-010', location: { zone: 'hand', index: 0 } };
    const s = { ...base, cards };

    const after = startTurn(s);
    console.log('ONLY-ONE activeSeat=%d win=%j seat0 dead=%s seat2 dead=%s',
      after.activeSeat, checkWin(after), after.seats[0]!.dead, after.seats[2]!.dead);
  });

  test('all players dead after the final down', () => {
    const base = threeSeat(st => ({
      ...st,
      activeSeat: 0,
      phase: 'main' as const,
      seats: st.seats.map((p, i) => {
        if (i === 0) return { ...p, characterInstanceId: 'pr-010#1', downed: true, dead: false, hp: 0, maxHp: 20, hand: [], discard: [], playArea: [] };
        return { ...p, dead: true, downed: false };
      }),
    }));
    const cards = { ...base.cards };
    cards['pr-010#1'] = { instanceId: 'pr-010#1', cardId: 'pr-010', location: { zone: 'hand', index: 0 } };
    const s = { ...base, cards };

    const after = startTurn(s);
    console.log('ALL-DEAD activeSeat=%d win=%j', after.activeSeat, checkWin(after));
    expect(checkWin(after).gameOver).toBe(true);
  });
});
