import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { canBePartner } from './characters';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { sanitize } from './view';
import { enumerateLegalActions } from '../ai/enumerate';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * FCH-008 Sherry Birkin — "Sherry cannot use Weapons. Once per turn Sherry can
 * force another Player to Explore with her. Sherry's hand and Sherry's Items
 * this turn can assist that Player. Defeated Infected are awarded to Sherry.
 * Any Damage is split evenly between both Characters. The Exploring Player
 * draws a new Hand after."
 */

const SHERRY = CUSTOM_CARDS.find(c => c.id === 'fch-008');

function sherryGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'Sherry', controller: 'human', characterCardId: 'fch-008' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-002' },
      ],
    },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function addWeapon(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
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

function withTurnAmmo(s: GameState, seat: number, amount: number): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === seat ? { ...p, turnAmmo: amount } : p)) };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

describe('FCH-008 Sherry Birkin data', () => {
  it('matches the printed card', () => {
    expect(SHERRY).toEqual(expect.objectContaining({
      id: 'fch-008', name: 'Sherry Birkin', type: 'character', set: 'custom',
      copies: 1, maxHp: 50, level1At: 0,
    }));
    expect(SHERRY?.level2At).toBeUndefined();
    expect(SHERRY?.abilities).toEqual([
      { kind: 'cannotUseWeapons', level: 1 },
      { kind: 'forceAllyExploreWithSupport', level: 1 },
      { kind: 'cannotBePartner', level: 1 },
    ]);
  });

  it('is a single-level character unlocked from the start', () => {
    const s = sherryGame();
    expect(s.seats[0]?.level).toBe(1);
    expect(s.seats[0]?.maxHp).toBe(50);
  });

  it('joins the deal pool only when the room selected it', () => {
    expect(cardsForScenario('firstTimer').some(c => c.id === 'fch-008')).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['fch-008'] });
    expect(on.some(c => c.id === 'fch-008')).toBe(true);
  });
});

