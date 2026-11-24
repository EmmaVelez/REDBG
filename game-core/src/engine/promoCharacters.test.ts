import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { gainCard } from './gainCard';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { ALLIANCE_CARDS } from '../data/alliance';

/**
 * JP 2025 promo characters PR-003 George Hamilton, PR-005 Albert Wesker and
 * PR-008 Cindy Lennox (scans transcribed 2026-11-23).
 */

function game(charId: string, over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [
      { name: 'P', controller: 'human', characterCardId: charId },
      { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
    ] },
    PREMIER_CARDS,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  // IT-004 Red Herb lives in the Alliance set; the Premier-only rig still needs
  // its def so "Herb"-in-name checks resolve.
  const redHerb = ALLIANCE_CARDS.find(c => c.id === 'it-004');
  const cardDefs = redHerb === undefined ? s.cardDefs : { ...s.cardDefs, [redHerb.id]: redHerb };
  return { ...s, cardDefs, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function addCard(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

const findPrompt = (s: GameState, kind: string) =>
  s.prompts.find(p => p.payload?.kind === kind);

const answer = (s: GameState, kind: string, option: number) => {
  const p = findPrompt(s, kind);
  expect(p).toBeDefined();
  return applyAction(s, { type: 'chooseOption', seat: p!.seat, promptId: p!.id, option });
};

describe('PR-003 George Hamilton', () => {
  it('carries the printed stats and gates', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'pr-003')!;
    expect(def.maxHp).toBe(80);
    expect(def.level1At).toBe(2);
    expect(def.level2At).toBe(6);
  });

  it('L1: trashing a Green Herb gives +1 Action this turn', () => {
    let s = game('pr-003', { level: 1, actionsLeft: 1 });
    const g = addCard(s, 0, 'it-001');          // Green Herb
    s = g.state;
    const activated = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(findPrompt(activated, 'georgeHerbTrash')).toBeDefined();
    const out = answer(activated, 'georgeHerbTrash', activated.prompts.find(p => p.payload?.kind === 'georgeHerbTrash')!.options.indexOf(g.id));
    expect(out.seats[0]?.actionsLeft).toBe(2);
    expect(out.seats[0]?.discard).toContain(g.id);
    expect(out.seats[0]?.hand).not.toContain(g.id);
  });

  it('L1: trashing a Red Herb gives +1 Explore this turn', () => {
    let s = game('pr-003', { level: 1, exploresLeft: 1 });
    const r = addCard(s, 0, 'it-004');          // Red Herb
    s = r.state;
    const activated = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const out = answer(activated, 'georgeHerbTrash', activated.prompts.find(p => p.payload?.kind === 'georgeHerbTrash')!.options.indexOf(r.id));
    expect(out.seats[0]?.exploresLeft).toBe(2);
  });

  it('L1: declining changes nothing', () => {
    let s = game('pr-003', { level: 1, actionsLeft: 1 });
    const g = addCard(s, 0, 'it-001');
    s = g.state;
    const activated = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const out = answer(activated, 'georgeHerbTrash', activated.prompts.find(p => p.payload?.kind === 'georgeHerbTrash')!.options.indexOf('Decline'));
    expect(out.seats[0]?.actionsLeft).toBe(1);
    expect(out.seats[0]?.hand).toContain(g.id);
  });

  it('L2: reveal X Herbs and draw X (player-chosen count)', () => {
    let s = game('pr-003', { level: 2, hp: 80, hand: [] });
    const a = addCard(s, 0, 'it-001');
    const b = addCard(a.state, 0, 'it-004');
    s = b.state;
    const turned = startTurn(s);
    expect(findPrompt(turned, 'georgeRevealHerbs')).toBeDefined();
    const idx = turned.prompts.find(p => p.payload?.kind === 'georgeRevealHerbs')!.options.indexOf('Reveal 2 Herbs');
    expect(idx).toBeGreaterThanOrEqual(0);
    const base = turned.seats[0]!.hand.length;
    const out = answer(turned, 'georgeRevealHerbs', idx);
    // The Herbs stay in hand; the ability draws X cards on top of them.
    expect(out.seats[0]?.hand.length).toBe(base + 2);
    expect(out.seats[0]?.hand).toContain(a.id);
    expect(out.seats[0]?.hand).toContain(b.id);
  });
});

describe('PR-005 Albert Wesker', () => {
  it('carries the printed stats and gates', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'pr-005')!;
    expect(def.maxHp).toBe(100);
    expect(def.level1At).toBe(2);
    expect(def.level2At).toBe(6);
  });

  it('L1: rejected while Maximum Health is above 80, then draws a card once it is not', () => {
    let s = game('pr-005', { level: 1, maxHp: 100 });
    expect(validateAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, maxHp: 80 } : p)) };
    expect(validateAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(true);
    const before = s.seats[0]!.hand.length + s.seats[0]!.inventory.length;
    const out = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(out.seats[0]!.hand.length + out.seats[0]!.inventory.length).toBe(before);
    expect(out.seats[0]!.hand.length).toBe(s.seats[0]!.hand.length + 1);
  });

  it('L2: grants +1 Explore below 60 Maximum Health', () => {
    let s = game('pr-005', { level: 2, maxHp: 100, exploresLeft: 1 });
    expect(validateAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, maxHp: 60 } : p)) };
    const out = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(out.seats[0]?.exploresLeft).toBe(2);
  });
});

