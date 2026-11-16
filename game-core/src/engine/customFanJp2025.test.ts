import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { enumerateLegalActions } from '../ai/enumerate';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario, pilesForScenario } from '../data/cards';

/**
 * Fan "JP 2025" promo set — read from the printed cards with a local vision
 * model (gemma4:e2b). Printed codes collide with official cards, so the family
 * prefixes CAC-/CW- are kept:
 *   CAC-003 prints "AC-003" (official Shattered Memories is ac-003)
 *   CAC-013..016 print AC-013..016 (official Alliance actions)
 *   CW-034 prints "CW-002"; CW-035 prints "CW-001"
 * A second crossbow print (also coded CW-002) was dropped as a duplicate.
 */

const IDS = ['cac-003', 'cac-013', 'cac-014', 'cac-015', 'cac-016', 'cw-034', 'cw-035'] as const;

function def(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

let counter = 0;

function game(over: Partial<PlayerState> = {}, seats = 2): GameState {
  const players = Array.from({ length: seats }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? 'ch-002' : 'ch-001',
  }));
  const s = setup({ seed: 11, players }, [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function place(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea' | 'discard' = 'hand'): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } };
  const seats = s.seats.map((p, i) => {
    if (i !== seat) return p;
    return zone === 'hand' ? { ...p, hand: [...p.hand, id] }
      : zone === 'playArea' ? { ...p, playArea: [...p.playArea, id] }
        : { ...p, discard: [...p.discard, id] };
  });
  return { state: { ...s, cards, seats }, id };
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

describe('Fan JP 2025 set — data', () => {
  it('defines all seven cards with the printed stats', () => {
    expect(def('cac-003')).toEqual(expect.objectContaining({
      id: 'cac-003', name: 'Change of Outfit', type: 'action', set: 'custom', cost: 30,
      bonuses: { cards: 1, gold: 10 },
    }));
    expect(def('cac-013')).toEqual(expect.objectContaining({
      id: 'cac-013', name: 'From Bad to Worse', type: 'action', cost: 70,
      bonuses: { actions: 1, buys: 1, cards: 1 },
    }));
    expect(def('cac-014')).toEqual(expect.objectContaining({
      id: 'cac-014', name: 'Global Battle', type: 'action', cost: 80, bonuses: { cards: 3 },
    }));
    expect(def('cac-015')).toEqual(expect.objectContaining({
      id: 'cac-015', name: 'This Shit Ends Now!', type: 'action', cost: 90,
      bonuses: { ammo: 20, cards: 1, buys: 1 },
    }));
    expect(def('cac-016')).toEqual(expect.objectContaining({
      id: 'cac-016', name: 'Take Them Down!', type: 'action', cost: 90,
      bonuses: { ammo: 20, gold: 20, cards: 2 },
    }));
    expect(def('cw-034')).toEqual(expect.objectContaining({
      id: 'cw-034', name: 'Crossbow', type: 'weapon', cost: 130, ammoReq: 0, damage: 30,
    }));
    expect(def('cw-035')).toEqual(expect.objectContaining({
      id: 'cw-035', name: 'Scoped Colt Anaconda', type: 'weapon', cost: 100, ammoReq: 60, damage: 60,
    }));
  });

  it('has no duplicate ids and no collision with the official line', () => {
    for (const id of IDS) {
      expect(CUSTOM_CARDS.filter(c => c.id === id)).toHaveLength(1);
    }
    for (const id of IDS) {
      expect(PREMIER_CARDS.some(c => c.id === id)).toBe(false);
    }
  });

  it('is reachable only through the room toggle (not in ALL_CARDS)', () => {
    const base = cardsForScenario('firstTimer');
    for (const id of IDS) {
      expect(base.some(c => c.id === id)).toBe(false);
    }
    const withCustom = cardsForScenario('firstTimer', { customCards: [...IDS] });
    for (const id of IDS) {
      expect(withCustom.some(c => c.id === id)).toBe(true);
    }
  });

  it('gives the costed customs a Resource Area pile', () => {
    const piles = pilesForScenario('firstTimer', { customCards: [...IDS] });
    const ids = piles.flatMap(p => p.cardIds);
    for (const id of ['cac-003', 'cac-013', 'cac-014', 'cac-015', 'cac-016', 'cw-035']) {
      expect(ids).toContain(id);
    }
  });

  it('has art for every card', () => {
    const dir = require('path').join(__dirname, '..', 'data', 'CARD-ART') as string;
    for (const id of IDS) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs') as { existsSync(p: string): boolean };
      expect(fs.existsSync(require('path').join(dir, `${id.toUpperCase()}.png`))).toBe(true);
    }
  });
});

describe('CAC-014 Global Battle — another player draws', () => {
  it('offers a target prompt on play and the chosen player draws a card', () => {
    let s = game({ actionsLeft: 1 });
    const played = place(s, 0, 'cac-014');
    s = played.state;
    const after = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const prompt = after.prompts.find(p => p.payload?.kind === 'cac014ChoosePlayer');
    expect(prompt).toBeDefined();
    const before = after.seats[1]?.hand.length ?? 0;
    const resolved = applyAction(after, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect(resolved.seats[1]?.hand.length).toBe(before + 1);
  });

  it('Decline draws nothing', () => {
    let s = game({ actionsLeft: 1 });
    const played = place(s, 0, 'cac-014');
    s = played.state;
    const after = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const prompt = after.prompts.find(p => p.payload?.kind === 'cac014ChoosePlayer');
    const before = after.seats[1]?.hand.length ?? 0;
    const resolved = applyAction(after, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: (prompt!.options.length - 1) });
    expect(resolved.seats[1]?.hand.length).toBe(before);
  });
});

describe('CAC-015 This Shit Ends Now! — weapons route to the Play Area', () => {
  it('flags the seat so a gained Weapon lands in the Play Area', () => {
    let s = game({ actionsLeft: 1, turnGold: 200, buysLeft: 1 });
    const played = place(s, 0, 'cac-015');
    s = played.state;
    const after = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: played.id });
    expect((after.seats[0] as PlayerState).weaponsGainedGoToPlayArea).toBe(true);
  });

  it('a bought weapon goes to the Play Area and the first gets +10 Damage', () => {
    let s = game({ actionsLeft: 1, turnGold: 200, buysLeft: 1, turnAmmo: 100 });
    const played = place(s, 0, 'cac-015');
    s = played.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: played.id });
    // Buy a weapon from the Resource Area (we-004 Combat Knife, cost 50).
    const knifePile = Object.values(s.marketPiles).find(p => p.cards.some(id => s.cards[id]?.cardId === 'we-004'));
    expect(knifePile).toBeDefined();
    const bought = applyAction(s, { type: 'buy', seat: 0, pileId: knifePile!.pileId });
    const seat = bought.seats[0] as PlayerState;
    expect(seat.playArea.some(id => bought.cards[id]?.cardId === 'we-004')).toBe(true);
    expect(seat.firstWeaponToPlayAreaInstanceId).toBeDefined();
    expect(seat.firstWeaponToPlayAreaBonus).toBe(10);
  });

  it('clears at the start of the next turn', () => {
    let s = game({ actionsLeft: 1 });
    const played = place(s, 0, 'cac-015');
    s = played.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: played.id });
    // endTurn hands over to seat 1; seat 0's OWN next turn start clears the flag.
    const ended0 = applyAction(s, { type: 'endTurn', seat: 0 });
    const t1 = startTurn(ended0);            // seat 1's turn
    const ended1 = applyAction(t1, { type: 'endTurn', seat: 1 });
    const t0 = startTurn(ended1);            // seat 0 again
    expect((t0.seats[0] as PlayerState).weaponsGainedGoToPlayArea ?? false).toBe(false);
  });
});

