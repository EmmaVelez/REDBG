import type { JSX } from 'react';
import type { ServerMessage, ClientMessage } from '@re/server';
import { useGameStore } from './store';
import { createGameSocket } from './net/ws';
import { ActionBar } from './ui/ActionBar';
import { Board } from './ui/Board';
import { GameLog } from './ui/GameLog';
import { Lobby } from './ui/Lobby';

/**
 * M4 wiring: single socket for the app, store as the single source of truth,
 * and a view switch: no room -> Lobby; room lobby -> Lobby (seated); game
 * running -> Board + ActionBar + GameLog.
 *
 * The socket is created ONCE (module scope) and bound to the store; React
 * components only ever talk to the store.
 */

const DEFAULT_URL = (): string => {
  // same-host dev: the Vite dev server proxies nothing, so default to the
  // server's port; override with ?server=ws://host:port or VITE_WS_URL.
  const fromQuery = new URLSearchParams(window.location.search).get('server');
  if (fromQuery !== null && fromQuery !== '') return fromQuery;
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  return fromEnv ?? 'ws://localhost:1724';
};

let socketBound = false;

function bindSocketOnce(): void {
  if (socketBound) return;
  socketBound = true;
  const store = useGameStore;
  const socket = createGameSocket({
    url: DEFAULT_URL(),
    tokenKey: 're-deck-builder:reconnectToken',
    onMessage: (msg: ServerMessage) => {
      store.getState().handleServerMessage(msg);
    },
    onStatusChange: (s) => {
      store.getState().setStatus(s);
    },
  });
  store.getState().bindSocket(socket);
}

/** Thin helper components delegate to the store (no prop drilling). */
function dispatchClient(msg: ClientMessage): void {
  useGameStore.getState().dispatch(msg);
}

export function App(): JSX.Element {
  bindSocketOnce();
  const status = useGameStore(s => s.status);
  const room = useGameStore(s => s.room);
  const view = useGameStore(s => s.view);
  const chat = useGameStore(s => s.chat);
  const lastError = useGameStore(s => s.lastError);
  const mySeat = useGameStore(s => s.mySeat);
  const clientId = useGameStore(s => s.clientId);

  const inLobby = room !== null && (room.phase === 'lobby' || view === null);
  const seatNames = room?.players.map(p => p.name) ?? [];

  if (view === null || room === null) {
    return (
      <Lobby
        room={room}
        clientId={clientId}
        status={status}
        onCreateRoom={name => dispatchClient({ kind: 'createRoom', playerName: name })}
        onJoinRoom={(code, name) => dispatchClient({ kind: 'joinRoom', roomCode: code, playerName: name })}
        onSelectSeat={seat => dispatchClient({ kind: 'selectSeat', seat })}
        onAddBot={seat => dispatchClient({ kind: 'addBot', seat })}
        onRemoveBot={seat => dispatchClient({ kind: 'removeBot', seat })}
        onStart={() => dispatchClient({ kind: 'startGame' })}
      />
    );
  }
  void inLobby;

  const state = view.state;
  const disabled = state.phase !== 'main' || state.activeSeat !== mySeat || state.prompts.some(p => p.seat === mySeat);

  return (
    <div className="app">
      <header className="app-header">
        <h1>RE Deck Builder</h1>
        {room !== null && <span className="app-room">Room {room.roomCode}</span>}
        <span className={`app-status app-status-${status}`}>{status}</span>
      </header>
      <main className="app-main">
        <Board state={state} mySeat={mySeat} onAction={a => dispatchClient({ kind: 'sendAction', action: a })} disabled={disabled} />
        <aside className="app-side">
          <ActionBar
            state={state}
            seat={mySeat}
            onAction={a => dispatchClient({ kind: 'sendAction', action: a })}
            disabled={disabled}
          />
          <GameLog state={state} chat={chat} lastError={lastError} seatNames={seatNames} />
        </aside>
      </main>
    </div>
  );
}