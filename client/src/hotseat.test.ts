import { describe, expect, it, beforeEach } from 'vitest';
import { enumerateLegalActions, setup, startTurn, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, CUSTOM_CARDS } from '@re/game-core';
import type { GameState } from '@re/game-core';
import { createHotseatGame, applyHotseatAction, hotseatView } from './hotseat';
import { useGameStore } from './store';

describe('createHotseatGame', () => {
  it('builds a game with one human seat per name', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 42);
    expect(s.seats.length).toBe(2);
    expect(s.seats[0]?.name).toBe('Chris');
    expect(s.seats[1]?.name).toBe('Jill');
    expect(s.seats.every(p => p.controller === 'human')).toBe(true);
    expect(s.phase).toBe('main');
  });

  it('supports 3 and 4 players', () => {
    expect(createHotseatGame(['A', 'B', 'C'], 1).seats.length).toBe(3);
    expect(createHotseatGame(['A', 'B', 'C', 'D'], 1).seats.length).toBe(4);
  });

  it('usherMode deals 3 face-up Locations and no location deck', () => {
    const s = createHotseatGame(['A', 'B'], 1, 'firstTimer', { usherMode: true });
    expect(s.locations?.length).toBe(3);
    expect(s.locationDeck).toBeUndefined();
    const plain = createHotseatGame(['A', 'B'], 1);
    expect(plain.locations ?? []).toEqual([]);
    expect(plain.locationDeck).toBeUndefined();
  });

  it('clockMode hides ceil(mansion/15) Locations in the Mansion deck', () => {
    const s = createHotseatGame(['A', 'B'], 1, 'firstTimer', { clockMode: true });
    const locIds = s.mansionDeck.filter(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.type === 'location');
    const base = s.mansionDeck.length - locIds.length;
    expect(locIds.length).toBe(Math.ceil(base / 15));
    expect(s.locations ?? []).toEqual([]);
    expect(s.locationDeck).toBeUndefined();
  });

  it('ceMode hides floor(mansion/10) CE-001..CE-012 events in the Mansion deck', () => {
    const s = createHotseatGame(['A', 'B'], 1, 'firstTimer', { ceMode: true });
    const ceIds = s.mansionDeck.filter(id => (s.cards[id]?.cardId ?? '').startsWith('ce-'));
    const base = s.mansionDeck.length - ceIds.length;
    expect(ceIds.length).toBe(Math.floor(base / 10));
    const isCe = new Set(ceIds);
    s.mansionDeck.forEach((id, i) => {
      if (i > 0) expect(isCe.has(id) && isCe.has(s.mansionDeck[i - 1]!)).toBe(false);
    });
  });

  it('rejects fewer than 2 or more than 4 players', () => {
    expect(() => createHotseatGame(['Solo'], 1)).toThrow();
    expect(() => createHotseatGame(['A', 'B', 'C', 'D', 'E'], 1)).toThrow();
  });

  it('builds classicHorror piles when requested', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 42, 'classicHorror');
    const pileIds = Object.keys(s.marketPiles);
    expect(pileIds).toContain('itemmgmt');
    expect(pileIds).toContain('spray');
    expect(pileIds).toContain('longbow');
    expect(pileIds).not.toContain('merc');
    expect(pileIds).not.toContain('six');
  });

  it('swaps the basic piles for the Mercenaries printings when requested', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 42, 'firstTimer', { mercenariesBasicResources: true });
    const cardIdOf = (id: string): string | undefined => s.cards[id]?.cardId;
    const allIn = (pileId: string): string[] =>
      (s.marketPiles[pileId]?.cards ?? []).map(id => cardIdOf(id) ?? '?');
    expect(allIn('am10').every(id => id === 'am-005')).toBe(true);
    expect(allIn('hg').every(id => id === 'we-049')).toBe(true);
    expect(allIn('kn').every(id => id === 'we-050')).toBe(true);
    // non-basic piles keep their own cards
    expect(allIn('merc').every(id => id === 'ac-006')).toBe(true);
    // and the swapped defs are registered, so buying one resolves
    expect(s.cardDefs['we-049']?.name).toBe('Custom Standard Sidearm');
    // the opening deck uses the Mercenaries printings too
    for (const seat of s.seats) {
      const deck = [...seat.hand, ...seat.inventory].map(id => cardIdOf(id));
      expect(deck.filter(id => id === 'am-005')).toHaveLength(7);
      expect(deck.filter(id => id === 'we-049')).toHaveLength(1);
      expect(deck.filter(id => id === 'we-050')).toHaveLength(2);
      expect(deck).toHaveLength(10);
    }
  });

  it('builds whaddyaBuyin piles when requested', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 42, 'whaddyaBuyin');
    const pileIds = Object.keys(s.marketPiles);
    expect(pileIds).toContain('merc');
    expect(pileIds).toContain('rf');
    expect(pileIds).toContain('sub');
    expect(pileIds).not.toContain('spray');
    expect(pileIds).not.toContain('longbow');
  });

  it('builds battleHardenedVeteran piles when requested', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 42, 'battleHardenedVeteran');
    const pileIds = Object.keys(s.marketPiles);
    expect(pileIds).toContain('merc');
    expect(pileIds).toContain('longbow');
    expect(pileIds).toContain('rf');
    expect(pileIds).toContain('six');
    expect(pileIds).not.toContain('grn');
    expect(pileIds).not.toContain('spray');
  });

  it('adds selected custom cards to the Mansion when requested', () => {
    const without = createHotseatGame(['Chris', 'Jill'], 42);
    const noX = [...without.mansionDeck].filter(id => without.cards[id]?.cardId === 'mx-001');
    expect(noX).toHaveLength(0);

    const withX = createHotseatGame(['Chris', 'Jill'], 42, 'firstTimer', { customCards: ['mx-001'] });
    const copies = [...withX.mansionDeck].filter(id => withX.cards[id]?.cardId === 'mx-001');
    expect(copies).toHaveLength(2);
  });

  it('deals each player a character and a real opening hand', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 42);
    for (const p of s.seats) {
      expect(p.characterInstanceId).not.toBe('');
      expect(p.hand.length).toBeGreaterThan(0);
    }
  });
});