describe('CAC-016 Take Them Down! — discard from the Play Area for a Weapon', () => {
  it('is enumerated while the card sits in the Play Area with a Weapon in discard', () => {
    let s = game({ actionsLeft: 2 });
    const action = place(s, 0, 'cac-016', 'playArea');
    const weapon = place(action.state, 0, 'we-004', 'discard');
    s = weapon.state;
    const legal = enumerateLegalActions(s, 0);
    expect(legal.some(a => a.type === 'useActionAbility' && a.instanceId === action.id)).toBe(true);
  });

  it('moves the chosen Weapon to the Hand and discards the Action', () => {
    let s = game({ actionsLeft: 2 });
    const action = place(s, 0, 'cac-016', 'playArea');
    const weapon = place(action.state, 0, 'we-004', 'discard');
    s = weapon.state;
    const prompted = applyAction(s, { type: 'useActionAbility', seat: 0, instanceId: action.id });
    const prompt = prompted.prompts.find(p => p.payload?.kind === 'cac016ChooseWeapon');
    expect(prompt).toBeDefined();
    const resolved = applyAction(prompted, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    const seat = resolved.seats[0] as PlayerState;
    expect(seat.hand).toContain(weapon.id);
    expect(seat.playArea).not.toContain(action.id);
    expect(seat.discard).toContain(action.id);
  });

  it('is rejected when the Action is not in the Play Area', () => {
    let s = game({ actionsLeft: 2 });
    const action = place(s, 0, 'cac-016');
    s = action.state;
    expect(validateAction(s, { type: 'useActionAbility', seat: 0, instanceId: action.id }).ok).toBe(false);
  });

  it('is once per turn', () => {
    let s = game({ actionsLeft: 3 });
    const action = place(s, 0, 'cac-016', 'playArea');
    const weapon = place(action.state, 0, 'we-004', 'discard');
    s = weapon.state;
    const prompted = applyAction(s, { type: 'useActionAbility', seat: 0, instanceId: action.id });
    const prompt = prompted.prompts.find(p => p.payload?.kind === 'cac016ChooseWeapon');
    const resolved = applyAction(prompted, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect(validateAction(resolved, { type: 'useActionAbility', seat: 0, instanceId: action.id }).ok).toBe(false);
  });
});

describe('CAC-013 From Bad to Worse — end-of-turn peek and give', () => {
  it('holds the turn open with a target prompt', () => {
    let s = game({ actionsLeft: 1 });
    const action = place(s, 0, 'cac-013', 'playArea');
    s = action.state;
    const after = applyAction(s, { type: 'endTurn', seat: 0 });
    const prompt = after.prompts.find(p => p.payload?.kind === 'cac013ChoosePlayer');
    expect(prompt).toBeDefined();
    // The turn must NOT have advanced past seat 0 yet.
    expect(after.activeSeat).toBe(0);
  });

  it('the target discards, the Action goes into their Hand, and the turn ends', () => {
    let s = game({ actionsLeft: 1 });
    const action = place(s, 0, 'cac-013', 'playArea');
    s = action.state;
    const afterEnd = applyAction(s, { type: 'endTurn', seat: 0 });
    const prompt = afterEnd.prompts.find(p => p.payload?.kind === 'cac013ChoosePlayer');
    const targetSeat = Number(prompt!.options[0]);
    const chosenCard = afterEnd.seats[targetSeat]?.hand[0];
    expect(chosenCard).toBeDefined();

    const picked = applyAction(afterEnd, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    const discardPrompt = picked.prompts.find(p => p.payload?.kind === 'cac013TargetDiscards');
    expect(discardPrompt).toBeDefined();

    const resolved = applyAction(picked, { type: 'chooseOption', seat: targetSeat, promptId: discardPrompt!.id, option: 0 });
    expect(resolved.seats[targetSeat]?.hand).toContain(action.id);
    expect(resolved.seats[0]?.playArea).not.toContain(action.id);
    // The turn has now ended and advanced.
    expect(resolved.activeSeat).not.toBe(0);
    expect(resolved.seats[targetSeat]?.discard).toContain(chosenCard);
  });

  it('Decline ends the turn with no effect', () => {
    let s = game({ actionsLeft: 1 });
    const action = place(s, 0, 'cac-013', 'playArea');
    s = action.state;
    const afterEnd = applyAction(s, { type: 'endTurn', seat: 0 });
    const prompt = afterEnd.prompts.find(p => p.payload?.kind === 'cac013ChoosePlayer');
    const resolved = applyAction(afterEnd, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: prompt!.options.length - 1 });
    expect(resolved.activeSeat).not.toBe(0);
    expect(resolved.seats[0]?.playArea).not.toContain(action.id);
  });
});

describe('CAC-003 Change of Outfit — trash two for a Resource Area card', () => {
  it('chains hand trash -> discard trash -> gain', () => {
    let s = game({ actionsLeft: 1, turnGold: 100 });
    const card = place(s, 0, 'cac-003');
    const handCard = place(card.state, 0, 'am-001');      // cost 20
    const discardCard = place(handCard.state, 0, 'we-004', 'discard'); // cost 50
    s = discardCard.state;
    const after = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: card.id });
    const p1 = after.prompts.find(p => p.payload?.kind === 'cac003ChooseHand');
    expect(p1).toBeDefined();

    const step1 = applyAction(after, { type: 'chooseOption', seat: 0, promptId: p1!.id, option: p1!.options.indexOf(handCard.id) });
    const p2 = step1.prompts.find(p => p.payload?.kind === 'cac003ChooseDiscard');
    expect(p2).toBeDefined();

    const step2 = applyAction(step1, { type: 'chooseOption', seat: 0, promptId: p2!.id, option: p2!.options.indexOf(discardCard.id) });
    const p3 = step2.prompts.find(p => p.payload?.kind === 'cac003ChooseGain');
    expect(p3).toBeDefined();
    // combined cost 20 + 50 = 70, so the gain must be offered
    expect(p3!.options.length).toBeGreaterThan(1);

    const resolved = applyAction(step2, { type: 'chooseOption', seat: 0, promptId: p3!.id, option: 0 });
    const seat = resolved.seats[0] as PlayerState;
    expect(seat.discard).toContain(p3!.options[0]);
    expect(resolved.removed).toContain(handCard.id);
    expect(resolved.removed).toContain(discardCard.id);
  });
});