describe('FCH-008 — Sherry cannot use Weapons', () => {
  it('rejects any explore that names a weapon', () => {
    const { state, id } = addWeapon(sherryGame({ level: 1 }), 0, 'we-009');
    const v = validateAction(state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(v.ok).toBe(false);
  });

  it('offers no explore at all', async () => {
    const { enumerateLegalActions } = await import('../ai/enumerate');
    const s = startTurn(sherryGame({ level: 1, turnAmmo: 50 }));
    const legal = enumerateLegalActions(s, 0);
    expect(legal.some(a => a.type === 'explore')).toBe(false);
  });
});

describe('FCH-008 — force another Player to Explore with her', () => {
  it('is offered once per turn and prompts for the target', () => {
    const s = withTurnAmmo(startTurn(sherryGame({ level: 1 })), 0, 100);
    const used = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    expect(prompt).toBeDefined();
    expect(prompt?.options).toEqual(['1']);
    // once per turn
    expect(validateAction(used, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
  });

  it('the exploring player uses both arsenals, and the damage is split', () => {
    const s = withTurnAmmo(startTurn(sherryGame({ level: 1 })), 0, 100);
    const { state: s1, id: targetWeapon } = addWeapon(s, 1, 'we-009');
    const { state: s2, id: sherryWeapon } = addWeapon(s1, 0, 'we-009');
    const { state: s3 } = setMansionTop(s2, ['ma-006']); // Licker: 40 HP, 30 attack
    const used = applyAction(s3, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });

    // Two Handguns = 20 damage < 40 HP -> not defeated; 30 damage split 15/15.
    expect(after.seats[1]?.hp).toBe(80 - 15);
    expect(after.seats[0]?.hp).toBe(50 - 15);
    // Sherry paid the ammo for every weapon in the combined arsenal (3 Handguns).
    expect(after.seats[0]?.turnAmmo).toBe(100 - 60);
    // Each weapon ended up in its owner's play area.
    expect(after.seats[1]?.playArea).toContain(targetWeapon);
    expect(after.seats[0]?.playArea).toContain(sherryWeapon);
    expect(after.seats[1]?.hand).not.toContain(targetWeapon);
    expect(after.seats[0]?.hand).not.toContain(sherryWeapon);
    // The exploring player drew a new hand (the old one went to the discard).
    expect(after.seats[1]?.hand.length).toBe(5);
    expect(after.seats[1]?.discard.length).toBeGreaterThan(0);
    // Not defeated: the Infected went to the bottom of the Mansion.
    expect(after.seats[0]?.decorations).toBe(0);
    expect(after.seats[1]?.decorations).toBe(0);
  });

  it("may spend the exploring player's Ammo too", () => {
    const s = withTurnAmmo(withTurnAmmo(startTurn(sherryGame({ level: 1 })), 0, 0), 1, 100);
    const { state: s1 } = addWeapon(s, 1, 'we-009');
    const { state: s2 } = addWeapon(s1, 0, 'we-009');
    const { state: s3 } = setMansionTop(s2, ['ma-002']);
    const used = applyAction(s3, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    // Sherry has no Ammo, so the exploring player pays the whole 60.
    expect(after.seats[0]?.turnAmmo).toBe(0);
    expect(after.seats[1]?.turnAmmo).toBe(40);
  });

  it('awards defeated Infected (and their Decorations) to Sherry', () => {
    const s = withTurnAmmo(startTurn(sherryGame({ level: 1 })), 0, 100);
    const { state: s1, id: targetWeapon } = addWeapon(s, 1, 'we-009');
    const { state: s2, id: sherryWeapon } = addWeapon(s1, 0, 'we-009');
    const { state: s3, ids } = setMansionTop(s2, ['ma-002']); // Zombie (Male): 20 HP, 1 decoration
    const used = applyAction(s3, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });

    // 20 damage == 20 HP -> defeated, no damage taken by either character.
    expect(after.seats[1]?.hp).toBe(80);
    expect(after.seats[0]?.hp).toBe(50);
    expect(after.seats[0]?.decorations).toBe(1);
    expect(after.seats[0]?.attached).toContain(ids[0]);
    expect(after.seats[1]?.decorations).toBe(0);
    expect(after.removed).toContain(ids[0]);
  });

  it('does not fire when the target is dead', () => {
    const s = startTurn(sherryGame({ level: 1, turnAmmo: 50, hp: 0, dead: true }));
    expect(validateAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
  });

  it('logs the forced explore so the client reveal overlay can fire', () => {
    // The forced explore is not a player-submitted explore action, so the
    // reducer records one (with `forcedBy`) — otherwise detectReveal never
    // fires and the reveal overlay never plays.
    const s = withTurnAmmo(startTurn(sherryGame({ level: 1 })), 0, 100);
    const { state: s1 } = addWeapon(s, 1, 'we-009');
    const { state: s2 } = addWeapon(s1, 0, 'we-009');
    const { state: s3 } = setMansionTop(s2, ['ma-002']);
    const used = applyAction(s3, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(after.log[after.log.length - 1]?.action).toMatchObject({
      type: 'explore', seat: 1, exploreCount: 1, forcedBy: 0,
    });
  });

  it('enumerates identically from the full state and the sanitized view', () => {
    // The client enumerates actions from its SANITIZED view (other seats' hands
    // are hidden-*); the server enumerates from the full state. A hand-dependent
    // validity check would offer an ability button the server then rejects.
    const s = withTurnAmmo(startTurn(sherryGame({ level: 1 })), 0, 0);
    const { state: s1 } = addWeapon(s, 1, 'we-009'); // target holds a 20-ammo Handgun
    const has = (st: GameState): boolean => enumerateLegalActions(st, 0).some(
      a => a.type === 'useCharacterAbility' && a.abilityIndex === 1,
    );
    expect(has(s1)).toBe(true);
    expect(has(sanitize(s1, 0))).toBe(true);
  });

  it('still explores when neither hand holds a weapon (unarmed)', () => {
    // Regression: the old `if (weaponIds.length === 0) return state` made the
    // ability silently do nothing when neither Sherry nor the target had a
    // weapon. The card forces the explore regardless.
    const base = startTurn(sherryGame({ level: 1 }));
    const stripped = {
      ...base,
      seats: base.seats.map(p => ({
        ...p,
        hand: p.hand.filter(id => base.cardDefs[base.cards[id]?.cardId ?? '']?.type !== 'weapon'),
      })),
    };
    const { state: s3 } = setMansionTop(stripped, ['ma-006']); // Licker: 40 HP, 30 attack
    const used = applyAction(s3, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const prompt = findPrompt(used, 'sherryForceExplore');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const after = applyAction(used, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    // Unarmed: 0 damage < 40 HP -> not defeated, the full 30 damage is split.
    expect(after.seats[1]?.hp).toBe(80 - 15);
    expect(after.seats[0]?.hp).toBe(50 - 15);
    // The exploring player still drew a new hand.
    expect(after.seats[1]?.hand.length).toBe(5);
    // The Infected went to the bottom of the Mansion.
    expect(after.seats[0]?.decorations).toBe(0);
  });
});

describe('FCH-008 — cannot be a Partner', () => {
  it('is never a legal partner pick', () => {
    expect(canBePartner(SHERRY)).toBe(false);
    // A normal custom character is still partner-eligible.
    expect(canBePartner(CUSTOM_CARDS.find(c => c.id === 'lk-001'))).toBe(true);
  });

  it('setup rejects fch-008 as an explicit partner', () => {
    expect(() =>
      setup(
        {
          seed: 1,
          partnerMode: true,
          players: [
            { name: 'A', controller: 'human', characterCardId: 'ch-001', partnerCharacterId: 'fch-008' },
            { name: 'B', controller: 'human' },
          ],
        },
        [...PREMIER_CARDS, ...CUSTOM_CARDS],
        FIRST_TIMER_PILES,
        STANDARD_MANSION_DECK,
      )
    ).toThrow(/cannot be a partner/);
  });

  it('partner mode never deals fch-008 as a random partner', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = setup(
        {
          seed,
          partnerMode: true,
          players: [
            { name: 'A', controller: 'human' },
            { name: 'B', controller: 'human' },
          ],
        },
        [...PREMIER_CARDS, ...CUSTOM_CARDS],
        FIRST_TIMER_PILES,
        STANDARD_MANSION_DECK,
      );
      for (const p of s.seats) {
        expect(p.partnerInstanceId?.replace(/#.*$/, '')).not.toBe('fch-008');
      }
    }
  });

  it('still allows fch-008 as a main character with a partner', () => {
    const s = setup(
      {
        seed: 1,
        partnerMode: true,
        players: [
          { name: 'Sherry', controller: 'human', characterCardId: 'fch-008' },
          { name: 'B', controller: 'human' },
        ],
      },
      [...PREMIER_CARDS, ...CUSTOM_CARDS],
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(s.seats[0]?.characterInstanceId).toBe('fch-008#1');
    expect(s.seats[0]?.partnerInstanceId).toBeDefined();
  });
});
