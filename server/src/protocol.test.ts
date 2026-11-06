import { describe, it, expect } from 'vitest';
import { encodeMessage, decodeMessage, validateMessage } from './protocol';
import type { WireMessage } from './protocol';

describe('protocol round trips', () => {
  const cases: ReadonlyArray<{ readonly name: string; readonly msg: WireMessage }> = [
    { name: 'createRoom', msg: { kind: 'createRoom', playerName: 'Manny', scenario: 'firstTimer', partnerMode: false } },
    { name: 'createRoom classicHorror', msg: { kind: 'createRoom', playerName: 'Manny', scenario: 'classicHorror', partnerMode: false } },
    { name: 'createRoom spyGames', msg: { kind: 'createRoom', playerName: 'Manny', scenario: 'spyGames', partnerMode: false } },
    { name: 'createRoom whaddyaBuyin', msg: { kind: 'createRoom', playerName: 'Manny', scenario: 'whaddyaBuyin', partnerMode: false } },
    { name: 'createRoom battleHardenedVeteran', msg: { kind: 'createRoom', playerName: 'Manny', scenario: 'battleHardenedVeteran', partnerMode: false } },
    { name: 'createRoom alliance', msg: { kind: 'createRoom', playerName: 'Manny', scenario: 'alliance', partnerMode: false } },
    { name: 'setScenario', msg: { kind: 'setScenario', scenario: 'classicHorror' } },
    { name: 'setScenario whaddyaBuyin', msg: { kind: 'setScenario', scenario: 'whaddyaBuyin' } },
    { name: 'setScenario battleHardenedVeteran', msg: { kind: 'setScenario', scenario: 'battleHardenedVeteran' } },
    { name: 'setScenario alliance', msg: { kind: 'setScenario', scenario: 'alliance' } },
    { name: 'setPartnerMode', msg: { kind: 'setPartnerMode', partnerMode: true } },
    { name: 'joinRoom', msg: { kind: 'joinRoom', roomCode: 'ABCDEF', playerName: 'Ada' } },
    { name: 'reconnect', msg: { kind: 'reconnect', token: 'tok-123' } },
    { name: 'spectate', msg: { kind: 'spectate', roomCode: 'ABCDEF' } },
    { name: 'leaveRoom', msg: { kind: 'leaveRoom' } },
    { name: 'selectSeat', msg: { kind: 'selectSeat', seat: 2 } },
    { name: 'addBot', msg: { kind: 'addBot' } },
    { name: 'addBot with seat', msg: { kind: 'addBot', seat: 3 } },
    { name: 'removeBot', msg: { kind: 'removeBot', seat: 3 } },
    { name: 'startGame', msg: { kind: 'startGame' } },
    { name: 'sendAction', msg: { kind: 'sendAction', action: { type: 'endTurn', seat: 0 } } },
    { name: 'sendChat', msg: { kind: 'sendChat', text: 'gg' } },
    { name: 'ping', msg: { kind: 'ping', ts: 1234 } },
    { name: 'welcome', msg: { kind: 'welcome', clientId: 'c1', reconnectToken: 'tok' } },
    {
      name: 'roomState',
      msg: { kind: 'roomState', room: { roomCode: 'ABCDEF', phase: 'lobby', maxSeats: 4, scenario: 'firstTimer', players: [{ clientId: 'c1', name: 'Manny', seat: 0, isBot: false, connected: true }], partnerMode: false, skillSystem: false } },
    },
    {
      name: 'stateSync',
      msg: { kind: 'stateSync', view: { seat: 0, state: { version: 1, seed: 1, rngState: 1, phase: 'main', activeSeat: 0, turnNumber: 1 } } as never },
    },
    { name: 'gameStarted', msg: { kind: 'gameStarted' } },
    { name: 'actionRejected', msg: { kind: 'actionRejected', reason: 'not your turn' } },
    {
      name: 'playerJoined',
      msg: { kind: 'playerJoined', player: { clientId: 'c2', name: 'Barry', seat: 1, isBot: false, connected: true } },
    },
    { name: 'playerLeft', msg: { kind: 'playerLeft', seat: 1 } },
    { name: 'seatChanged', msg: { kind: 'seatChanged', clientId: 'c1', seat: 2 } },
    { name: 'hostChanged', msg: { kind: 'hostChanged', seat: 0 } },
    { name: 'chat', msg: { kind: 'chat', seat: 0, text: 'hello' } },
    { name: 'gameOver', msg: { kind: 'gameOver', winners: [0], endReason: 'Uroboros' } },
    { name: 'error', msg: { kind: 'error', message: 'bad thing' } },
    { name: 'pong', msg: { kind: 'pong', ts: 1234 } },
  ];

  for (const c of cases) {
    it(`round-trips ${c.name}`, () => {
      const encoded = encodeMessage(c.msg);
      expect(typeof encoded).toBe('string');
      const decoded = decodeMessage(encoded);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.msg).toEqual(c.msg);
      }
    });
  }
});

