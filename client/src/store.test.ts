import { describe, it, expect, beforeEach } from 'vitest';
import type { ServerMessage } from '@re/server';
import { setup, startTurn, PREMIER_CARDS, FIRST_TIMER_PILES } from '@re/game-core';
import type { PlayerView } from '@re/game-core';
import { useGameStore } from './store';

/**
 * M4-T02: the zustand store reduces server messages into UI state.
 * Uses a real engine GameState (via game-core setup) for the stateSync case.
 */

function makeView(seed = 7): PlayerView {
  const state = startTurn(
    setup(
      { seed, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    ),
  );
  return { seat: 0, state };
}

const roomState = (): Extract<ServerMessage, { kind: 'roomState' }> => ({
  kind: 'roomState',
  room: {
    roomCode: 'ABCDEF',
    phase: 'lobby',
    maxSeats: 4,
    scenario: 'firstTimer',
    players: [
      { clientId: 'c1', name: 'Me', seat: 0, isBot: false, connected: true },
      { clientId: 'c2', name: 'Bot', seat: 1, isBot: true, connected: true },
    ],
    partnerMode: false,
  },
});

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
  });
});

describe('store (M4-T02)', () => {
  it('welcome stores the clientId', () => {
    const st = useGameStore.getState();
    st.handleServerMessage({ kind: 'welcome', clientId: 'client-9', reconnectToken: 'tok' });
    expect(useGameStore.getState().clientId).toBe('client-9');
    expect(useGameStore.getState().status).toBe('disconnected'); // untouched
  });

  it('roomState replaces the room and clears the error', () => {
    useGameStore.setState({ lastError: 'boom' });
    useGameStore.getState().handleServerMessage(roomState());
    const s = useGameStore.getState();
    expect(s.room?.roomCode).toBe('ABCDEF');
    expect(s.room?.players).toHaveLength(2);
    expect(s.lastError).toBeNull();
  });

  it('stateSync stores the view and my seat', () => {
    const view = makeView();
    useGameStore.getState().handleServerMessage({ kind: 'stateSync', view });
    const s = useGameStore.getState();
    expect(s.mySeat).toBe(0);
    expect(s.view).toBe(view);
    expect(s.view?.state.seats.length).toBe(2);
    expect(s.view?.state.seats[0]?.name).toBe('Me');
  });

  it('actionRejected sets lastError', () => {
    useGameStore.getState().handleServerMessage({ kind: 'actionRejected', reason: 'not your turn' });
    expect(useGameStore.getState().lastError).toBe('not your turn');
  });

  it('chat appends and caps at 100 entries', () => {
    const st = useGameStore.getState();
    for (let i = 0; i < 120; i++) {
      st.handleServerMessage({ kind: 'chat', seat: i % 2, text: `m${i}` });
    }
    const s = useGameStore.getState();
    expect(s.chat).toHaveLength(100);
    expect(s.chat[99]?.text).toBe('m119');
    expect(s.chat[0]?.text).toBe('m20');
  });

  it('gameOver stores winners and endReason, gameStarted clears it', () => {
    const st = useGameStore.getState();
    st.handleServerMessage({ kind: 'gameStarted' });
    expect(useGameStore.getState().gameOver).toBeNull();
    st.handleServerMessage({ kind: 'gameOver', winners: [0, 1], endReason: 'uroborosDefeated' });
    const s = useGameStore.getState();
    expect(s.gameOver?.winners).toEqual([0, 1]);
    expect(s.gameOver?.endReason).toBe('uroborosDefeated');
  });

  it('error sets lastError, ping/pong and player events are ignored', () => {
    const st = useGameStore.getState();
    st.handleServerMessage({ kind: 'error', message: 'room not found' });
    expect(useGameStore.getState().lastError).toBe('room not found');
    st.handleServerMessage({ kind: 'pong', ts: 1 });
    st.handleServerMessage({ kind: 'playerJoined', player: { clientId: 'x', name: 'X', seat: -1, isBot: false, connected: true } });
    st.handleServerMessage({ kind: 'hostChanged', seat: 1 });
    expect(useGameStore.getState().lastError).toBe('room not found'); // unchanged
  });

  it('leaveToLobby clears room/view/gameOver after a server-room game over', () => {
    const s = useGameStore.getState();
    // simulate an in-game server room that just ended
    s.handleServerMessage(roomState());
    s.handleServerMessage({ kind: 'gameStarted' } as ServerMessage);
    s.handleServerMessage({ kind: 'stateSync', view: makeView() } as ServerMessage);
    s.handleServerMessage({ kind: 'gameOver', winners: [0] } as ServerMessage);
    const mid = useGameStore.getState();
    expect(mid.room).not.toBeNull();
    expect(mid.gameOver).not.toBeNull();
    mid.leaveToLobby();
    const after = useGameStore.getState();
    expect(after.room).toBeNull();
    expect(after.view).toBeNull();
    expect(after.gameOver).toBeNull();
    expect(after.mySeat).toBe(-1);
  });
});

describe('store dispatch/bind (M4-T02)', () => {
  it('dispatch without a bound socket fails with lastError (unless silent)', () => {
    const st = useGameStore.getState();
    expect(st.dispatch({ kind: 'ping', ts: 1 })).toBe(false);
    expect(useGameStore.getState().lastError).toBe('not connected');
    expect(st.dispatch({ kind: 'ping', ts: 2 }, { silent: true })).toBe(false);
    expect(useGameStore.getState().lastError).toBe('not connected'); // unchanged
  });

  it('bindSocket wires dispatch through the socket', () => {
    const sent: Array<{ kind: string }> = [];
    const socket = {
      connect: () => {},
      send: (m: { kind: string }) => {
        sent.push(m);
        return true;
      },
    };
    const st = useGameStore.getState();
    st.bindSocket(socket as never);
    expect(st.dispatch({ kind: 'createRoom', playerName: 'Me', scenario: 'firstTimer', partnerMode: false })).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('createRoom');
  });

  it('dispatch reports a full send queue', () => {
    useGameStore.getState().bindSocket({
      connect: () => {},
      send: () => false,
    } as never);
    expect(useGameStore.getState().dispatch({ kind: 'ping', ts: 1 })).toBe(false);
    expect(useGameStore.getState().lastError).toBe('send queue full');
  });

  it('setStatus updates the status', () => {
    useGameStore.getState().setStatus('connected');
    expect(useGameStore.getState().status).toBe('connected');
  });
});