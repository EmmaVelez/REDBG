import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { enumerateLegalActions } from '../ai/enumerate';
import { seatAwaitingAction } from './skill';
import { chooseBotAction } from '../ai/bot';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/** Repro: CAC-013 in a BOT's play area at the end of its turn. */

let counter = 0;

function botGame(): GameState {
  const s = setup(
    { seed: 11, players: [
      { name: 'Bot', controller: 'bot', characterCardId: 'ch-002' },
      { name: 'Human', controller: 'human', characterCardId: 'ch-001' },
    ] },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  const id = `cac-013#repro${++counter}`;
  return {
    ...started,
    cards: { ...started.cards, [id]: { instanceId: id, cardId: 'cac-013', location: { zone: 'playArea', index: 0, seat: 0 } } },
    seats: started.seats.map((p, i) => (i === 0 ? { ...p, playArea: [...p.playArea, id] } : p)),
  };
}

describe('CAC-013 From Bad to Worse — bot originator does not lock the game', () => {
  it('enumerates a resolution for the bot prompt', () => {
    let s = botGame();
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    console.log('ENDED activeSeat', ended.activeSeat, 'prompts', JSON.stringify(ended.prompts.map(p => ({ seat: p.seat, kind: p.payload?.kind }))));
    const legal = enumerateLegalActions(ended, 0);
    console.log('LEGAL', JSON.stringify(legal));
    expect(legal.some(a => a.type === 'chooseOption')).toBe(true);
  });

  it('seatAwaitingAction hands over to the TARGET, not the originator', () => {
    let s = botGame();
    const ended = applyAction(s, { type: 'endTurn', seat: 0 });
    const pick = ended.prompts.find(p => p.payload?.kind === 'cac013ChoosePlayer')!;
    const picked = applyAction(ended, { type: 'chooseOption', seat: 0, promptId: pick.id, option: 0 });
    const target = Number(pick.options[0]);
    expect(target).not.toBe(0);
    expect(seatAwaitingAction(picked)).toBe(target);
  });

  it('does not lock: the bot resolves the prompt and the game advances', () => {
    let s = botGame();
    let steps = 0;
    const seen: string[] = [];
    while (steps < 12) {
      steps += 1;
      // Mirror the server: act for whoever `seatAwaitingAction` names, and a
      // human seat answers its own prompt.
      const active = seatAwaitingAction(s);
      const promptKinds = s.prompts.map(p => `${p.seat}:${p.payload?.kind}`).join(',');
      seen.push(`${active}|${promptKinds}|${s.prompts.length}`);
      const action = active === 0
        ? chooseBotAction(s, active, 'normal', () => 0.5)
        : { type: 'chooseOption' as const, seat: active, promptId: s.prompts.find(p => p.seat === active)!.id, option: 0 };
      console.log('STEP', steps, 'awaiting', active, 'action', JSON.stringify(action));
      const next = applyAction(s, action);
      // no progress at all = lock
      if (next === s) throw new Error('applyAction returned the identical state — lock');
      if (next.activeSeat === s.activeSeat && next.prompts.length === s.prompts.length && next.version === s.version) {
        throw new Error('no state change — lock');
      }
      s = next;
      if (s.activeSeat !== 0) break;
    }
    console.log('TRACE', JSON.stringify(seen, null, 0));
    expect(s.activeSeat).not.toBe(0);
  });
});
