import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { effectiveWeaponTags } from './abilities';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * CW-013 Pump-Action Shotgun (fan/Zombicide): "+1 Explore, When you Reveal an
 * Infected you can take 20 Damage if you do this Weapon gains the type 'Melee'
 * and +10 Damage."
 *
 * Printed "you can ... if you do", so it is a CHOICE. The bonus is retroactive
 * to the explore that revealed (user ruling), so that explore is DEFERRED and
 * re-resolved with the boosted shotgun — the same machinery as AC-018.
 */

let counter = 0;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'P', controller: 'human', characterCardId: 'ch-002' }] },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function place(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea' = 'hand'): { state: GameState; id: string } {
  const id = `${cardId}#c13${++counter}`;
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0 } } },
      seats: s.seats.map((p, i) => (i !== seat ? p : zone === 'hand'
        ? { ...p, hand: [...p.hand, id] }
        : { ...p, playArea: [...p.playArea, id] })),
    },
    id,
  };
}

function setMansionTop(s: GameState, cardIds: readonly string[], hp?: Readonly<Record<string, number>>): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    (cards as Record<string, unknown>)[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck', index: 0 } };
    ids.push(id);
  }
  const cardDefs = { ...s.cardDefs };
  if (hp !== undefined) {
    for (const [cardId, value] of Object.entries(hp)) {
      cardDefs[cardId] = { ...cardDefs[cardId], hp: value } as typeof cardDefs[string];
    }
  }
  return { state: { ...s, cards: cards as GameState['cards'], cardDefs, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

/** Explore once with the shotgun, revealing an Infected with the given HP. */
function exploreWithShotgun(hp: number, over: Partial<PlayerState> = {}) {
  let s: GameState = game({ level: 1, hp: 80, turnAmmo: 200, exploresLeft: 2, ...over });
  const w = place(s, 0, 'cw-013');
  s = w.state;
  const top = setMansionTop(s, ['ma-005'], { 'ma-005': hp });
  s = top.state;
  const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
  return { explored, weaponInstanceId: w.id, revealedId: top.ids[0]! };
}

const cw013Prompt = (s: GameState) => s.prompts.find(p => p.payload?.kind === 'cw013SelfDamage');

describe('CW-013 Pump-Action Shotgun — data', () => {
  it('carries the printed effect and stats', () => {
    expect(CUSTOM_CARDS.find(c => c.id === 'cw-013')).toEqual(expect.objectContaining({
      id: 'cw-013', name: 'Pump-Action Shotgun', cost: 40, ammoReq: 40, damage: 25,
      weaponTags: ['gun', 'shotgun'],
      weaponEffects: [
        { kind: 'grantExplores', amount: 1 },
        { kind: 'optionalSelfDamageForDamageAndType', damage: 20, amount: 10, type: 'melee' },
      ],
    }));
  });
});

describe('CW-013 Pump-Action Shotgun — reveal window', () => {
  it('offers the choice and defers the explore when an Infected is revealed', () => {
    const { explored } = exploreWithShotgun(35);
    const pr = cw013Prompt(explored);
    expect(pr).toBeDefined();
    expect(pr?.options).toEqual(['Take 20 damage', 'Decline']);
    expect(explored.pendingExplore).toBeDefined();
  });

  it('does not offer when the revealed card is not an Infected', () => {
    let s: GameState = game({ level: 1, hp: 80, turnAmmo: 200, exploresLeft: 2 });
    const w = place(s, 0, 'cw-013');
    s = w.state;
    const top = setMansionTop(s, ['ac-001']); // a non-Infected Mansion card
    s = top.state;
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    expect(cw013Prompt(explored)).toBeUndefined();
  });

  it('does not offer when the shotgun was not used for the explore', () => {
    let s: GameState = game({ level: 1, hp: 80, turnAmmo: 200, exploresLeft: 2 });
    const w = place(s, 0, 'cw-013'); // sits in hand, unused
    s = w.state;
    const other = place(s, 0, 'we-004');
    s = other.state;
    const top = setMansionTop(s, ['ma-005'], { 'ma-005': 35 });
    s = top.state;
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [other.id], exploreCount: 1 });
    expect(cw013Prompt(explored)).toBeUndefined();
  });
});

describe('CW-013 Pump-Action Shotgun — resolving the choice', () => {
  it('accepting pays 20 and turns a would-be failure into a defeat', () => {
    const { explored, weaponInstanceId, revealedId } = exploreWithShotgun(35);
    const pr = cw013Prompt(explored)!;
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    // 25 base damage < 35 HP, but 25 + 10 = 35 defeats it.
    expect(out.seats[0]?.hp).toBe(60);                       // 80 - 20 self-damage
    expect(out.seats[0]?.attached).toContain(revealedId);
    expect(out.seats[0]?.weaponDamageBonusById?.[weaponInstanceId]).toBe(10);
    expect(out.seats[0]?.extraWeaponTags?.[weaponInstanceId]).toEqual(['melee']);
    expect(effectiveWeaponTags(out, 0, weaponInstanceId)).toContain('melee');
    // The client's explore picker shares the same view of the granted buff.
    expect(exploreDamage(out, 0, [weaponInstanceId])).toBe(35); // 25 printed + 10 granted
  });

  it('declining keeps the base outcome (Infected survives, its attack lands)', () => {
    const { explored, revealedId } = exploreWithShotgun(35);
    const pr = cw013Prompt(explored)!;
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 1 });
    expect(out.pendingExplore).toBeUndefined();
    expect(out.seats[0]?.hp).toBe(70);                       // ma-005 attacks for 10
    expect(out.seats[0]?.attached ?? []).not.toContain(revealedId);
    expect(out.seats[0]?.extraWeaponTags?.[revealedId]).toBeUndefined();
  });

  it('the granted Melee tag feeds a tag-scoped bonus on a LATER explore', () => {
    const { explored } = exploreWithShotgun(35);
    const pr = cw013Prompt(explored)!;
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    // Rig the same buff onto a SECOND copy so the per-turn use cap does not
    // interfere: 25 printed + 10 granted + 5 melee bonus = 40.
    const second = place(out, 0, 'cw-013');
    let s: GameState = { ...second.state, seats: second.state.seats.map((p, i) => (i === 0
      ? {
          ...p,
          knifeMeleeDamageBonusThisTurn: 5,
          extraWeaponTags: { ...(p.extraWeaponTags ?? {}), [second.id]: ['melee'] },
          weaponDamageBonusById: { ...(p.weaponDamageBonusById ?? {}), [second.id]: 10 },
        }
      : p)) };
    const top = setMansionTop(s, ['ma-005'], { 'ma-005': 40 });
    s = top.state;
    let explored2 = applyAction(s, { type: 'explore', seat: 0, weapons: [second.id], exploreCount: 1 });
    const pr2 = cw013Prompt(explored2);
    if (pr2 !== undefined) {
      explored2 = applyAction(explored2, { type: 'chooseOption', seat: 0, promptId: pr2.id, option: 1 });
    }
    expect(explored2.seats[0]?.attached).toContain(top.ids[0]);
  });

  it('the tag and the +10 are cleared at the start of the next turn', () => {
    const { explored, weaponInstanceId } = exploreWithShotgun(35);
    const pr = cw013Prompt(explored)!;
    let out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    out = startTurn(applyAction(out, { type: 'endTurn', seat: 0 }));
    expect(out.seats[0]?.extraWeaponTags?.[weaponInstanceId]).toBeUndefined();
    expect(out.seats[0]?.weaponDamageBonusById?.[weaponInstanceId]).toBeUndefined();
  });
});