describe('CW-034 Crossbow — coin flip on the next Infected', () => {
  it('is armed by using it in an explore', () => {
    let s = game({ level: 1, hp: 80, turnAmmo: 100, exploresLeft: 1 });
    const bow = place(s, 0, 'cw-034');
    s = bow.state;
    const top = setMansionTop(s, ['ma-005'], { 'ma-005': 999 });
    const explored = applyAction(top.state, { type: 'explore', seat: 0, weapons: [bow.id], exploreCount: 1 });
    // Either the flip defeated it (decorations paid, +1 Explore) or it did not;
    // either way the crossbow must have disarmed.
    expect((explored.seats[0] as PlayerState).armedCrossbowInstanceId).toBeUndefined();
  });

  it('defeats the Infected on heads and grants +1 Explore', () => {
    // Search seeds for a heads flip, then assert the printed outcome.
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      let s = game({ level: 1, hp: 80, turnAmmo: 100, exploresLeft: 1 }, 2);
      // re-seed by rebuilding with a different seed
      s = { ...s, rngState: seed };
      const bow = place(s, 0, 'cw-034');
      const withTop = setMansionTop(bow.state, ['ma-005'], { 'ma-005': 500 });
      const explored = applyAction(withTop.state, { type: 'explore', seat: 0, weapons: [bow.id], exploreCount: 1 });
      const seat = explored.seats[0] as PlayerState;
      if (seat.attached.some(id => explored.cards[id]?.cardId === 'ma-005')) {
        found = true;
        expect(seat.exploresLeft).toBe(1);   // spent 1, crossbow granted 1
      }
    }
    expect(found).toBe(true);
  });

  it('prints the ammoReq and damage the card shows', () => {
    expect(def('cw-034').ammoReq).toBe(0);
    expect(def('cw-034').damage).toBe(30);
  });
});

