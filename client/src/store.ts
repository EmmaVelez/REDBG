import { create } from 'zustand';
import type { ServerMessage, RoomSnapshot, ClientMessage } from '@re/server';
import type { PlayerView } from '@re/game-core';
import type { ConnectionStatus, GameSocket } from './net/ws';

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

interface GameStoreState {
  readonly status: ConnectionStatus;
  readonly clientId: string | null;
  readonly room: RoomSnapshot | null;
  readonly view: PlayerView | null;
  readonly chat: readonly ChatEntry[];
  readonly lastError: string | null;
  readonly gameOver: { readonly winners: readonly number[]; readonly endReason?: string } | null;
  readonly mySeat: number;
}

export interface GameStore extends GameStoreState {
  readonly setStatus: (s: ConnectionStatus) => void;
  readonly handleServerMessage: (msg: ServerMessage) => void;
  readonly dispatch: (msg: ClientMessage, opts?: { readonly silent?: boolean }) => boolean;
  readonly bindSocket: (socket: GameSocket) => void;
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
}));