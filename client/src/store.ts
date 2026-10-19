import { create } from 'zustand';
import type { ServerMessage, RoomSnapshot, ClientMessage } from '@re/server';
import type { PlayerView, GameState, Action, ScenarioId } from '@re/game-core';
import type { ConnectionStatus, GameSocket } from './net/ws';
import { createHotseatGame, applyHotseatAction, hotseatView } from './hotseat';
import type { HotseatResult } from './hotseat';

/**
 * M4-T02: client store fed by server state.
 *
 * A single zustand store is the source of truth for the UI. The network
 * layer (net/ws.ts) decodes ServerMessages and funnels them through
 * `handleServerMessage`; component actions call `dispatch` which routes
 * through the injected socket. Everything here is derived state — the
 * server is authoritative.
 */

export interface ChatEntry {
  readonly seat: number;
  readonly text: string;
}

/** Pass-and-play hot-seat session (M4-T10): the engine runs in the browser. */
export interface HotseatSession {
  readonly names: readonly string[];
  readonly seed: number;
  readonly scenario: ScenarioId;
  /** The full authoritative engine state (never sanitized). */
  readonly game: GameState;
  /** Which seat currently holds the device and may see their own cards. */
  readonly viewerSeat: number;
  /** True when the turn moved off the viewer and the device must be passed. */
  readonly passPending: boolean;
}

interface GameStoreState {
  readonly status: ConnectionStatus;
  readonly clientId: string | null;
  readonly room: RoomSnapshot | null;
  readonly view: PlayerView | null;
  readonly chat: readonly ChatEntry[];
  readonly lastError: string | null;
  readonly gameOver: { readonly winners: readonly number[]; readonly endReason?: string } | null;
  readonly mySeat: number;
  readonly hotseat: HotseatSession | null;
}

export interface GameStore extends GameStoreState {
  readonly setStatus: (s: ConnectionStatus) => void;
  readonly handleServerMessage: (msg: ServerMessage) => void;
  readonly dispatch: (msg: ClientMessage, opts?: { readonly silent?: boolean }) => boolean;
  readonly bindSocket: (socket: GameSocket) => void;
  readonly startHotseat: (names: readonly string[], seed: number, scenario?: ScenarioId) => void;
  readonly hotseatAction: (action: Action) => void;
  /** The new holder taps the pass screen: reveal their hand, unpause. */
  readonly continuePass: () => void;
  readonly quitHotseat: () => void;
  /** Server room: leave to the lobby after game over (clears room/view/gameOver). */
  readonly leaveToLobby: () => void;
}

const initial = (): GameStoreState => ({
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

/** Injected by bindSocket; lives outside store state because it's not UI data. */
let socketForDispatch: GameSocket | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  ...initial(),
  setStatus: s => set({ status: s }),
  handleServerMessage: msg => {
    const s = get();
    switch (msg.kind) {
      case 'welcome':
        set({ clientId: msg.clientId });
        return;
      case 'roomState':
        set({ room: msg.room, lastError: null });
        return;
      case 'stateSync':
        set({ view: msg.view, mySeat: msg.view.seat });
        return;
      case 'gameStarted':
        set({ gameOver: null });
        return;
      case 'actionRejected':
        set({ lastError: msg.reason });
        return;
      case 'chat':
        set({ chat: [...s.chat.slice(-99), { seat: msg.seat, text: msg.text }] });
        return;
      case 'gameOver':
        set({ gameOver: { winners: msg.winners, endReason: msg.endReason } });
        return;
      case 'error':
        set({ lastError: msg.message });
        return;
      default:
        return;
    }
  },
  dispatch: (msg, opts) => {
    const s = get();
    // Hot-seat mode: the engine runs in-browser; game actions apply locally
    // and never touch the socket. Other message kinds are not meaningful here.
    if (s.hotseat !== null) {
      if (msg.kind === 'sendAction') {
        s.hotseatAction(msg.action);
        return true;
      }
      set({ lastError: 'offline pass-and-play game — no network actions' });
      return false;
    }
    const socket = socketForDispatch;
    if (socket === null) {
      if (opts?.silent !== true) set({ lastError: 'not connected' });
      return false;
    }
    const sent = socket.send(msg);
    if (!sent) set({ lastError: 'send queue full' });
    return sent;
  },
  bindSocket: socket => {
    socketForDispatch = socket;
    socket.connect();
  },
  startHotseat: (names, seed, scenario = 'firstTimer') => {
    const game = createHotseatGame(names, seed, scenario);
    const viewerSeat = game.activeSeat;
    set({
      hotseat: { names, seed, scenario, game, viewerSeat, passPending: false },
      view: hotseatView(game, viewerSeat),
      mySeat: viewerSeat,
      gameOver: null,
      room: null,
      lastError: null,
    });
  },
  hotseatAction: action => {
    const s = get();
    const hs = s.hotseat;
    if (hs === null) {
      set({ lastError: 'no hot-seat game running' });
      return;
    }
    if (s.gameOver !== null) {
      set({ lastError: 'game over' });
      return;
    }
    const result: HotseatResult = applyHotseatAction(hs.game, action);
    if (!result.ok) {
      set({ lastError: result.reason ?? 'action rejected' });
      return;
    }
    const game = result.state;
    // After endTurn the active seat advanced: the device must be passed
    // before the next player may reveal their hand. Everything else (plays,
    // buys, explores) keeps the same viewer.
    const passPending = game.activeSeat !== hs.viewerSeat && !result.gameOver;
    set({
      hotseat: { ...hs, game, passPending },
      view: passPending ? s.view : hotseatView(game, hs.viewerSeat),
      lastError: null,
      gameOver: result.gameOver ? { winners: result.winners } : null,
    });
  },
  continuePass: () => {
    const s = get();
    const hs = s.hotseat;
    if (hs === null) return;
    const viewerSeat = hs.game.activeSeat;
    set({
      hotseat: { ...hs, viewerSeat, passPending: false },
      view: hotseatView(hs.game, viewerSeat),
      mySeat: viewerSeat,
    });
  },
  quitHotseat: () => {
    set({ hotseat: null, view: null, mySeat: -1, gameOver: null, lastError: null });
  },
  leaveToLobby: () => {
    get().dispatch({ kind: 'leaveRoom' }, { silent: true });
    set({ room: null, view: null, mySeat: -1, gameOver: null, lastError: null, chat: [] });
  },
}));