describe('protocol validation', () => {
  it('rejects invalid JSON', () => {
    const r = decodeMessage('{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid JSON');
  });

  it('rejects non-object payloads', () => {
    expect(validateMessage('hi').ok).toBe(false);
    expect(validateMessage(42).ok).toBe(false);
    expect(validateMessage(null).ok).toBe(false);
  });

  it('rejects missing kind', () => {
    const r = validateMessage({ playerName: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('kind');
  });

  it('rejects unknown kinds', () => {
    const r = validateMessage({ kind: 'nukeRoom' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown message kind: nukeRoom');
  });

  it('rejects joinRoom without strings', () => {
    expect(validateMessage({ kind: 'joinRoom', roomCode: 5, playerName: 'x' }).ok).toBe(false);
    expect(validateMessage({ kind: 'joinRoom' }).ok).toBe(false);
    expect(validateMessage({ kind: 'joinRoom', roomCode: 'ABCDEF', playerName: 'x' }).ok).toBe(true);
  });

  it('rejects selectSeat with a bad seat', () => {
    expect(validateMessage({ kind: 'selectSeat', seat: -1 }).ok).toBe(false);
    expect(validateMessage({ kind: 'selectSeat', seat: 1.5 }).ok).toBe(false);
    expect(validateMessage({ kind: 'selectSeat', seat: 1 }).ok).toBe(true);
  });

  it('rejects ping without ts', () => {
    expect(validateMessage({ kind: 'ping' }).ok).toBe(false);
    expect(validateMessage({ kind: 'ping', ts: 'now' }).ok).toBe(false);
  });

  it('rejects spectate without roomCode', () => {
    expect(validateMessage({ kind: 'spectate' }).ok).toBe(false);
    expect(validateMessage({ kind: 'spectate', roomCode: 7 }).ok).toBe(false);
    expect(validateMessage({ kind: 'spectate', roomCode: 'ABCDEF' }).ok).toBe(true);
  });

  it('rejects sendAction without an action object', () => {
    expect(validateMessage({ kind: 'sendAction' }).ok).toBe(false);
    expect(validateMessage({ kind: 'sendAction', action: 'endTurn' }).ok).toBe(false);
    expect(validateMessage({ kind: 'sendAction', action: { type: 'endTurn', seat: 0 } }).ok).toBe(true);
  });

  it('rejects chat without seat and text', () => {
    expect(validateMessage({ kind: 'chat', seat: 0 }).ok).toBe(false);
    expect(validateMessage({ kind: 'chat', text: 'x' }).ok).toBe(false);
  });

  it('rejects gameOver without a winners array', () => {
    expect(validateMessage({ kind: 'gameOver' }).ok).toBe(false);
    expect(validateMessage({ kind: 'gameOver', winners: 'someone' }).ok).toBe(false);
    expect(validateMessage({ kind: 'gameOver', winners: [1] }).ok).toBe(true);
  });

  it('keeps extra fields when structurally valid (forward-compatible)', () => {
    const r = validateMessage({ kind: 'createRoom', playerName: 'M', scenario: 'firstTimer', partnerMode: false, futureField: 7 });
    expect(r.ok).toBe(true);
  });
});