describe('applyHotseatAction', () => {
  it('rejects illegal actions with the engine reason', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 1);
    const other = s.seats.find(p => p.seat !== s.activeSeat);
    const r = applyHotseatAction(s, { type: 'endTurn', seat: other?.seat ?? 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });

  it('accepts every legal first action and returns the new state', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 1);
    const legal = enumerateLegalActions(s, s.activeSeat);
    expect(legal.length).toBeGreaterThan(0);
    const endTurn = legal.find(a => a.type === 'endTurn');
    expect(endTurn).toBeDefined();
    const r = applyHotseatAction(s, endTurn as { type: 'endTurn'; seat: number });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).not.toBe(s);
  });

  it('advances the active seat after endTurn (startTurn applied)', () => {
    const s = createHotseatGame(['Chris', 'Jill'], 1);
    const r = applyHotseatAction(s, { type: 'endTurn', seat: s.activeSeat });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.activeSeat).not.toBe(s.activeSeat);
      // active seat's per-turn pools were reset by startTurn
      const next = r.state.seats[r.state.activeSeat];
      expect(next?.actionsLeft).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('hotseatView', () => {
  it('shows only the device holder hand, hiding every other seat', () => {
    const s = createHotseatGame(['Chris', 'Jill', 'Ada'], 7);
    const v = hotseatView(s, 1);
    expect(v.seat).toBe(1);
    expect(v.state.seats[1]?.hand).toEqual(s.seats[1]?.hand);
    for (const p of v.state.seats) {
      if (p.seat !== 1) {
        expect(p.hand.every(id => id.startsWith('hidden-'))).toBe(true);
        expect(p.hand).toHaveLength(s.seats[p.seat]?.hand.length ?? 0);
      }
    }
    // public board stays intact
    expect(v.state.marketPiles).toEqual(s.marketPiles);
    expect(v.state.mansionDeck).toEqual(s.mansionDeck);
  });
});

describe('store hot-seat wiring', () => {
  beforeEach(() => {
    useGameStore.setState({
      status: 'disconnected',
      clientId: null,
      room: null,
      view: null,
      chat: [],
      lastError: null,
      gameOver: null,
      mySeat: -1,
      hotseat: null,
    });
  });

  it('startHotseat begins with the zero seat viewing and no pass pending', () => {
    useGameStore.getState().startHotseat(['Chris', 'Jill'], 5);
    const st = useGameStore.getState();
    expect(st.hotseat).not.toBeNull();
    expect(st.mySeat).toBe(st.hotseat?.game.activeSeat ?? -1);
    expect(st.hotseat?.passPending).toBe(false);
    expect(st.view?.state.seats[st.mySeat]?.hand).toEqual(st.hotseat?.game.seats[st.mySeat]?.hand);
  });

  it('endTurn sets passPending and hides the next players hand until continuePass', () => {
    useGameStore.getState().startHotseat(['Chris', 'Jill'], 5);
    const firstSeat = useGameStore.getState().mySeat;
    useGameStore.getState().hotseatAction({ type: 'endTurn', seat: firstSeat });
    const afterEnd = useGameStore.getState();
    expect(afterEnd.hotseat?.passPending).toBe(true);
    // the old holder's view persists until the pass screen is dismissed —
    // critically, the NEW holder's hand is NOT visible to the old holder.
    if (afterEnd.view !== null) {
      const oldHolder = firstSeat;
      const nextSeat = afterEnd.hotseat?.game.activeSeat ?? -1;
      expect(nextSeat).not.toBe(oldHolder);
      expect(afterEnd.view.state.seats[oldHolder]?.hand.every(id => !id.startsWith('hidden-'))).toBe(true);
      expect(afterEnd.view.state.seats[nextSeat]?.hand.every(id => id.startsWith('hidden-'))).toBe(true);
    }
    useGameStore.getState().continuePass();
    const afterPass = useGameStore.getState();
    expect(afterPass.hotseat?.passPending).toBe(false);
    expect(afterPass.mySeat).toBe(afterPass.hotseat?.game.activeSeat);
    // The new holder now sees their own hand revealed.
    expect(
      afterPass.view?.state.seats[afterPass.mySeat]?.hand.every(id => !id.startsWith('hidden-'))
    ).toBe(true);
  });

  it('dispatch routes sendAction to the local engine while hot-seating', () => {
    useGameStore.getState().startHotseat(['Chris', 'Jill'], 5);
    const seat = useGameStore.getState().mySeat;
    const ok = useGameStore.getState().dispatch({ kind: 'sendAction', action: { type: 'endTurn', seat } });
    expect(ok).toBe(true);
    expect(useGameStore.getState().hotseat?.passPending).toBe(true);
  });

  it('holds the turn open for the end-of-turn phase and starts it after the choice', () => {
    let s = startTurn(
      setup(
        { seed: 11, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }], locationsMode: true },
        [...PREMIER_CARDS, ...CUSTOM_CARDS],
        FIRST_TIMER_PILES,
        STANDARD_MANSION_DECK,
      ),
    );
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 && p !== undefined ? { ...p, turnGold: 100, buysLeft: 2 } : p)) };
    const id = 'loc-018#hs';
    s = { ...s, cards: { ...s.cards, [id]: { instanceId: id, cardId: 'loc-018', location: { zone: 'supply', index: 0 } } }, locationDeck: [id], locations: [] };
    const explored = applyHotseatAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect(explored.ok).toBe(true);
    if (!explored.ok) return;
    s = explored.state;
    for (let i = 0; i < 10 && s.prompts.length > 0; i += 1) {
      const p = s.prompts[0];
      if (p === undefined) break;
      const r = applyHotseatAction(s, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
      if (!r.ok) break;
      s = r.state;
    }
    const inst = (s.locations ?? [])[0]?.instanceId;
    if (inst === undefined) throw new Error('location not revealed');
    const used = applyHotseatAction(s, { type: 'useLocation', seat: 0, instanceId: inst });
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    s = used.state;

    const ended = applyHotseatAction(s, { type: 'endTurn', seat: 0 });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.state.pendingEndPhaseSeat).toBe(0);
    expect(ended.state.prompts.some(p => p.payload?.kind === 'postTurnTrashChoice')).toBe(true);

    const done = applyHotseatAction(ended.state, { type: 'postTurnTrashChoose', seat: 0, instanceId: 'Done' });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.state.pendingEndPhaseSeat).toBeUndefined();
    expect(done.state.activeSeat).toBe(1);
  });
});
