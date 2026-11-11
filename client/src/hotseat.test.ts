import { describe, expect, it, beforeEach } from 'vitest';
import { enumerateLegalActions } from '@re/game-core';
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
});