describe('PR-008 Cindy Lennox', () => {
  it('carries the printed stats and gates', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'pr-008')!;
    expect(def.maxHp).toBe(70);
    expect(def.level1At).toBe(1);
    expect(def.level2At).toBe(5);
  });

  it('L1: gaining a Herb grants +1 Buy this turn', () => {
    const s = game('pr-008', { level: 1, buysLeft: 1 });
    const out = gainCard(s, { seat: 0, cardId: 'it-001', destination: 'discard', reason: 'ability' });
    expect(out.seats[0]?.buysLeft).toBe(2);
    const out2 = gainCard(s, { seat: 0, cardId: 'we-004', destination: 'discard', reason: 'ability' });
    expect(out2.seats[0]?.buysLeft).toBe(1);
  });

  it('L2: at full Health, offers +20 Damage this turn at turn start', () => {
    const s = game('pr-008', { level: 2, hp: 70, maxHp: 70 });
    const turned = startTurn(s);
    expect(findPrompt(turned, 'cindyFullHpDamage')).toBeDefined();
    const out = answer(turned, 'cindyFullHpDamage', 0);
    expect(out.seats[0]?.weaponDamageBonusThisTurn).toBe(20);
  });

  it('L2: no offer when she is not at full Health', () => {
    const s = game('pr-008', { level: 2, hp: 50, maxHp: 70 });
    const turned = startTurn(s);
    expect(findPrompt(turned, 'cindyFullHpDamage')).toBeUndefined();
  });
});

describe('PR-006 Yoko Suzuki', () => {
  it('carries the printed stats and gates', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'pr-006')!;
    expect(def.maxHp).toBe(70);
    expect(def.level1At).toBe(3);
    expect(def.level2At).toBe(4);
  });

  it('L1: attaches a hand card face down, returning the previous one to hand', () => {
    let s = game('pr-006', { level: 1, });
    const first = addCard(s, 0, 'it-001');
    const second = addCard(first.state, 0, 'ac-001');
    s = { ...second.state, seats: second.state.seats.map((p, i) => (i === 0 ? { ...p, attached: [first.id], faceDownAttachedId: first.id } : p)) };
    const act = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const p = findPrompt(act, 'attachFaceDownChoice');
    expect(p).toBeDefined();
    const out = applyAction(act, { type: 'chooseOption', seat: 0, promptId: p!.id, option: p!.options.indexOf(second.id) });
    expect(out.seats[0]?.attached).toEqual([second.id]);
    expect(out.seats[0]?.faceDownAttachedId).toBe(second.id);
    expect(out.seats[0]?.hand).toContain(first.id);
    expect(out.seats[0]?.hand).not.toContain(second.id);
  });

  it('L2: a lethal hit instead lowers Maximum Health by 20 and heals her to full', () => {
    let s = game('pr-006', { level: 2, hp: 5, maxHp: 70 });
    const w = addCard(s, 1, 'we-004');                 // 5 damage, no ammo
    s = { ...w.state, activeSeat: 1 };
    const out = applyAction(s, { type: 'attack', seat: 1, targetSeat: 0, weaponInstanceId: w.id });
    expect(out.seats[0]?.maxHp).toBe(50);
    expect(out.seats[0]?.hp).toBe(50);
  });
});

