import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { ALL_CARDS, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * CH-000 Rachael Foley — 80 Health, gates 1 / 5.
 *  L1: "At the beginning of your turn, you can get +1 Explore. If so, Rachael
 *       must Explore at least twice this turn."
 *  L2: "Whenever Rachael Explores, if she has no Partner and she has 50 or less
 *       Health, she gets +20 damage this turn."
 */

const RACHAEL = 'ch-000';

function rachaelDef() {
  const d = CUSTOM_CARDS.find(c => c.id === RACHAEL);
  if (d === undefined) throw new Error('missing ch-000 in CUSTOM_CARDS');
  return d;
}

function rachaelGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'P', controller: 'human', characterCardId: RACHAEL }] },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

/**
 * Start a fresh turn for Rachael. `over` is applied BEFORE startTurn (so the
 * level/decorations decide which turn-start prompts fire) and again AFTER (so
 * turn pools like turnAmmo survive the reset).
 */
function rachaelTurn(over: Partial<PlayerState> = {}): GameState {
  const turned = startTurn(rachaelGame(over));
  return { ...turned, seats: turned.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;

function addCard(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

function setMansionTop(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    cards[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck' as const, index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

/** Answer (or decline) every pending turn-start ability prompt. */
function clearTurnStartPrompts(s: GameState): GameState {
  let out = s;
  for (const kind of ['turnStartPlusExploreRequiresTwoExplores']) {
    for (let guard = 0; guard < 8; guard += 1) {
      const p = findPrompt(out, kind);
      if (p === undefined) break;
      out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

describe('CH-000 Rachael Foley data', () => {
  it('matches the printed card (80 Health, gates 1 / 5)', () => {
    expect(rachaelDef()).toEqual(expect.objectContaining({
      id: 'ch-000',
      name: 'Rachael Foley',
      type: 'character',
      set: 'custom',
      copies: 1,
      maxHp: 80,
      level1At: 1,
      level2At: 5,
    }));
    expect(rachaelDef().abilities).toEqual([
      { kind: 'turnStartPlusExploreRequiresTwoExplores', level: 1 },
      { kind: 'exploreDamageIfNoPartnerLowHp', amount: 20, hpThreshold: 50, level: 2 },
    ]);
    expect(rachaelDef().levels?.map(l => l.text)).toEqual([
      'At the beginning of your turn, you can get +1 Explore. If so, Rachael must Explore at least twice this turn.',
      'Whenever Rachael Explores, if she has no Partner and she has 50 or less Health, she gets +20 damage this turn.',
    ]);
  });

  it('is NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    expect(ALL_CARDS.some(c => c.id === RACHAEL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L1 — the turn-start choice
// ---------------------------------------------------------------------------

describe('CH-000 L1: turn-start +1 Explore', () => {
  it('offers the choice at the start of her turn once she is level 1', () => {
    const s = rachaelTurn({ level: 1, decorations: 1 });
    const prompt = findPrompt(s, 'turnStartPlusExploreRequiresTwoExplores');
    expect(prompt).toBeDefined();
    expect(prompt?.options).toEqual(['Gain +1 Explore', 'Decline']);
    expect(prompt?.seat).toBe(0);
  });

  it('does not offer it below level 1', () => {
    const s = rachaelTurn({ level: 0, decorations: 0 });
    expect(findPrompt(s, 'turnStartPlusExploreRequiresTwoExplores')).toBeUndefined();
  });

  it('accepting grants +1 Explore and a debt of two Explores', () => {
    const s = rachaelTurn({ level: 1, decorations: 1 });
    const prompt = findPrompt(s, 'turnStartPlusExploreRequiresTwoExplores');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const next = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(next.seats[0]?.exploresLeft).toBe(2);
    expect(next.seats[0]?.exploresRequiredThisTurn).toBe(2);
  });

  it('declining grants nothing and leaves no debt', () => {
    const s = rachaelTurn({ level: 1, decorations: 1 });
    const prompt = findPrompt(s, 'turnStartPlusExploreRequiresTwoExplores');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const next = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 1 });
    expect(next.seats[0]?.exploresLeft).toBe(1);
    expect(next.seats[0]?.exploresRequiredThisTurn).toBeUndefined();
  });

  it('has a distinct prompt id, so it cannot collide with a partner\'s turn-start ability', () => {
    // RC-001 as the Partner also has an unconditional turn-start prompt, which
    // uses the generic `ability-<seat>-v<version>` id.
    const partnerId = 'rc-001#p';
    const base = rachaelGame({ level: 2, decorations: 5, hp: 80 });
    const withPartner: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [partnerId]: { instanceId: partnerId, cardId: 'rc-001', location: { zone: 'attached', index: 0, seat: 0 } },
      },
      seats: base.seats.map((p, i) => (i === 0
        ? { ...p, partnerInstanceId: partnerId, partnerAttached: [], partnerHp: 70, partnerMaxHp: 70 }
        : p)),
    };
    const turned = startTurn(withPartner);
    const kinds = turned.prompts.map(p => p.payload?.kind);
    expect(kinds).toContain('turnStartPlusExploreRequiresTwoExplores');
    expect(kinds).toContain('rebeccaTurnStartDrawAndDiscard');
    const ids = turned.prompts.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// L1 — the two-Explore debt
// ---------------------------------------------------------------------------

describe('CH-000 L1: the debt blocks endTurn until two Explores are spent', () => {
  /** Level 1, debt accepted, two Handguns in hand, a 10-HP infected on top. */
  function armed(over: Partial<PlayerState> = {}) {
    const s = rachaelTurn({ level: 1, decorations: 1, hp: 80, turnAmmo: 40, ...over });
    const prompt = findPrompt(s, 'turnStartPlusExploreRequiresTwoExplores');
    if (prompt === undefined) throw new Error('no L1 prompt');
    const accepted = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    const { state: s1, id: gun1 } = addCard(accepted, 0, 'we-009');
    const { state: s2, id: gun2 } = addCard(s1, 0, 'we-009');
    const { state: s3, ids } = setMansionTop(s2, ['ma-005']); // Bui Kichwa, 10 HP
    return { state: s3, gun1, gun2, mansionId: ids[0] };
  }

  it('blocks endTurn, then pays down one Explore at a time', () => {
    const { state, gun1 } = armed();
    expect(() => applyAction(state, { type: 'endTurn', seat: 0 })).toThrow();

    const after1 = applyAction(state, { type: 'explore', seat: 0, weapons: [gun1], exploreCount: 1 });
    expect(after1.seats[0]?.exploresRequiredThisTurn).toBe(1);
    expect(after1.seats[0]?.exploresLeft).toBe(1);
    expect(after1.seats[0]?.attached).toContain(state.mansionDeck[0]); // defeated
    expect(() => applyAction(after1, { type: 'endTurn', seat: 0 })).toThrow();
  });

  it('endTurn is allowed once both Explores are spent', () => {
    const { state, gun1, gun2 } = armed();
    const after1 = applyAction(state, { type: 'explore', seat: 0, weapons: [gun1], exploreCount: 1 });
    const { state: reTopped, ids } = setMansionTop(after1, ['ma-005']);
    const after2 = applyAction(reTopped, { type: 'explore', seat: 0, weapons: [gun2], exploreCount: 1 });
    expect(after2.seats[0]?.exploresRequiredThisTurn).toBe(0);
    expect(after2.seats[0]?.attached).toContain(ids[0]);
    // No longer blocked: endTurn advances the game instead of throwing.
    const ended = applyAction(after2, { type: 'endTurn', seat: 0 });
    expect(ended.version).toBeGreaterThan(after2.version);
  });

  it('a multi-explore with exploreCount 2 pays the whole debt at once', () => {
    const { state, gun1 } = armed();
    // Two 10-HP infected on top: a single Handgun (10) cannot clear a 20-HP
    // combo, so this only proves the DEBT accounting, not the damage.
    const { state: reTopped } = setMansionTop(state, ['ma-005']);
    const after = applyAction(reTopped, { type: 'explore', seat: 0, weapons: [gun1], exploreCount: 2 });
    expect(after.seats[0]?.exploresRequiredThisTurn).toBe(0);
    expect(after.seats[0]?.exploresLeft).toBe(0);
  });

  it('does not block endTurn when she cannot explore', () => {
    const { state } = armed();
    const stuck: GameState = {
      ...state,
      seats: state.seats.map((p, i) => (i === 0 ? { ...p, exploresLeft: 0 } : p)),
    };
    const ended = applyAction(stuck, { type: 'endTurn', seat: 0 });
    expect(ended.version).toBeGreaterThan(stuck.version);
  });

  it('the debt is cleared at the start of the next turn', () => {
    const { state } = armed();
    expect(state.seats[0]?.exploresRequiredThisTurn).toBe(2);
    const next = startTurn(state);
    expect(next.seats[0]?.exploresRequiredThisTurn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// L2 — solo, low Health explore damage
// ---------------------------------------------------------------------------

describe('CH-000 L2: +20 damage when solo and at 50 or less Health', () => {
  function exploreWith(over: Partial<PlayerState> = {}, mansion: readonly string[] = ['ma-004']) {
    const base = clearTurnStartPrompts(rachaelTurn({ level: 2, decorations: 5, hp: 50, turnAmmo: 40, ...over }));
    const { state: withGun, id: gun } = addCard(base, 0, 'we-004'); // Combat Knife, 5 damage
    const { state: withTop, ids } = setMansionTop(withGun, mansion);
    const revealed = applyAction(withTop, { type: 'explore', seat: 0, weapons: [gun], exploreCount: 1 });
    return { revealed, mansionId: ids[0] };
  }

  it('defeats an infected it could not at base damage (solo, 50 Health)', () => {
    // Combat Knife 5 damage; +20 => 25 >= ma-004's 25 HP.
    const { revealed, mansionId } = exploreWith();
    expect(revealed.seats[0]?.attached).toContain(mansionId);
  });

  it('does not apply above 50 Health', () => {
    const { revealed, mansionId } = exploreWith({ hp: 51 });
    expect(revealed.seats[0]?.attached).not.toContain(mansionId);
  });

  it('does not apply at level 1', () => {
    const { revealed, mansionId } = exploreWith({ level: 1, decorations: 1 });
    expect(revealed.seats[0]?.attached).not.toContain(mansionId);
  });

  it('does not apply when she has a Partner', () => {
    const partnerId = 'ch-003#p';
    const base = clearTurnStartPrompts(rachaelTurn({ level: 2, decorations: 5, hp: 50, turnAmmo: 40 }));
    const withPartner: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [partnerId]: { instanceId: partnerId, cardId: 'ch-003', location: { zone: 'attached', index: 0, seat: 0 } },
      },
      seats: base.seats.map((p, i) => (i === 0
        ? { ...p, partnerInstanceId: partnerId, partnerAttached: [], partnerHp: 80, partnerMaxHp: 80 }
        : p)),
    };
    const { state: withGun, id: gun } = addCard(withPartner, 0, 'we-004');
    const { state: withTop, ids } = setMansionTop(withGun, ['ma-004']);
    const revealed = applyAction(withTop, { type: 'explore', seat: 0, weapons: [gun], exploreCount: 1 });
    expect(revealed.seats[0]?.attached).not.toContain(ids[0]);
  });
});