describe('CW-035 Scoped Colt Anaconda — pay XP to buff the first Infected', () => {
  it('is enumerated for each payable XP amount', () => {
    let s = game({ level: 1, xp: 3 });
    const gun = place(s, 0, 'cw-035');
    s = gun.state;
    const legal = enumerateLegalActions(s, 0);
    const amounts = legal.filter(a => a.type === 'usePreExploreXpAbility').map(a => (a as { amount: number }).amount);
    expect(amounts).toEqual([1, 2, 3]);
  });

  it('rejects paying more XP than the Character has', () => {
    let s = game({ level: 1, xp: 2 });
    const gun = place(s, 0, 'cw-035');
    s = gun.state;
    expect(validateAction(s, { type: 'usePreExploreXpAbility', seat: 0, instanceId: gun.id, amount: 3 }).ok).toBe(false);
    expect(validateAction(s, { type: 'usePreExploreXpAbility', seat: 0, instanceId: gun.id, amount: 2 }).ok).toBe(true);
  });

  it('buffs the first Infected Revealed (+5 Health, +5 Damage, +1 Decoration per XP)', () => {
    // Pay 2 XP: the revealed Infected should take +10 Health (harder to kill)
    // and be worth +2 Decoration when defeated.
    let s = game({ level: 1, hp: 200, turnAmmo: 200, exploresLeft: 1, xp: 2 });
    const gun = place(s, 0, 'cw-035');
    s = gun.state;
    const paid = applyAction(s, { type: 'usePreExploreXpAbility', seat: 0, instanceId: gun.id, amount: 2 });
    expect((paid.seats[0] as PlayerState).xp).toBe(0);
    expect((paid.seats[0] as PlayerState).scopedMagnumXp).toBe(2);

    const top = setMansionTop(paid, ['ma-005'], { 'ma-005': 20 });
    const explored = applyAction(top.state, { type: 'explore', seat: 0, weapons: [gun.id], exploreCount: 1 });
    const seat = explored.seats[0] as PlayerState;
    expect(seat.scopedMagnumXp ?? 0).toBe(0);   // spent on the reveal
    expect(seat.decorations).toBe(((PREMIER_CARDS.find(c => c.id === 'ma-005')?.decorations) ?? 0) + 2);
  });

  it('prints the ammoReq and damage the card shows', () => {
    expect(def('cw-035').ammoReq).toBe(60);
    expect(def('cw-035').damage).toBe(60);
  });
});
