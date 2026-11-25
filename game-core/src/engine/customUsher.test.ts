import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { cardsForScenario, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { CUSTOM_CARDS } from '../data/custom';
import {
  locationScore, locationEndOfTurnDraws, locationBuyCostReduction,
  hasTrashOnSecondGain, cubesOn, topLocationId,
} from './locations';

/**
 * "Fall of the House of Usher" game mode (Manny, 2026-11-19):
 * 3 RANDOM fan Locations start face-up in play at setup. No location deck,
 * no On Reveal effects ever; GLOBAL effects are live for everyone, invest
 * effects still need gold cubes, 1X uses still cost gold + a Buy. The LOC
 * cards are no longer individually selectable in the custom-card picker.
 *
 * Deterministic seeds (2 human seats, ch-002 / ch-003, firstTimer) USED to be
 * pinned here (seed 67 -> loc-016/loc-001/loc-008, ...). The map is
 * POOL-SIZE-DEPENDENT: every Location added reseeds the whole deal (batch 11
 * took the pool 48 -> 51 and red'd six tests), so the tests now DISCOVER a seed
 * that deals the card(s) they need instead of hard-coding one. `seedDealing`
 * scans seeds 1..400; keep the wanted set small so the scan stays fast.
 */

const LOC_IDS = CUSTOM_CARDS.filter(c => c.type === 'location').map(c => c.id);

function usherGame(seed: number, over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed,
      players: [
        { name: 'A', controller: 'human', characterCardId: 'ch-002' },
        { name: 'B', controller: 'human', characterCardId: 'ch-003' },
      ],
      usherMode: true,
    },
    cardsForScenario('firstTimer', { usherMode: true }),
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

/** The card ids dealt face-up for one seed. */
function usherDeal(seed: number): readonly string[] {
  const s = usherGame(seed);
  return (s.locations ?? []).map(l => s.cards[l.instanceId]?.cardId ?? '');
}

/**
 * First seed whose Usher deal satisfies `ok(deal)` AND contains EVERY id in
 * `wanted`. Replaces the old hard-coded seed map, which a single added Location
 * invalidates (batch 11 took the pool 48 -> 51 and red'd six tests).
 */
function seedDealingWhere(
  ok: (deal: readonly string[]) => boolean,
  ...wanted: readonly string[]
): number {
  for (let seed = 1; seed <= 4000; seed++) {
    const dealt = usherDeal(seed);
    if (!ok(dealt)) continue;
    if (wanted.every(w => dealt.includes(w))) return seed;
  }
  throw new Error(`no seed in 1..4000 deals: ${wanted.join(', ')}`);
}

function seedDealing(...wanted: readonly string[]): number {
  return seedDealingWhere(() => true, ...wanted);
}

/**
 * First seed dealing at least one id from EACH group — for a test that needs
 * "some HP-heal revealer AND some HP-damage revealer" without naming which.
 */
function seedDealingAny(groups: readonly (readonly string[])[]): number {
  for (let seed = 1; seed <= 4000; seed++) {
    const dealt = usherDeal(seed);
    if (groups.every(g => g.some(id => dealt.includes(id)))) return seed;
  }
  throw new Error(`no seed in 1..4000 deals one of: ${groups.map(g => g.join('|')).join(', ')}`);
}

/** The instance id of the dealt copy of `cardId` (instance ids are seed-stable). */
function dealtInstanceId(s: GameState, cardId: string): string {
  const loc = (s.locations ?? []).find(l => s.cards[l.instanceId]?.cardId === cardId);
  if (loc === undefined) throw new Error(`${cardId} not in play`);
  return loc.instanceId;
}

let counter = 0;
/** Replace seat 0's hand with fresh instances of the given card ids. */
function hand(s: GameState, cardIds: readonly string[]): GameState {
  const ids = cardIds.map(cardId => `${cardId}#u${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand' as const, index: 0, seat: 0 } };
  }
  return { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: ids } : p)) };
}

describe('Fall of the House of Usher — setup', () => {
  it('cardsForScenario pulls EVERY Location def in only when usherMode is on', () => {
    const withMode = cardsForScenario('firstTimer', { usherMode: true });
    for (const id of LOC_IDS) expect(withMode.some(c => c.id === id)).toBe(true);
    const without = cardsForScenario('firstTimer');
    for (const id of LOC_IDS) expect(without.some(c => c.id === id)).toBe(false);
  });

  it('deals exactly 3 distinct random Locations face-up — no deck, no prompts', () => {
    const s = usherGame(1);
    const locs = s.locations ?? [];
    expect(locs.length).toBe(3);
    const cardIds = locs.map(l => s.cards[l.instanceId]?.cardId);
    expect(new Set(cardIds).size).toBe(3);
    for (const id of cardIds) expect(LOC_IDS).toContain(id);
    for (const l of locs) {
      expect(l.cubes).toEqual({});
      expect(l.revealedBy).toBe(-1);
    }
    expect(s.locationDeck).toBeUndefined();
    expect(s.prompts).toEqual([]);
    expect(topLocationId(s)).toBeUndefined();
  });

  it('is deterministic per seed and varies across seeds', () => {
    const a = usherGame(1);
    const b = usherGame(1);
    expect(JSON.stringify(a.locations)).toBe(JSON.stringify(b.locations));
    const c = usherGame(2);
    expect(JSON.stringify(a.locations)).not.toBe(JSON.stringify(c.locations));
  });

  it('On Reveal effects NEVER fire (a heal revealer AND a damage revealer in play)', () => {
    const s = usherGame(seedDealingAny([['loc-001', 'loc-009'], ['loc-008', 'loc-037']]));
    const ids = (s.locations ?? []).map(l => s.cards[l.instanceId]?.cardId);
    expect(ids.some(id => id === 'loc-001' || id === 'loc-009')).toBe(true); // On Reveal: Gain Health
    expect(ids.some(id => id === 'loc-008' || id === 'loc-037')).toBe(true); // On Reveal: Lose Health
    for (const seat of s.seats) expect(seat.hp).toBe(seat.maxHp);
    expect(s.prompts).toEqual([]);
  });

  it('locationsMode still deals the full face-down deck (old path unchanged)', () => {
    const s = setup(
      {
        seed: 11,
        players: [
          { name: 'A', controller: 'human', characterCardId: 'ch-002' },
          { name: 'B', controller: 'human', characterCardId: 'ch-003' },
        ],
        locationsMode: true,
      },
      cardsForScenario('firstTimer', { customCards: LOC_IDS }),
      FIRST_TIMER_PILES,
      STANDARD_MANSION_DECK,
    );
    expect(s.locationDeck?.length).toBe(LOC_IDS.length);
    expect(s.locations ?? []).toEqual([]);
  });
});

describe('Fall of the House of Usher — effects live at setup', () => {
  it('GLOBAL scoring counts from turn 1 (Library: 3 per ammo set)', () => {
    // Other dealt locations can add or subtract score (loc-040 Firearms Room is
    // a penalty), so require a deal where loc-001 is the ONLY scorer.
    const withLibrary = CUSTOM_CARDS.filter(c => c.type === 'location' && (c.locationScoreEffects ?? []).length > 0).map(c => c.id);
    const s = hand(usherGame(seedDealingWhere(
      deal => deal.some(id => id === 'loc-001') && deal.filter(id => withLibrary.includes(id)).every(id => id === 'loc-001'),
      'loc-001',
    )), ['am-001', 'am-002', 'am-003']);
    expect(locationScore(s, 0)).toBe(3); // one 10/20/30 set
    expect(locationScore(s, 1)).toBe(0); // no ammo
  });

  it('GLOBAL ongoing applies to EVERY seat (Kitchen trash-on-2nd-gain)', () => {
    const s = usherGame(seedDealing('loc-004'));
    expect(hasTrashOnSecondGain(s, 0)).toBe(true);
    expect(hasTrashOnSecondGain(s, 1)).toBe(true);
  });

  it('a revealer-scoped On Reveal grant stays inactive (Large Library draw)', () => {
    const s = usherGame(seedDealing('loc-007'));
    const ids = (s.locations ?? []).map(l => s.cards[l.instanceId]?.cardId);
    expect(ids).toContain('loc-007');
    // "On Reveal: Draw two cards at the end of your turn" — no revealer in
    // this mode (revealedBy -1), so the grant never applies to anyone.
    expect(locationEndOfTurnDraws(s, 0)).toBe(0);
    expect(locationEndOfTurnDraws(s, 1)).toBe(0);
  });

  it('invest effects still need a gold cube (Tiger Statue Room)', () => {
    const s = usherGame(seedDealing('loc-015'), { turnGold: 100, buysLeft: 1 });
    expect(locationBuyCostReduction(s, 0)).toBe(0);
    const tiger = dealtInstanceId(s, 'loc-015');
    const out = applyAction(s, { type: 'investLocation', seat: 0, instanceId: tiger });
    expect(cubesOn(out, tiger, 0)).toBe(1);
    expect(out.seats[0]?.turnGold).toBe(30); // 100 - 70
    expect(out.seats[0]?.buysLeft).toBe(0);
    expect(locationBuyCostReduction(out, 0)).toBe(10);
    expect(locationBuyCostReduction(out, 1)).toBe(0); // not invested
  });

  it('1X uses still cost gold + a Buy (Attic Landing: +1 Buy, Ammo x20)', () => {
    const s = usherGame(seedDealing('loc-020'), { turnGold: 50, buysLeft: 1, turnAmmo: 0 });
    const attic = dealtInstanceId(s, 'loc-020');
    const out = applyAction(s, { type: 'useLocation', seat: 0, instanceId: attic });
    // 50 - 20 use cost + 20 Gold from the gained Ammo x20's own bonus = 50.
    expect(out.seats[0]?.turnGold).toBe(50);
    expect(out.seats[0]?.buysLeft).toBe(1); // -1 Buy for the use, +1 from the effect
    expect(out.seats[0]?.turnAmmo).toBe(20); // the gained Ammo x20's bonus
    expect(out.seats[0]?.discard.some(id => out.cards[id]?.cardId === 'am-002')).toBe(true);
    expect(out.seats[0]?.locationUsesThisTurn ?? []).toContain(attic);
  });

  it('Explores go straight to the Mansion — no location gate consumes them', () => {
    const base = usherGame(1, { turnAmmo: 50 });
    const s = hand(base, ['we-009', 'we-009']);
    const [w1, w2] = s.seats[0]!.hand;
    const cur = {
      ...s,
      mansionDeck: ['ma-001#m1', ...s.mansionDeck],
      cards: {
        ...s.cards,
        ['ma-001#m1']: { instanceId: 'ma-001#m1', cardId: 'ma-001', location: { zone: 'mansionDeck' as const, index: 0 } },
      },
    };
    const out = applyAction(cur, { type: 'explore', seat: 0, weapons: [w1!, w2!], exploreCount: 1 });
    // Two Handguns (10 + 10) defeat the 20-HP ma-001: it attaches, deck shrinks.
    expect(out.mansionDeck.length).toBe(cur.mansionDeck.length - 1);
    expect(out.seats[0]?.attached).toContain('ma-001#m1');
    expect(out.prompts.some(p => p.payload?.kind === 'locRevealAck')).toBe(false);
  });
});