describe('PR-007 Alyssa Ashcroft', () => {
  it('carries the printed stats and gates', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'pr-007')!;
    expect(def.maxHp).toBe(80);
    expect(def.level1At).toBe(2);
    expect(def.level2At).toBe(5);
  });

  it('L1: pays 20 Ammo for +10 Damage on the single Weapon she is using', () => {
    let s = game('pr-007', { level: 1, hp: 80, maxHp: 80, turnAmmo: 25, exploresLeft: 1, });
    const w = addCard(s, 0, 'we-004');
    s = w.state;
    const asked = applyAction(s, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    expect(findPrompt(asked, 'exploreChoice')).toBeDefined();
    expect(asked.seats[0]?.exploresLeft).toBe(1);       // parked
    const out = answer(asked, 'exploreChoice', 0);
    expect(out.seats[0]?.turnAmmo).toBe(5);
    expect(out.seats[0]?.weaponDamageBonusById?.[w.id]).toBe(10);
    expect(out.seats[0]?.exploresLeft).toBe(0);        // the explore completed
  });

  it('L2: naming the right type draws the revealed card and grants +1 Explore', () => {
    let s = game('pr-007', { level: 2, exploresLeft: 1 });
    const w = addCard(s, 0, 'we-009');                 // a weapon sitting on top of the Inventory
    s = { ...w.state, seats: w.state.seats.map((p, i) => (i === 0 ? { ...p, inventory: [w.id] } : p)) };
    const act = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const p = findPrompt(act, 'alyssaNameType');
    expect(p).toBeDefined();
    const out = applyAction(act, { type: 'chooseOption', seat: 0, promptId: p!.id, option: p!.options.indexOf('weapon') });
    expect(out.seats[0]?.hand).toContain(w.id);
    expect(out.seats[0]?.exploresLeft).toBe(2);
  });

  it('L2: a wrong guess leaves the card on top and grants nothing', () => {
    let s = game('pr-007', { level: 2, exploresLeft: 1 });
    const w = addCard(s, 0, 'we-009');
    s = { ...w.state, seats: w.state.seats.map((p, i) => (i === 0 ? { ...p, inventory: [w.id] } : p)) };
    const act = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const p = findPrompt(act, 'alyssaNameType')!;
    const out = applyAction(act, { type: 'chooseOption', seat: 0, promptId: p.id, option: p.options.indexOf('action') });
    expect(out.seats[0]?.inventory[0]).toBe(w.id);
    expect(out.seats[0]?.exploresLeft).toBe(1);
  });
});

describe('PR-004 Jim Chapman', () => {
  it('carries the printed stats and gates', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'pr-004')!;
    expect(def.maxHp).toBe(70);
    expect(def.level1At).toBe(3);
    expect(def.level2At).toBe(7);
  });

  it('L1: parks the explore for the coin flip, then resolves it', () => {
    let s = game('pr-004', { level: 1, hp: 70, turnAmmo: 0, exploresLeft: 1, });
    const w = addCard(s, 0, 'we-004');
    s = w.state;
    const asked = applyAction(s, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    expect(findPrompt(asked, 'exploreChoice')).toBeDefined();
    expect(asked.seats[0]?.exploresLeft).toBe(1);
    const hpBefore = asked.seats[0]!.hp;
    const out = answer(asked, 'exploreChoice', 0);
    expect(out.seats[0]?.exploresLeft).toBe(0);
    const bonus = out.seats[0]?.weaponDamageBonusById?.[w.id] ?? 0;
    if (bonus > 0) {
      expect(bonus).toBe(5);                            // heads: doubled
      expect(out.seats[0]?.hp).toBe(hpBefore);
    } else {
      expect(out.seats[0]?.hp).toBeLessThan(hpBefore);  // tails: 10 damage
    }
  });

  it('L2: after revealing an Infected, offers 2 Ammo x10 for bottoming them', () => {
    let s = game('pr-004', { level: 2, hp: 70, turnAmmo: 0, exploresLeft: 1, hand: [] });
    const jid = 'ma-001#jim1';
    const deck = [...s.mansionDeck];
    deck[0] = jid;
    s = { ...s, mansionDeck: deck,
      cards: { ...s.cards, [jid]: { instanceId: jid, cardId: 'ma-001', location: { zone: 'mansionDeck', index: 0 } } },
      cardDefs: { ...s.cardDefs, 'ma-001': { ...s.cardDefs['ma-001']!, hp: 999 } } };
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    const p = findPrompt(explored, 'jimRevealAmmo');
    expect(p).toBeDefined();
    const out = answer(explored, 'jimRevealAmmo', 0);
    expect(out.mansionDeck[out.mansionDeck.length - 1]).toBe(jid);
    const ammo = [...out.seats[0]!.discard, ...out.seats[0]!.hand, ...out.seats[0]!.inventory]
      .filter(id => out.cards[id]?.cardId === 'am-001').length;
    expect(ammo).toBeGreaterThanOrEqual(2);
  });
});
