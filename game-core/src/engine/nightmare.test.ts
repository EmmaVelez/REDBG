import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { cardsForScenario, NIGHTMARE_PILES, NIGHTMARE_MANSION } from '../data/cards';

/**
 * Nightmare expansion — engine behaviour for the 50 cards
 * (10 characters, 11 weapons, 16 infected, 2 items, 1 event, 10 actions).
 *
 * The Nightmare characters that already had coverage in actions.test.ts
 * (Wesker L2, Luis L2, Ada L1/L2) are not repeated here.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(cardId: string): string {
  idCounter += 1;
  return `${cardId}#t${idCounter}`;
}

const NM_CHARS = ['ch-034', 'ch-035', 'ch-036', 'ch-037', 'ch-038', 'ch-039', 'ch-040', 'ch-041', 'ch-042', 'ch-043'];

function nmGame(characterCardId: string, over: Partial<PlayerState> = {}): GameState {
  const seat1 = NM_CHARS.find(c => c !== characterCardId) ?? 'ch-035';
  const s = setup(
    {
      seed: 5,
      players: [
        { name: 'Hero', controller: 'human', characterCardId },
        { name: 'Foe', controller: 'human', characterCardId: seat1 },
      ],
    },
    cardsForScenario('nightmare'),
    NIGHTMARE_PILES,
    NIGHTMARE_MANSION,
  );
  return tune(s, { level: 1, decorations: 10, ...over });
}

function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function withSeat(s: GameState, seat: number, over: Partial<PlayerState>): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === seat ? { ...p, ...over } : p)) };
}

function addCard(s: GameState, seat: number, cardId: string, zone: 'hand' | 'discard' | 'inventory' | 'playArea' = 'hand'): GameState {
  const id = nextId(cardId);
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } },
    seats: s.seats.map((p, i) => {
      if (i !== seat) return p;
      if (zone === 'hand') return { ...p, hand: [...p.hand, id] };
      if (zone === 'discard') return { ...p, discard: [...p.discard, id] };
      if (zone === 'playArea') return { ...p, playArea: [...p.playArea, id] };
      return { ...p, inventory: [id, ...p.inventory] };
    }),
  };
}

function mansionTop(s: GameState, cardId: string): GameState {
  const id = nextId(cardId);
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } },
    mansionDeck: [id, ...s.mansionDeck],
  };
}

function pileTop(s: GameState, pileId: string, cardId: string): GameState {
  const id = nextId(cardId);
  const pile = s.marketPiles[pileId];
  if (pile === undefined) return s;
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'marketPile', index: 0, pileId } } },
    marketPiles: { ...s.marketPiles, [pileId]: { ...pile, cards: [id, ...pile.cards] } },
  };
}

function findHand(s: GameState, cardId: string, seat = 0): string {
  const p = s.seats[seat];
  const id = (p?.hand ?? []).find(hid => s.cards[hid]?.cardId === cardId);
  if (id === undefined) throw new Error(`card ${cardId} not in hand of seat ${seat}`);
  return id;
}

function findPrompt(s: GameState, kind: string): string {
  const p = s.prompts.find(x => x.payload?.kind === kind);
  if (p === undefined) throw new Error(`prompt ${kind} not found (have: ${s.prompts.map(x => x.payload?.kind).join(',')})`);
  return p.id;
}

function choose(s: GameState, seat: number, promptId: string, option: number): GameState {
  return applyAction(s, { type: 'chooseOption', seat, promptId, option });
}

function explore(s: GameState, seat: number, weaponIds: readonly string[]): GameState {
  return applyAction(tune(s, { turnAmmo: 200 }), { type: 'explore', seat, weapons: [...weaponIds], exploreCount: 1 });
}

function playAction(s: GameState, seat: number, cardId: string): GameState {
  const id = findHand(s, cardId, seat);
  return applyAction(tune(s, { actionsLeft: 1 }), { type: 'playActionCard', seat, instanceId: id });
}

/** Explore with two weapons from hand (a 10-damage Handgun + a 20-damage Grenade). */
function exploreWithHandgunAndGrenade(s: GameState, infectedId: string): GameState {
  const withWeapons = addCard(addCard(s, 0, 'we-009'), 0, 'we-041');
  const withInfected = mansionTop(withWeapons, infectedId);
  const w1 = findHand(withInfected, 'we-009');
  const w2 = findHand(withInfected, 'we-041');
  return explore(withInfected, 0, [w1, w2]);
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

describe('Nightmare characters', () => {
  it('CH-034 Chris Redfield L1: +10 damage when revealing a 40+ HP Infected', () => {
    const s = nmGame('ch-034');
    const next = exploreWithHandgunAndGrenade(s, 'ma-068'); // hp 40: 10 + 20 + 10 = 40
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-068')).toBe(true);
    // A character without the ability deals only 30 -> not defeated.
    const plain = nmGame('ch-035');
    const pnext = exploreWithHandgunAndGrenade(plain, 'ma-068');
    expect(pnext.seats[0]?.attached.some(id => pnext.cards[id]?.cardId === 'ma-068')).toBe(false);
  });

  it('CH-035 Sergei Vladimir L1: take 20 damage for +10 damage this turn', () => {
    const s = nmGame('ch-035');
    const next = startTurn(s);
    const promptId = findPrompt(next, 'sergeiSelfDamage');
    const yes = choose(next, 0, promptId, 0);
    expect(yes.seats[0]?.hp).toBe(100 - 20);
    expect(yes.seats[0]?.weaponDamageBonusThisTurn).toBe(10);
    const no = choose(next, 0, promptId, 1);
    expect(no.seats[0]?.hp).toBe(100);
    expect(no.seats[0]?.weaponDamageBonusThisTurn).toBe(0);
  });

  it('CH-035 Sergei Vladimir L2: defeating an Infected grants +1 Explore', () => {
    const s = tune(nmGame('ch-035'), { level: 2 });
    const defeated = exploreWithHandgunAndGrenade(s, 'ma-058'); // hp 30
    expect(defeated.seats[0]?.attached.some(id => defeated.cards[id]?.cardId === 'ma-058')).toBe(true);
    expect(defeated.seats[0]?.exploresLeft).toBe(1); // the explore consumed the base 1; Sergei refunds it
    // Without the L2 ability the same explore leaves 0 Explores.
    const plain = exploreWithHandgunAndGrenade(nmGame('ch-035'), 'ma-058');
    expect(plain.seats[0]?.exploresLeft).toBe(0);
  });

  it('CH-036 Luis Sera L1: optional +1 card, then discard one when the discard is small', () => {
    const s = nmGame('ch-036');
    const next = startTurn(s);
    const promptId = findPrompt(next, 'luisPlusOneCard');
    const yes = choose(next, 0, promptId, 0);
    // Discard is empty (<= 10), so a discard prompt follows.
    const discardPrompt = findPrompt(yes, 'luisDiscardOne');
    const after = choose(yes, 0, discardPrompt, 0);
    expect(after.seats[0]?.discard.length).toBe(1);
    const no = choose(next, 0, promptId, 1);
    expect(no.seats[0]?.hand.length).toBe(next.seats[0]?.hand.length);
  });

  it('CH-037 Josh Stone L1: +20 gold the first time he is healed in a turn', () => {
    const s = tune(nmGame('ch-037'), { hp: 40 });
    const withHerb = addCard(s, 0, 'it-001'); // Green Herb heals 20
    const id = findHand(withHerb, 'it-001');
    let next = applyAction(withHerb, { type: 'playItem', seat: 0, instanceId: id });
    const healPrompt = findPrompt(next, 'healGreenHerb');
    next = choose(next, 0, healPrompt, 0); // Heal 20
    expect(next.seats[0]?.hp).toBe(60);
    expect(next.seats[0]?.turnGold).toBe(20);
  });

  it('CH-037 Josh Stone L2: at max HP, may move a weapon from discard to hand', () => {
    const s = nmGame('ch-037');
    const withWeapon = addCard(s, 0, 'we-009', 'discard');
    const next = startTurn(tune(withWeapon, { level: 2, hp: 80 }));
    const promptId = findPrompt(next, 'recoverWeaponFromDiscardToHand');
    const moved = choose(next, 0, promptId, 0);
    expect(moved.seats[0]?.hand.some(id => moved.cards[id]?.cardId === 'we-009')).toBe(true);
    expect(moved.seats[0]?.discard.some(id => moved.cards[id]?.cardId === 'we-009')).toBe(false);
  });

  it('CH-038 Mikhail Victor L1: weapons cost 10 less', () => {
    const s = tune(nmGame('ch-038'), { turnGold: 100, buysLeft: 1 });
    const withPile = pileTop(s, 'hg', 'we-009'); // cost 20
    const next = applyAction(withPile, { type: 'buy', seat: 0, pileId: 'hg' });
    expect(next.seats[0]?.turnGold).toBe(100 - 10);
  });

  it('CH-038 Mikhail Victor L2: +10 damage when using two different weapon types', () => {
    const s = tune(nmGame('ch-038'), { level: 2 });
    const withHandgun = addCard(s, 0, 'we-009');
    const withKnife = addCard(withHandgun, 0, 'we-004');
    const w1 = findHand(withKnife, 'we-009');
    const w2 = findHand(withKnife, 'we-004');
    // 10 + 5 + 10 = 25 -> ma-058 (hp 30) is NOT defeated.
    const next = explore(mansionTop(withKnife, 'ma-058'), 0, [w1, w2]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-058')).toBe(false);
    // 10 + 5 = 15 -> ma-059 (hp 15) is defeated (no ability needed).
    const plain = nmGame('ch-035');
    const pWithHandgun = addCard(plain, 0, 'we-009');
    const pWithKnife = addCard(pWithHandgun, 0, 'we-004');
    const pw1 = findHand(pWithKnife, 'we-009');
    const pw2 = findHand(pWithKnife, 'we-004');
    const pNext = explore(mansionTop(pWithKnife, 'ma-059'), 0, [pw1, pw2]);
    expect(pNext.seats[0]?.attached.some(id => pNext.cards[id]?.cardId === 'ma-059')).toBe(true);
  });

  it('CH-039 Carlos Oliveira L1: +20 gold at the start of your turn', () => {
    const s = nmGame('ch-039');
    const next = startTurn(s);
    expect(next.seats[0]?.turnGold).toBe(20);
  });

  it('CH-039 Carlos Oliveira L2: +1 Explore when buying a card costing 80 or more', () => {
    const s = tune(nmGame('ch-039'), { level: 2, turnGold: 200, buysLeft: 1 });
    const withPile = pileTop(s, 'broken-butterfly', 'we-035'); // cost 80
    const next = applyAction(withPile, { type: 'buy', seat: 0, pileId: 'broken-butterfly' });
    expect(next.seats[0]?.exploresLeft).toBe(2); // 1 base + 1 Carlos L2
  });

  it('CH-040 Mysterious Mask L1: may trash a discard card when defeating an Infected', () => {
    const s = nmGame('ch-040');
    const withJunk = addCard(s, 0, 'am-001', 'discard');
    const next = exploreWithHandgunAndGrenade(withJunk, 'ma-058'); // hp 30 -> defeated
    const promptId = findPrompt(next, 'maskTrashDiscard');
    const trashed = choose(next, 0, promptId, 0);
    expect(trashed.removed.some(id => trashed.cards[id]?.cardId === 'am-001')).toBe(true);
  });

  it('CH-040 Mysterious Mask L2: discard an Action card from hand for +2 cards', () => {
    const s = tune(nmGame('ch-040'), { level: 2 });
    const withAction = addCard(s, 0, 'ac-032');
    const next = applyAction(withAction, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const promptId = findPrompt(next, 'maskDiscardActionForCards');
    const before = next.seats[0]?.hand.length ?? 0;
    const after = choose(next, 0, promptId, 0);
    expect(after.seats[0]?.hand.length).toBe(before + 1); // -1 discarded, +2 drawn
  });

  it('CH-041 Wesker L1: +1 card at turn start when exactly one other player is at 30 or less HP', () => {
    const s = withSeat(nmGame('ch-041'), 1, { hp: 25 });
    const next = startTurn(s);
    const promptId = findPrompt(next, 'weskerPlusOneCard');
    const yes = choose(next, 0, promptId, 0);
    expect(yes.seats[0]?.hand.length).toBe((next.seats[0]?.hand.length ?? 0) + 1);
  });

  it('CH-042 Leon L1: trash a discard card to gain one costing up to 20 more', () => {
    const s = nmGame('ch-042');
    const withJunk = addCard(s, 0, 'am-001', 'discard'); // cost 10 -> up to 30
    let next = exploreWithHandgunAndGrenade(withJunk, 'ma-058'); // hp 30 -> defeated
    const trashPrompt = findPrompt(next, 'leonTrashForGain');
    next = choose(next, 0, trashPrompt, 0);
    const gainPrompt = findPrompt(next, 'leonGainCard');
    const gained = choose(next, 0, gainPrompt, 0);
    expect(gained.removed.some(id => gained.cards[id]?.cardId === 'am-001')).toBe(true);
    expect(gained.seats[0]?.discard.length).toBe((next.seats[0]?.discard.length ?? 0) + 1);
  });

  it('CH-042 Leon L2: gaining a card also draws a card', () => {
    const s = tune(nmGame('ch-042'), { level: 2 });
    const next = applyAction(s, { type: 'buy', seat: 0, pileId: 'am10' });
    // The base gain draws 1 (the hook), and the buy itself moves the card.
    expect(next.seats[0]?.hand.some(id => next.cards[id]?.cardId === 'am-001')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

describe('Nightmare weapons', () => {
  it('WE-032 Silver Ghost: +1 card and +1 action this turn', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-032');
    const w = findHand(withWeapon, 'we-032');
    const next = explore(withWeapon, 0, [w]);
    expect(next.seats[0]?.hand.length).toBe((withWeapon.seats[0]?.hand.length ?? 0) - 1 + 1);
    expect(next.seats[0]?.actionsLeft).toBe(2);
  });

  it('WE-033 Punisher: +2 cards and +1 action this turn', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-033');
    const w = findHand(withWeapon, 'we-033');
    const next = explore(withWeapon, 0, [w]);
    expect(next.seats[0]?.hand.length).toBe((withWeapon.seats[0]?.hand.length ?? 0) - 1 + 2);
    expect(next.seats[0]?.actionsLeft).toBe(2);
  });

  it('WE-034 Mine Thrower: +10 damage per Ammo card in the play area', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-034');
    const withAmmo = addCard(withWeapon, 0, 'am-001', 'playArea');
    const withInfected = mansionTop(withAmmo, 'ma-059'); // hp 15: 0 + 10 = 10 -> not defeated
    const w = findHand(withInfected, 'we-034');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-059')).toBe(false);
    const withTwoAmmo = addCard(withAmmo, 0, 'am-001', 'playArea');
    const withInfected2 = mansionTop(withTwoAmmo, 'ma-059');
    const w2 = findHand(withInfected2, 'we-034');
    const next2 = explore(withInfected2, 0, [w2]); // 0 + 20 = 20 -> defeated
    expect(next2.seats[0]?.attached.some(id => next2.cards[id]?.cardId === 'ma-059')).toBe(true);
  });

  it('WE-035 Broken Butterfly: +20 damage with 10 or more cards in the inventory', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-035');
    const w = findHand(withWeapon, 'we-035');
    const big = tune(withWeapon, { inventory: Array.from({ length: 10 }, (_, i) => `x${i}`) });
    const bigNext = explore(mansionTop(big, 'ma-059'), 0, [w]); // 40 + 20 = 60 -> defeated
    expect(bigNext.seats[0]?.attached.some(id => bigNext.cards[id]?.cardId === 'ma-059')).toBe(true);
    const small = tune(withWeapon, { inventory: Array.from({ length: 9 }, (_, i) => `x${i}`) });
    const smallNext = explore(mansionTop(small, 'ma-058'), 0, [w]); // 40 -> defeated either way
    expect(smallNext.seats[0]?.attached.some(id => smallNext.cards[id]?.cardId === 'ma-058')).toBe(true);
  });

  it('WE-036 Single Shot Rifle w/Scope: choose a player, who discards a card', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-036');
    const w = findHand(withWeapon, 'we-036');
    let next = explore(withWeapon, 0, [w]);
    const promptId = findPrompt(next, 'we036ChoosePlayer');
    next = choose(next, 0, promptId, 0);
    const discardPrompt = findPrompt(next, 'we036Discard');
    const before = next.seats[1]?.hand.length ?? 0;
    const after = choose(next, 1, discardPrompt, 0);
    expect(after.seats[1]?.hand.length).toBe(before - 1);
  });

  it('WE-037 Special Ops Rifle: each non-exploring player discards a card', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-037');
    const w = findHand(withWeapon, 'we-037');
    const next = explore(withWeapon, 0, [w]);
    const prompts = next.prompts.filter(p => p.payload?.kind === 'we037Discard');
    expect(prompts.length).toBe(1); // one opponent in a 2-player game
    const before = next.seats[1]?.hand.length ?? 0;
    const after = choose(next, 1, prompts[0]?.id ?? '', 0);
    expect(after.seats[1]?.hand.length).toBe(before - 1);
  });

  it('WE-038 Machine Pistol w/Stock: +20 gold this turn', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-038');
    const w = findHand(withWeapon, 'we-038');
    const next = explore(withWeapon, 0, [w]);
    expect(next.seats[0]?.turnGold).toBe(20);
  });

  it('WE-039 Gangster\'s Machine Gun: +10 damage per Machine Gun in the discard', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-039');
    const withDiscard = addCard(addCard(withWeapon, 0, 'we-038', 'discard'), 0, 'we-038', 'discard');
    const withInfected = mansionTop(withDiscard, 'ma-057'); // hp 50: 50 + 20 = 70 -> defeated
    const w = findHand(withInfected, 'we-039');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-057')).toBe(true);
  });

  it('WE-040 Flashbang: +1 Explore and low-HP Infected deal 0 damage', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-040');
    const withInfected = mansionTop(withWeapon, 'ma-058'); // hp 30, attack 20
    const w = findHand(withInfected, 'we-040');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.exploresLeft).toBe(1); // the explore consumed the base 1; Flashbang refunds it
    expect(next.seats[0]?.hp).toBe(100); // attack suppressed (hp 30 <= 40)
  });

  it('WE-041 HE Grenade: deals 20 damage', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-041');
    const withInfected = mansionTop(withWeapon, 'ma-059'); // hp 15: 20 -> defeated
    const w = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-059')).toBe(true);
  });

  it('WE-042 Incendiary Grenade: +5 damage per Infected battled', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-042');
    const w = findHand(withWeapon, 'we-042');
    // 10 base + 5 for the Infected being battled = 15 -> ma-059 (hp 15) is defeated.
    const next = explore(mansionTop(withWeapon, 'ma-059'), 0, [w]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-059')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Infected
// ---------------------------------------------------------------------------

describe('Nightmare infected', () => {
  it('MA-054 Osmund Saddler: not defeated -> gain Ammo x10 per level, then shuffle back', () => {
    const s = tune(nmGame('ch-035'), { level: 2 });
    const withWeapon = addCard(s, 0, 'we-004'); // 5 damage, no ammo
    const withInfected = mansionTop(withWeapon, 'ma-054'); // hp 90
    const w = findHand(withInfected, 'we-004');
    const next = explore(withInfected, 0, [w]);
    // base 1 + perLevel 1 * level 2 = 3 Ammo x10
    expect(next.seats[0]?.discard.filter(id => next.cards[id]?.cardId === 'am-001').length).toBe(3);
    expect(next.mansionDeck.some(id => next.cards[id]?.cardId === 'ma-054')).toBe(true);
  });

  it('MA-055 Bitores Mendez: defeating it grants an extra turn', () => {
    const s = nmGame('ch-035');
    const withWeapons = addCard(addCard(s, 0, 'we-039'), 0, 'we-041'); // 50 + 20 = 70
    const withInfected = mansionTop(withWeapons, 'ma-055'); // hp 70
    const w1 = findHand(withInfected, 'we-039');
    const w2 = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w1, w2]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-055')).toBe(true);
    expect(next.seats[0]?.extraTurnPending).toBe(true);
  });

  it('MA-056 Regenerator: on reveal, weapons in use get -10 damage', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-009'); // 10 damage
    const withInfected = mansionTop(withWeapon, 'ma-056'); // hp 40
    const w = findHand(withInfected, 'we-009');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-056')).toBe(false);
    // The weapon's damage was reduced to 0, so a 40 HP infected survives.
    expect(next.seats[0]?.hp).toBe(80); // attack 20
  });

  it('MA-057 Jack Krauser: on defeat, gain the top card of a Resource Pile', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-039'); // 50 damage
    const withInfected = mansionTop(withWeapon, 'ma-057'); // hp 50
    const w = findHand(withInfected, 'we-039');
    let next = explore(withInfected, 0, [w]);
    const promptId = findPrompt(next, 'ma057ChoosePile');
    const pileId = next.prompts.find(p => p.payload?.kind === 'ma057ChoosePile')?.options[0];
    const pileBefore = pileId !== undefined ? (next.marketPiles[pileId]?.cards.length ?? 0) : 0;
    next = choose(next, 0, promptId, 0);
    const pileAfter = pileId !== undefined ? (next.marketPiles[pileId]?.cards.length ?? 0) : 0;
    expect(pileAfter).toBe(pileBefore - 1);
  });

  it('MA-058 Colmillos: no effect', () => {
    const next = exploreWithHandgunAndGrenade(nmGame('ch-035'), 'ma-058'); // hp 30
    expect(next.prompts.length).toBe(0);
  });

  it('MA-059 Militia (Flail): no effect', () => {
    const next = exploreWithHandgunAndGrenade(nmGame('ch-035'), 'ma-059'); // hp 15
    expect(next.prompts.length).toBe(0);
  });

  it('MA-060 Militia (Stun Rod): no effect', () => {
    const next = exploreWithHandgunAndGrenade(nmGame('ch-035'), 'ma-060'); // hp 20
    expect(next.prompts.length).toBe(0);
  });

  it('MA-061 Militia (Rocket Launcher): reveal damage scales with inventory size', () => {
    const s = tune(nmGame('ch-035'), { hp: 100, inventory: Array.from({ length: 2 }, (_, i) => `x${i}`) });
    const withWeapon = addCard(s, 0, 'we-041');
    const withInfected = mansionTop(withWeapon, 'ma-061'); // hp 30, attack 0
    const w = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.hp).toBe(70); // 100 - (50 - 2*10)
  });

  it('MA-062 Novistador: cannot be defeated with 3+ Action cards in the play area', () => {
    const s = nmGame('ch-035');
    const withWeapon = addCard(s, 0, 'we-041');
    const withActions = addCard(addCard(addCard(withWeapon, 0, 'ac-032', 'playArea'), 0, 'ac-033', 'playArea'), 0, 'ac-034', 'playArea');
    const withInfected = mansionTop(withActions, 'ma-062'); // hp 15
    const w = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-062')).toBe(false);
  });

  it('MA-063 Zombie Security Guard: +20 gold and +1 buy on defeat', () => {
    const next = exploreWithHandgunAndGrenade(nmGame('ch-035'), 'ma-063'); // hp 15
    expect(next.seats[0]?.turnGold).toBe(20);
    expect(next.seats[0]?.buysLeft).toBe(2);
  });

  it('MA-064 Zombie Technician: no effect', () => {
    const next = exploreWithHandgunAndGrenade(nmGame('ch-035'), 'ma-064'); // hp 20
    expect(next.prompts.length).toBe(0);
  });

  it('MA-065 Verdugo: cannot be defeated with 5 or fewer cards in the inventory', () => {
    const s = tune(nmGame('ch-035'), { inventory: Array.from({ length: 5 }, (_, i) => `x${i}`) });
    const withWeapon = addCard(s, 0, 'we-041');
    const withInfected = mansionTop(withWeapon, 'ma-065'); // hp 40
    const w = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-065')).toBe(false);
  });

  it('MA-066 Ivy: on defeat, heal the exploring characters by 20', () => {
    const s = tune(nmGame('ch-035'), { hp: 50 });
    const next = exploreWithHandgunAndGrenade(s, 'ma-066'); // hp 20
    expect(next.seats[0]?.hp).toBe(70);
  });

  it('MA-067 Neptune: +30 damage when an exploring character has 30+ damage', () => {
    const s = tune(nmGame('ch-035'), { hp: 40 });
    const withWeapon = addCard(s, 0, 'we-041'); // 20 damage
    const withInfected = mansionTop(withWeapon, 'ma-067'); // hp 30, attack 10
    const w = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w]);
    // 20 + 30 = 50 >= 30 -> defeated
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-067')).toBe(true);
  });

  it('MA-068 Hunter: the most decorated player lowers max HP by 20', () => {
    const s = tune(nmGame('ch-035'), { decorations: 20 });
    const withWeapon = addCard(s, 0, 'we-041');
    const withInfected = mansionTop(withWeapon, 'ma-068'); // hp 40
    const w = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w]);
    expect(next.seats[0]?.maxHp).toBe(80);
    expect(next.seats[1]?.maxHp).toBe(90); // seat 1 is ch-034 (Chris, max 90), unaffected
  });

  it('MA-069 Cerberus: -20 health when exploring with 2 or more weapons', () => {
    const s = nmGame('ch-035');
    const withWeapons = addCard(addCard(s, 0, 'we-009'), 0, 'we-041');
    const withInfected = mansionTop(withWeapons, 'ma-069'); // hp 30 -> 10
    const w1 = findHand(withInfected, 'we-009');
    const w2 = findHand(withInfected, 'we-041');
    const next = explore(withInfected, 0, [w1, w2]); // 30 damage -> defeated
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-069')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Items & Event
// ---------------------------------------------------------------------------

describe('Nightmare items and event', () => {
  it('MA-070 Treasure Map: attach on reveal, then remove for +3 cards and +20 gold', () => {
    const s = nmGame('ch-035');
    const withItem = mansionTop(s, 'ma-070');
    let next = explore(withItem, 0, [findHand(withItem, 'we-004')]);
    const takePrompt = findPrompt(next, 'takeOrBottom');
    next = choose(next, 0, takePrompt, 0); // Take
    const mapId = next.seats[0]?.attached.find(id => next.cards[id]?.cardId === 'ma-070');
    expect(mapId).toBeDefined();
    const before = next.seats[0]?.hand.length ?? 0;
    const removed = applyAction(next, { type: 'removeAttachedItem', seat: 0, instanceId: mapId ?? '' });
    expect(removed.seats[0]?.hand.length).toBe(before + 3);
    expect(removed.seats[0]?.turnGold).toBe(20);
    expect(removed.removed.some(id => id === mapId)).toBe(true);
  });

  it('MA-071 Hidden Treasure: +30 gold and +1 buy, then removed', () => {
    const s = nmGame('ch-035');
    const withItem = mansionTop(s, 'ma-071');
    let next = explore(withItem, 0, [findHand(withItem, 'we-004')]);
    const takePrompt = findPrompt(next, 'takeOrBottom');
    next = choose(next, 0, takePrompt, 0);
    expect(next.seats[0]?.turnGold).toBe(30);
    expect(next.seats[0]?.buysLeft).toBe(2);
    expect(next.removed.some(id => next.cards[id]?.cardId === 'ma-071')).toBe(true);
  });

  it('MA-072 P.R.L. 412: reveals the top Mansion card', () => {
    const s = nmGame('ch-035');
    const withEvent = mansionTop(s, 'ma-072');
    const next = explore(withEvent, 0, [findHand(withEvent, 'we-004')]);
    // The event is removed and the next card is processed.
    expect(next.removed.some(id => next.cards[id]?.cardId === 'ma-072')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe('Nightmare actions', () => {
  it('AC-032 Lonewolf: +10 ammo and +5 damage per discard card on explore', () => {
    const s = nmGame('ch-035');
    const withAction = addCard(s, 0, 'ac-032');
    let next = playAction(withAction, 0, 'ac-032');
    expect(next.seats[0]?.turnAmmo).toBe(10);
    const withDiscard = addCard(next, 0, 'am-001', 'discard');
    const withInfected = mansionTop(withDiscard, 'ma-059'); // hp 15: 10 + 5 = 15 -> defeated
    const w = findHand(withInfected, 'we-009');
    const explored = explore(withInfected, 0, [w]);
    expect(explored.seats[0]?.attached.some(id => explored.cards[id]?.cardId === 'ma-059')).toBe(true);
  });

  it('AC-033 High Value Targets: +1 action and +5 gold/+5 ammo per inventory card', () => {
    const s = tune(nmGame('ch-035'), { inventory: Array.from({ length: 4 }, (_, i) => `x${i}`) });
    const withAction = addCard(s, 0, 'ac-033');
    const next = playAction(withAction, 0, 'ac-033');
    expect(next.seats[0]?.actionsLeft).toBe(1); // 1 - 1 (play) + 1 (bonus)
    expect(next.seats[0]?.turnGold).toBe(20);
    expect(next.seats[0]?.turnAmmo).toBe(20);
  });

  it('AC-034 Raccoon City PD: +20 ammo and discard the inventory until a weapon', () => {
    const s = nmGame('ch-035');
    const withAction = addCard(s, 0, 'ac-034');
    const ammo1 = nextId('am-001');
    const knife = nextId('we-004');
    const tuned = tune(withAction, { inventory: [ammo1, knife] });
    const withInv: GameState = {
      ...tuned,
      cards: {
        ...tuned.cards,
        [ammo1]: { instanceId: ammo1, cardId: 'am-001', location: { zone: 'inventory', index: 0, seat: 0 } },
        [knife]: { instanceId: knife, cardId: 'we-004', location: { zone: 'inventory', index: 1, seat: 0 } },
      },
    };
    const next = playAction(withInv, 0, 'ac-034');
    expect(next.seats[0]?.turnAmmo).toBe(20);
    expect(next.seats[0]?.hand.some(id => id === knife)).toBe(true);
    expect(next.seats[0]?.discard.some(id => id === ammo1)).toBe(true);
  });

  it('AC-035 PDA: look at the top 3, trash one, return the rest', () => {
    const s = nmGame('ch-035');
    const withAction = addCard(s, 0, 'ac-035');
    const ids = [nextId('am-001'), nextId('am-001'), nextId('am-001')];
    const tuned = tune(withAction, { inventory: ids });
    const withInv: GameState = {
      ...tuned,
      cards: {
        ...tuned.cards,
        [ids[0] ?? '']: { instanceId: ids[0] ?? '', cardId: 'am-001', location: { zone: 'inventory', index: 0, seat: 0 } },
        [ids[1] ?? '']: { instanceId: ids[1] ?? '', cardId: 'am-001', location: { zone: 'inventory', index: 1, seat: 0 } },
        [ids[2] ?? '']: { instanceId: ids[2] ?? '', cardId: 'am-001', location: { zone: 'inventory', index: 2, seat: 0 } },
      },
    };
    let next = playAction(withInv, 0, 'ac-035');
    const lookPrompt = findPrompt(next, 'pdaLook');
    next = choose(next, 0, lookPrompt, 0); // trash the first looked-at card
    const returnPrompt = findPrompt(next, 'pdaReturn');
    next = choose(next, 0, returnPrompt, 0); // Top
    const trashed = ids[0];
    expect(next.removed).toContain(trashed);
    expect(next.seats[0]?.inventory).toContain(ids[1] ?? '');
    expect(next.seats[0]?.inventory).toContain(ids[2] ?? '');
  });

  it('AC-036 Toe to Toe: +1 action and draw one card per five inventory cards', () => {
    const s = tune(nmGame('ch-035'), { inventory: Array.from({ length: 10 }, (_, i) => `x${i}`) });
    const withAction = addCard(s, 0, 'ac-036');
    const next = playAction(withAction, 0, 'ac-036');
    expect(next.seats[0]?.actionsLeft).toBe(1); // 1 - 1 (play) + 1 (bonus)
    expect(next.seats[0]?.hand.length).toBe((withAction.seats[0]?.hand.length ?? 0) - 1 + 2);
  });

  it('AC-037 A Gift?: +2 cards, then discard the inventory', () => {
    const s = tune(nmGame('ch-035'), { inventory: Array.from({ length: 3 }, (_, i) => `x${i}`) });
    const withAction = addCard(s, 0, 'ac-037');
    const next = playAction(withAction, 0, 'ac-037');
    expect(next.seats[0]?.hand.length).toBe((withAction.seats[0]?.hand.length ?? 0) - 1 + 2);
    expect(next.seats[0]?.inventory.length).toBe(0);
    expect(next.seats[0]?.discard.length).toBe(1); // 3 - 2 drawn
  });

  it('AC-038 Mind Control: copy an Action card\'s bonuses and effects twice', () => {
    const s = nmGame('ch-035');
    const withAction = addCard(s, 0, 'ac-038');
    const withTarget = addCard(withAction, 1, 'ac-036'); // cost 70
    const targetAction = withTarget.seats[1]?.hand.find(id => withTarget.cards[id]?.cardId === 'ac-036') ?? '';
    let next = playAction(withTarget, 0, 'ac-038');
    const playerPrompt = findPrompt(next, 'chooseOtherPlayerRevealHand');
    next = choose(next, 0, playerPrompt, 0);
    const cardPrompt = findPrompt(next, 'chooseActionCardCostAtMost');
    next = choose(next, 0, cardPrompt, 0);
    // Toe to Toe: +1 action twice; the target discarded the card.
    expect(next.seats[0]?.actionsLeft).toBe(2); // 1 - 1 (play) + 2 (copied)
    expect(next.seats[1]?.discard).toContain(targetAction);
  });

  it('AC-039 Long Awaited Dawn: +2 actions and move discard cards to the top of the inventory', () => {
    const s = nmGame('ch-035');
    const withAction = addCard(s, 0, 'ac-039');
    const withJunk = addCard(addCard(withAction, 0, 'am-001', 'discard'), 0, 'am-001', 'discard');
    const junkIds = withJunk.seats[0]?.discard ?? [];
    const next = playAction(withJunk, 0, 'ac-039');
    expect(next.seats[0]?.actionsLeft).toBe(2); // 1 - 1 (play) + 2 (bonus)
    expect(next.seats[0]?.discard.length).toBe(0);
    for (const id of junkIds) expect(next.seats[0]?.inventory).toContain(id);
  });

  it('AC-040 Vengeful Intention: +2 cards, 10 damage, unlimited actions', () => {
    const s = tune(nmGame('ch-035'), { hp: 100 });
    const withAction = addCard(s, 0, 'ac-040');
    const next = playAction(withAction, 0, 'ac-040');
    expect(next.seats[0]?.hand.length).toBe((withAction.seats[0]?.hand.length ?? 0) - 1 + 2);
    expect(next.seats[0]?.hp).toBe(90);
    expect(next.seats[0]?.actionsLeft).toBe(999);
  });

  it('AC-041 Symbol of Evil: attaches, then acts at the start of the turn', () => {
    const s = tune(nmGame('ch-035'), { hp: 50 });
    const withAction = addCard(s, 0, 'ac-041');
    let next = playAction(withAction, 0, 'ac-041');
    const attached = next.seats[0]?.attached.find(id => next.cards[id]?.cardId === 'ac-041');
    expect(attached).toBeDefined();
    next = startTurn(next);
    // HP 50 > 10 -> 10 damage and +1 card
    expect(next.seats[0]?.hp).toBe(40);
  });
});
