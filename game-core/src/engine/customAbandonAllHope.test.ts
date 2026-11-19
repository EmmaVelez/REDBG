import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { cardsForScenario, NIGHTMARE_PILES, NIGHTMARE_MANSION } from '../data/cards';

/**
 * AH-001 "Abandon All Hope..." — fan STORY MODE action. While it is active, a
 * Boss revealed and NOT defeated during an Explore may be shuffled into the top
 * 10 of the Mansion instead of taking the normal not-defeated disposition.
 *
 * The Boss here is MA-054 Osmund Saddler (the Nightmare scenario's
 * `winInfectedCardId`), revealed with 90 Health against a 5-damage Handgun.
 */

let counter = 0;
const nid = (cardId: string): string => `${cardId}#ah${++counter}`;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'P', controller: 'human', characterCardId: 'ch-002' }] },
    [...cardsForScenario('nightmare'), ...CUSTOM_CARDS],
    NIGHTMARE_PILES,
    NIGHTMARE_MANSION,
    'ma-054',
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function add(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = nid(cardId);
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat } } },
      seats: s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p)),
    },
    id,
  };
}

function mansionTop(s: GameState, cardId: string): { state: GameState; id: string } {
  const id = nid(cardId);
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } },
      mansionDeck: [id, ...s.mansionDeck],
    },
    id,
  };
}

/** Play AH-001, then stack a 5-damage Handgun and the Boss on the Mansion. */
function armed(): { s: GameState; bossId: string; weaponId: string } {
  let s = game({ actionsLeft: 1 });
  // Never seed hp above maxHp: the not-defeated branch writes hp - damage
  // unclamped, so a topped-up seat keeps the assertion honest.
  s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: p.maxHp } : p)) };
  const ah = add(s, 0, 'ah-001');
  s = applyAction(ah.state, { type: 'playActionCard', seat: 0, instanceId: ah.id });
  expect(s.storyModeBossShuffleActive).toBe(true);
  const w = add(s, 0, 'we-004'); // 5 damage, no ammo requirement
  const boss = mansionTop(w.state, 'ma-054');
  return { s: boss.state, bossId: boss.id, weaponId: w.id };
}

function exploreBoss(s: GameState, weaponId: string): GameState {
  return applyAction(
    { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 200, exploresLeft: 1 } : p)) },
    { type: 'explore', seat: 0, weapons: [weaponId], exploreCount: 1 },
  );
}

describe('AH-001 Abandon All Hope', () => {
  it('offers to shuffle a not-defeated Boss into the top 10', () => {
    const { s, bossId, weaponId } = armed();
    const explored = exploreBoss(s, weaponId);
    const p = explored.prompts.find(x => x.payload?.kind === 'ah001Choose');
    expect(p).toBeDefined();
    // Held: the Boss already took the normal not-defeated disposition.
    expect(explored.mansionDeck).toContain(bossId);

    const shuffled = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: p!.id, option: 0 });
    expect(shuffled.mansionDeck.indexOf(bossId)).toBe(9);
    // insertAt SPLICES IN A COPY — the old occurrence must be gone.
    expect(shuffled.mansionDeck.filter(id => id === bossId)).toHaveLength(1);
  });

  it('declining leaves the Boss in the Mansion, out of the top 10', () => {
    const { s, bossId, weaponId } = armed();
    const explored = exploreBoss(s, weaponId);
    const p = explored.prompts.find(x => x.payload?.kind === 'ah001Choose')!;
    const declined = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: p.id, option: 1 });
    expect(declined.mansionDeck.filter(id => id === bossId)).toHaveLength(1);
    expect(declined.mansionDeck.indexOf(bossId)).not.toBe(9);
    expect(declined.prompts.some(x => x.payload?.kind === 'ah001Choose')).toBe(false);
  });

  it('does not offer for a non-Boss Infected', () => {
    const { s, weaponId } = armed();
    const top = mansionTop(s, 'ma-059'); // hp 15, still not defeated by 5 damage
    const explored = exploreBoss(top.state, weaponId);
    expect(explored.prompts.some(x => x.payload?.kind === 'ah001Choose')).toBe(false);
  });

  it('does nothing when AH-001 was never played', () => {
    let s = game({ actionsLeft: 1 });
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: p.maxHp } : p)) };
    const w = add(s, 0, 'we-004');
    const boss = mansionTop(w.state, 'ma-054');
    const explored = exploreBoss(boss.state, w.id);
    expect(explored.prompts.some(x => x.payload?.kind === 'ah001Choose')).toBe(false);
  });
});
