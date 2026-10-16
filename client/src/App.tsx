import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { ServerMessage, ClientMessage } from '@re/server';
import type { CardDef, GameState } from '@re/game-core';
import { useGameStore } from './store';
import { createGameSocket } from './net/ws';
import { ActionBar } from './ui/ActionBar';
import { Board } from './ui/Board';
import { GameLog } from './ui/GameLog';
import { Lobby } from './ui/Lobby';
import { MansionReveal } from './ui/MansionReveal';
import { YouDiedOverlay } from './ui/YouDiedOverlay';
import { detectPlayerDowned, detectReveal } from './ui/anims';
import { defForInstance } from './ui/cards';

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

  // Mansion-door reveal: remember the last seen state, detect when the OWN
  // seat's explore revealed an Infected, and hold the table on a readable
  // reveal until the player clicks Continue.
  const prevStateRef = useRef<GameState | null>(null);
  const [reveal, setReveal] = useState<{ def: CardDef; resultText: string } | null>(null);
  const [youDied, setYouDied] = useState<boolean | null>(null);
  const state = view?.state ?? null;
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (prev === null || state === null || prev.version === state.version) return;
    // Downed/death wins over the mansion reveal (both on the same step).
    const downed = detectPlayerDowned(prev, state, mySeat);
    if (downed !== null) {
      setYouDied(downed === 'dead');
      return;
    }
    const detected = detectReveal(prev, state, mySeat);
    if (detected === null) return;
    const def = defForInstance(state, detected.instanceId);
    if (def === null) return;
    const resultText =
      detected.outcomeZone === 'attached'
        ? `Defeated! ${def.name} is attached to your character (+${def.decorations ?? 0} ★).`
        : detected.outcomeZone === 'removed'
          ? `${def.name} was removed from the Mansion.`
          : `${def.name} escaped to the bottom of the Mansion.`;
    setReveal({ def, resultText });
  }, [state, mySeat]);

  const inLobby = room !== null && (room.phase === 'lobby' || view === null);
  const seatNames = room?.players.map(p => p.name) ?? [];

  if (view === null || room === null) {
    prevStateRef.current = null; // reset across lobby/game switches
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

  const gameState = view.state;
  const disabled =
    gameState.phase !== 'main' ||
    gameState.activeSeat !== mySeat ||
    gameState.prompts.some(p => p.seat === mySeat) ||
    reveal !== null ||
    youDied !== null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>RE Deck Builder</h1>
        {room !== null && <span className="app-room">Room {room.roomCode}</span>}
        <span className={`app-status app-status-${status}`}>{status}</span>
      </header>
      <main className="app-main">
        <Board state={gameState} mySeat={mySeat} onAction={a => dispatchClient({ kind: 'sendAction', action: a })} disabled={disabled} />
        <aside className="app-side">
          <ActionBar
            state={gameState}
            seat={mySeat}
            onAction={a => dispatchClient({ kind: 'sendAction', action: a })}
            disabled={disabled}
          />
          <GameLog state={gameState} chat={chat} lastError={lastError} seatNames={seatNames} />
        </aside>
      </main>
      {reveal !== null && (
        <MansionReveal def={reveal.def} resultText={reveal.resultText} onContinue={() => setReveal(null)} />
      )}
      {youDied !== null && (
        <YouDiedOverlay dead={youDied} onContinue={() => setYouDied(null)} />
      )}
    </div>
  );
}