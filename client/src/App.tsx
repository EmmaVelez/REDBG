import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { ServerMessage, ClientMessage } from '@re/server';
import type { CardDef, GameState } from '@re/game-core';
import { seatAwaitingAction } from '@re/game-core';
import { useGameStore } from './store';
import { createGameSocket } from './net/ws';
import { ActionBar } from './ui/ActionBar';
import { SkillPanel } from './ui/SkillPanel';
import { Board } from './ui/Board';
import { GameLog } from './ui/GameLog';
import { Lobby } from './ui/Lobby';
import { MansionReveal } from './ui/MansionReveal';
import { SeatSwap } from './ui/SeatSwap';
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
  // explicit overrides always win: ?server=ws://host:port or VITE_WS_URL.
  const fromQuery = new URLSearchParams(window.location.search).get('server');
  if (fromQuery !== null && fromQuery !== '') return fromQuery;
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  if (import.meta.env.PROD) {
    // Production single-service (Render): the ws server also serves the
    // client build, so the WebSocket rides the page's own origin.
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}`;
  }
  // Dev: Vite (5173) and the game server (1724) are separate processes.
  return 'ws://localhost:1724';
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
  const hotseat = useGameStore(s => s.hotseat);
  const gameOver = useGameStore(s => s.gameOver);

  // Mansion-door reveal: remember the last seen state, detect when the OWN
  // seat's explore revealed an Infected, and hold the table on a readable
  // reveal until the player clicks Continue.
  const prevStateRef = useRef<GameState | null>(null);
  const [reveal, setReveal] = useState<{ def: CardDef; resultText: string; damage: number; weapons: readonly CardDef[] } | null>(null);
  const [youDied, setYouDied] = useState<boolean | null>(null);
  /** Log sidebar visibility — closed frees the whole sidebar width for the board. */
  const [logOpen, setLogOpen] = useState<boolean>(true);
  // Auto-dismiss the action-bar error toast so stale rejections don't linger.
  useEffect(() => {
    if (lastError === null) return;
    const t = setTimeout(() => useGameStore.setState({ lastError: null }), 5000);
    return () => clearTimeout(t);
  }, [lastError]);
  // The action dock is a FIXED overlay, so it is out of flow and the flex
  // column cannot reserve its height. Measure it and publish that as a CSS
  // variable; `.app` pads itself by exactly that much so the board's content
  // is never hidden underneath the bar. The effect keys on the ELEMENT, not a
  // mount flag: the dock only renders in the in-game branch (the lobby returns
  // early), so a [] effect would run once while the dock is still absent.
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (dockEl === null) return;
    const publish = (): void => {
      document.documentElement.style.setProperty('--dock-h', `${dockEl.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(dockEl);
    // Fallback for a dock whose contents change without a resize event, and
    // for environments where ResizeObserver delivery is tied to rendering
    // (a hidden tab never renders): re-measure after any DOM change inside
    // the bar. setTimeout lets layout settle first.
    const mutation = new MutationObserver(() => setTimeout(publish, 0));
    mutation.observe(dockEl, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', publish);
    };
  }, [dockEl]);
  // When the fatal explore ALSO revealed a card, the reveal plays first and
  // the death screen is queued until the player dismisses it — they should
  // see what emptied their health pool before "YOU DIED".
  const pendingDeathRef = useRef<'downed' | 'dead' | null>(null);
  const state = view?.state ?? null;
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (prev === null || state === null || prev.version === state.version) return;
    const downed = detectPlayerDowned(prev, state, mySeat);
    const detected = detectReveal(prev, state, mySeat);
    if (downed !== null && detected !== null) {
      // Both on the same step: show the reveal first, then YOU DIED.
      pendingDeathRef.current = downed;
    } else if (downed !== null) {
      setYouDied(downed === 'dead');
      pendingDeathRef.current = null;
      return;
    }
    if (detected === null) return;
    const def = defForInstance(state, detected.instanceId);
    if (def === null) return;
    const resultText =
      detected.outcomeZone === 'attached'
        ? `Defeated! ${def.name} is attached to your character (+${def.decorations ?? 0} ★).`
        : detected.outcomeZone === 'removed'
          ? `${def.name} was removed from the Mansion.`
          : detected.outcomeZone === 'mansion'
            ? `${def.name} was returned to the Mansion deck.`
            : `${def.name} escaped to the bottom of the Mansion.`;
    // Resolve the explore's weapon instances to defs for the reveal panel.
    const weaponDefs = detected.weapons
      .map(id => defForInstance(state, id))
      .filter((d): d is CardDef => d !== null);
    setReveal({ def, resultText, damage: detected.damage, weapons: weaponDefs });
  }, [state, mySeat]);

  const inLobby = room !== null && (room.phase === 'lobby' || view === null);
  const seatNames = room?.players.map(p => p.name) ?? hotseat?.names ?? [];

  const passPending = hotseat !== null && hotseat.passPending && gameOver === null;
  // Game over overlay: hotseat OR server room (before, a server-room game over
  // left everyone staring at 'Waiting for Bot N…' forever).
  const showGameOverOverlay = (hotseat !== null || room !== null) && gameOver !== null;

  if (view === null || (room === null && hotseat === null)) {
    prevStateRef.current = null; // reset across lobby/game switches
    pendingDeathRef.current = null;
    return (
      <Lobby
        room={room}
        clientId={clientId}
        status={status}
        onCreateRoom={(name, scenario, partnerMode, mainCharacterId, partnerCharacterId, skillSystem, customCards) => dispatchClient({ kind: 'createRoom', playerName: name, scenario, partnerMode, mainCharacterId, partnerCharacterId, skillSystem, customCards })}
        onJoinRoom={(code, name) => dispatchClient({ kind: 'joinRoom', roomCode: code, playerName: name })}
        onSelectSeat={seat => dispatchClient({ kind: 'selectSeat', seat })}
        onAddBot={seat => dispatchClient({ kind: 'addBot', seat })}
        onRemoveBot={seat => dispatchClient({ kind: 'removeBot', seat })}
        onSetScenario={scenario => dispatchClient({ kind: 'setScenario', scenario })}
        onSetPartnerMode={partnerMode => dispatchClient({ kind: 'setPartnerMode', partnerMode })}
        onSetSkillSystem={skillSystem => dispatchClient({ kind: 'setSkillSystem', skillSystem })}
        onSetCustomCards={customCards => dispatchClient({ kind: 'setCustomCards', customCards })}
        onSetCharacterSelection={(main?: string, partner?: string) => dispatchClient({ kind: 'setCharacterSelection', mainCharacterId: main, partnerCharacterId: partner })}
        onStart={() => dispatchClient({ kind: 'startGame' })}
        onStartHotseat={(names, scenario, skillSystem, customCards) => useGameStore.getState().startHotseat(names, Math.floor(Date.now() % 2 ** 31), scenario, { skillSystem, customCards })}
      />
    );
  }
  void inLobby;

  const gameState = view.state;
  // Pass-and-play hand-off follows the seat the game is waiting on — the draft's
  // pick/keep seat during the opening Skill Draft, the active seat afterwards.
  // Read it from the authoritative hotseat game (the view is frozen while the
  // device is being passed).
  const hotseatHolder = hotseat !== null ? seatAwaitingAction(hotseat.game) : -1;
  const disabled =
    gameState.phase !== 'main' ||
    gameState.activeSeat !== mySeat ||
    gameState.prompts.some(p => p.seat === mySeat) ||
    reveal !== null ||
    youDied !== null ||
    passPending;

  return (
    <div className="app app-board">
      <main className="app-main">
        <Board state={gameState} mySeat={mySeat} onAction={a => dispatchClient({ kind: 'sendAction', action: a })} disabled={disabled} />
        {logOpen && (
          <aside className="app-side">
            <GameLog state={gameState} chat={chat} lastError={lastError} seatNames={seatNames} onClose={() => setLogOpen(false)} />
          </aside>
        )}
      </main>
      <footer className="app-action-dock" ref={setDockEl}>
        <SkillPanel
          state={gameState}
          seat={mySeat}
          onAction={a => dispatchClient({ kind: 'sendAction', action: a })}
          disabled={disabled}
        />
        <ActionBar
          state={gameState}
          seat={mySeat}
          onAction={a => dispatchClient({ kind: 'sendAction', action: a })}
          disabled={disabled}
          lastError={lastError}
          onOpenLog={() => setLogOpen(o => !o)}
          logOpen={logOpen}
          status={status}
          roomCode={room?.roomCode ?? null}
        />
      </footer>
      {reveal !== null && (
        <MansionReveal
          def={reveal.def}
          resultText={reveal.resultText}
          damage={reveal.damage}
          weapons={reveal.weapons}
          onContinue={() => {
            setReveal(null);
            const queued = pendingDeathRef.current;
            pendingDeathRef.current = null;
            if (queued !== null) {
              setYouDied(queued === 'dead');
            }
          }}
        />
      )}
      {youDied !== null && (
        <YouDiedOverlay dead={youDied} onContinue={() => setYouDied(null)} />
      )}
      {passPending && hotseat !== null && (
        <SeatSwap
          mode="pass"
          nextName={hotseat.names[hotseatHolder] ?? `Player ${hotseatHolder + 1}`}
          onContinue={() => useGameStore.getState().continuePass()}
        />
      )}
      {showGameOverOverlay && (
        <SeatSwap
          mode="gameOver"
          winners={gameOver?.winners}
          playerNames={seatNames}
          onContinue={() =>
            hotseat !== null
              ? useGameStore.getState().quitHotseat()
              : useGameStore.getState().leaveToLobby()
          }
        />
      )}
    </div>
  );
}