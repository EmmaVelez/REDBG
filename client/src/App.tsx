import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { ServerMessage, ClientMessage } from '@re/server';
import type { CardDef, GameState, TargetReason } from '@re/game-core';
import { seatAwaitingAction } from '@re/game-core';
import { useGameStore } from './store';
import { createGameSocket } from './net/ws';
import { ActionBar } from './ui/ActionBar';
import { Board } from './ui/Board';
import { GameLog } from './ui/GameLog';
import { Lobby } from './ui/Lobby';
import { MansionReveal } from './ui/MansionReveal';
import { SeatSwap } from './ui/SeatSwap';
import { YouDiedOverlay } from './ui/YouDiedOverlay';
import { detectCardReveals, detectPlayerDowned, detectFreshExplores, revealsForExplore } from './ui/anims';
import type { CardRevealBatch } from './ui/anims';
import { CardRevealOverlay } from './ui/CardRevealOverlay';
import { shouldShowGameOverOverlay } from './ui/overlayOrder';
import { rankStandings } from './ui/standings';
import { defForInstance } from './ui/cards';
import { TargetedNotice } from './ui/TargetedNotice';
import type { RevealPartyMember } from './ui/MansionReveal';

/** One step of the mansion-door reveal: a revealed card plus its outcome. */
interface RevealEntry {
  readonly def: CardDef;
  readonly resultText: string;
  readonly damage: number;
  /** Effective Health of the revealed Infected, when it is not the printed
   *  value (CI-011 Queen Leech's Health equals the leader's Max Health). */
  readonly hp?: number;
  readonly weapons: readonly CardDef[];
  readonly explorerSeat: number;
  readonly explorerName: string;
  readonly party: readonly RevealPartyMember[];
}

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
  // A multi-explore reveals several cards at once; the queue holds them all and
  // the panel steps through one at a time (the index is the current card).
  const [revealQueue, setRevealQueue] = useState<RevealEntry[] | null>(null);
  const [revealIndex, setRevealIndex] = useState(0);
  // Non-explore ability/effect reveal (Ada's peek, the PDA, Master of
  // Unlocking, …): a separate, lighter overlay than the mansion-door reveal.
  const [cardReveal, setCardReveal] = useState<CardRevealBatch | null>(null);
  const [youDied, setYouDied] = useState<boolean | null>(null);
  /** Log sidebar visibility — closed frees the whole sidebar width for the board.
   *  On a narrow screen the log is an off-canvas slide-over, so it starts CLOSED
   *  there; on a wide screen it is a permanent sidebar and starts open. */
  const [logOpen, setLogOpen] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 821px)').matches,
  );
  // Auto-dismiss the action-bar error toast so stale rejections don't linger.
  useEffect(() => {
    if (lastError === null) return;
    const t = setTimeout(() => useGameStore.setState({ lastError: null }), 5000);
    return () => clearTimeout(t);
  }, [lastError]);
  // The log is a permanent sidebar on a wide screen and an off-canvas
  // slide-over on a narrow one, so its initial state is chosen from the
  // viewport at mount. If the window is then narrowed across the breakpoint,
  // an open sidebar would become a scrim covering the board — close it.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const onChange = (e: MediaQueryListEvent): void => {
      if (e.matches) setLogOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // A reveal overlay must never survive into a different game or the lobby.
  useEffect(() => {
    if (view === null) setCardReveal(null);
  }, [view]);
  // The action dock is a FIXED overlay, so it is out of flow and the flex
  // column cannot reserve its height. Measure it and publish that as a CSS
  // variable; `.app` pads itself by exactly that much so the board's content
  // is never hidden underneath the bar. The effect keys on the ELEMENT, not a
  // mount flag: the dock only renders in the in-game branch (the lobby returns
  // early), so a [] effect would run once while the dock is still absent.
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (dockEl === null) return;
    let last = -1;
    const publish = (): void => {
      const height = dockEl.offsetHeight;
      if (height === last) return;
      last = height;
      document.documentElement.style.setProperty('--dock-h', `${height}px`);
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
    // Belt and braces: when the bar WRAPS its height changes without a resize
    // event or a DOM mutation, so neither observer above sees it. A slow poll
    // keeps the reservation honest in that case (and in a backgrounded tab).
    const timer = setInterval(publish, 250);
    return () => {
      observer.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', publish);
      clearInterval(timer);
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
    // The server may deliver a whole bot stretch as ONE snapshot, so collect
    // EVERY fresh explore action (not just the newest log entry) and queue
    // each one's cards — the viewing player watches every player's reveals.
    const freshExplores = detectFreshExplores(prev, state);
    const detected = freshExplores.flatMap(f => revealsForExplore(prev, state, f.action));
    // Ability/effect reveal (separate overlay): show it once, and keep it
    // queued behind a mansion-door reveal if both landed on the same step.
    const revealBatch = detectCardReveals(prev, state, mySeat);
    if (revealBatch !== null) setCardReveal(revealBatch);
    if (downed !== null && detected.length > 0) {
      // Both on the same step: show the reveal first, then YOU DIED.
      pendingDeathRef.current = downed;
    } else if (downed !== null) {
      setYouDied(downed === 'dead');
      pendingDeathRef.current = null;
      return;
    }
    if (freshExplores.length === 0) return;

    const partyFor = (explorerSeat: number, leader: 'main' | 'partner'): RevealPartyMember[] => {
      const explorer = state.seats[explorerSeat];
      const party: RevealPartyMember[] = [];
      if (explorer === undefined) return party;
      const mainDef = defForInstance(state, explorer.characterInstanceId);
      const partnerDef = defForInstance(state, explorer.partnerInstanceId);
      // A carried counter (Poison) turns BOTH characters' gauges purple.
      const poisoned = (explorer.counters ?? []).length > 0;
      if (mainDef !== null) {
        party.push({
          def: mainDef,
          leader: leader === 'main',
          hp: explorer.hp,
          maxHp: explorer.maxHp,
          decorations: explorer.decorations,
          poisoned,
        });
      }
      if (partnerDef !== null) {
        party.push({
          def: partnerDef,
          leader: leader === 'partner',
          hp: explorer.partnerHp ?? explorer.hp,
          maxHp: explorer.partnerMaxHp ?? explorer.maxHp,
          decorations: explorer.decorations,
          poisoned,
        });
      }
      return party;
    };

    const queue: RevealEntry[] = [];
    for (const { action } of freshExplores) {
      const reveals = revealsForExplore(prev, state, action);
      if (reveals.length === 0) continue;
      const party = partyFor(action.seat, action.leader ?? 'main');
      for (const r of reveals) {
        const def = defForInstance(state, r.instanceId);
        if (def === null) continue;
        const resultText =
          r.outcomeZone === 'attached'
            ? `Defeated! ${def.name} is attached to your character (+${def.decorations ?? 0} ★).`
            : r.outcomeZone === 'removed'
              ? `${def.name} was removed from the Mansion.`
              : r.outcomeZone === 'mansion'
                ? `${def.name} was returned to the Mansion deck.`
                : `${def.name} is revealed — answer the choice below to continue.`;
        // Resolve the explore's weapon instances to defs for the reveal panel.
        const weaponDefs = r.weapons
          .map(id => defForInstance(state, id))
          .filter((d): d is CardDef => d !== null);
        // CI-011 Queen Leech: its Health is the leading exploring Character's
        // Maximum Health, which is not the value printed on the card.
        const revealedHp = (def.infectedEffects ?? []).some(e => e.kind === 'onRevealHpEqualsExploringCharacterMaxHp')
          ? party.find(m => m.leader)?.maxHp
          : undefined;
        const explorerName = state.seats[r.explorerSeat]?.name ?? `Player ${r.explorerSeat + 1}`;
        queue.push({ def, resultText, damage: r.damage, hp: revealedHp, weapons: weaponDefs, explorerSeat: r.explorerSeat, explorerName, party });
      }
    }
    if (queue.length === 0) return;
    // APPEND to any queue already showing (a new bot explore that lands while
    // the previous reveal is up joins the line instead of replacing it).
    setRevealQueue(prevQueue => [...(prevQueue ?? []), ...queue]);
    setRevealIndex(index => (revealQueue === null ? 0 : index));
  }, [state, mySeat]);

  const revealCurrent = revealQueue !== null ? revealQueue[revealIndex] ?? null : null;

  // Every viewer sees EVERY player's mansion-door reveal (the zone diff is
  // public), and the overlay pauses the table as before — but it now AUTO-
  // CLOSES after two seconds, so a spectator is not stuck watching other
  // players' explores. The one exception: the exploring viewer with a pending
  // prompt rendered inside the panel (Take / Send-to-bottom etc.) keeps it
  // open until the choice is resolved — that panel lock predates this.
  // NOTE: this effect must stay ABOVE the Lobby early-return — a hook after
  // a conditional return breaks the Rules of Hooks (React #310).
  const revealLocked = revealCurrent !== null
    && revealCurrent.explorerSeat === mySeat
    && ((view?.state.prompts.some(p => p.seat === mySeat)) ?? false);
  useEffect(() => {
    if (revealQueue === null || revealLocked) return;
    const timer = setTimeout(() => {
      if (revealQueue !== null && revealIndex < revealQueue.length - 1) {
        setRevealIndex(revealIndex + 1);
        return;
      }
      setRevealQueue(null);
      setRevealIndex(0);
      const queued = pendingDeathRef.current;
      pendingDeathRef.current = null;
      if (queued !== null) setYouDied(queued === 'dead');
    }, 1000);
    return () => clearTimeout(timer);
  }, [revealQueue, revealIndex, revealLocked]);

  const inLobby = room !== null && (room.phase === 'lobby' || view === null);
  const seatNames = room?.players.map(p => p.name) ?? hotseat?.names ?? [];

  const passPending = hotseat !== null && hotseat.passPending && gameOver === null;
  // Anything the player must look at before the end screen: the explore/mansion
  // reveal (a boss reveal is an explore reveal), an ability/effect reveal, or
  // the YOU DIED screen.
  const revealPending = revealCurrent !== null || cardReveal !== null || youDied !== null;
  // Game over overlay: hotseat OR server room (before, a server-room game over
  // left everyone staring at 'Waiting for Bot N…' forever). It WAITS for a
  // pending reveal/death overlay — the seat-swap backdrop is z-index 640, above
  // the mansion-door reveal's old 600, so without this the boss that just ended
  // the game is covered up before the player ever sees it.
  const showGameOverOverlay = shouldShowGameOverOverlay({
    inGame: hotseat !== null || room !== null,
    gameOver: gameOver !== null,
    revealPending,
  });

  if (view === null || (room === null && hotseat === null)) {
    prevStateRef.current = null; // reset across lobby/game switches
    pendingDeathRef.current = null;
    return (
      <Lobby
        room={room}
        clientId={clientId}
        status={status}
        onCreateRoom={(name, scenario, partnerMode, mainCharacterId, partnerCharacterId, skillSystem, customCards, mansionAttachmentMode, mercenariesBasicResources) => dispatchClient({ kind: 'createRoom', playerName: name, scenario, partnerMode, mainCharacterId, partnerCharacterId, skillSystem, customCards, mansionAttachmentMode, mercenariesBasicResources })}
        onJoinRoom={(code, name) => dispatchClient({ kind: 'joinRoom', roomCode: code, playerName: name })}
        onSelectSeat={seat => dispatchClient({ kind: 'selectSeat', seat })}
        onAddBot={seat => dispatchClient({ kind: 'addBot', seat })}
        onRemoveBot={seat => dispatchClient({ kind: 'removeBot', seat })}
        onSetScenario={scenario => dispatchClient({ kind: 'setScenario', scenario })}
        onSetPartnerMode={partnerMode => dispatchClient({ kind: 'setPartnerMode', partnerMode })}
        onSetSkillSystem={skillSystem => dispatchClient({ kind: 'setSkillSystem', skillSystem })}
        onSetMercenariesBasicResources={mercenariesBasicResources => dispatchClient({ kind: 'setMercenariesBasicResources', mercenariesBasicResources })}
        onSetCustomCards={customCards => dispatchClient({ kind: 'setCustomCards', customCards })}
        onSetMansionAttachmentMode={mansionAttachmentMode => dispatchClient({ kind: 'setMansionAttachmentMode', mansionAttachmentMode })}
        onSetCharacterSelection={(main?: string, partner?: string) => dispatchClient({ kind: 'setCharacterSelection', mainCharacterId: main, partnerCharacterId: partner })}
        onStart={() => dispatchClient({ kind: 'startGame' })}
        onStartHotseat={(names, scenario, skillSystem, customCards, mansionAttachmentMode, mercenariesBasicResources, locationsMode) => useGameStore.getState().startHotseat(names, Math.floor(Date.now() % 2 ** 31), scenario, { skillSystem, customCards, mansionAttachmentMode, mercenariesBasicResources, locationsMode })}
      />
    );
  }
  void inLobby;

  const gameState = view.state;

  // ---- Off-turn targeting notices --------------------------------------
  // The viewing player was targeted by a card / ability while it was NOT
  // their turn (Sherry's forced explore, Wesker L2, Cephalo, Mercenaries
  // Jill's ammo raise, Mind Control, Backstab). The engine records them on
  // the target's seat; the board floats a banner so the player never wonders
  // "why is my hand changing / why must I explore next turn".
  const TARGET_REASON_LABEL: Record<TargetReason, string> = {
    forcedExplore: 'is forcing you to Explore with them right now',
    mustExploreNextTurn: 'made you Explore on your next turn',
    mustUseAllExploresNextTurn: 'made you spend your whole Explore pool next turn',
    backstab: 'is stealing 1 XP from one of your Skills',
    ammoReqNextTurn: 'raised the Ammo requirement of your weapons next turn',
    revealHand: 'revealed your hand',
  };
  // NO activeSeat/phase gate: in bot games the server delivers one snapshot
  // AFTER the whole bot stretch — which always ends at a human turn start — so
  // the alert arrives exactly when activeSeat === mySeat. The engine keeps the
  // notices until the target takes their FIRST decision-bar action (explore /
  // buy / play / end turn...), so the banner rides through the player's own
  // turn until they actually interact.
  const isBotGame = gameState.seats.some(s => s.controller === 'bot');
  const targetedByMe = (gameState.seats[mySeat]?.targetedBy ?? []).map(t => ({
    key: `${t.seat}-${t.reason}`,
    label: `${seatNames[t.seat] ?? `Player ${t.seat + 1}`} ${TARGET_REASON_LABEL[t.reason]}`,
  }));

  // The mansion-door reveal attributes a FORCED explore (FCH-008 Sherry) so
  // the involved players see who forced whom.
  const lastLogged = gameState.log[gameState.log.length - 1]?.action;
  const forcedByLabel = lastLogged?.type === 'explore' && lastLogged.forcedBy !== undefined
    ? (mySeat === lastLogged.seat
        ? `${seatNames[lastLogged.forcedBy] ?? `Player ${lastLogged.forcedBy + 1}`} forced you to Explore!`
        : mySeat === lastLogged.forcedBy
          ? `You forced ${seatNames[lastLogged.seat] ?? `Player ${lastLogged.seat + 1}`} to Explore!`
          : undefined)
    : undefined;
  // End-of-game ranking: Decorations first, then Health — the same order
  // `checkWin` ranks winners, so the list always agrees with the CHAMPION line.
  const standings = rankStandings(
    gameState.seats.map((s, i) => ({
      seat: i,
      name: seatNames[i] ?? `Player ${i + 1}`,
      decorations: s.decorations,
      hp: s.hp,
    })),
    gameOver?.winners ?? [],
  );
  // Pass-and-play hand-off follows the seat the game is waiting on — the draft's
  // pick/keep seat during the opening Skill Draft, the active seat afterwards.
  // Read it from the authoritative hotseat game (the view is frozen while the
  // device is being passed).
  const hotseatHolder = hotseat !== null ? seatAwaitingAction(hotseat.game) : -1;
  const disabled =
    gameState.phase !== 'main' ||
    gameState.activeSeat !== mySeat ||
    gameState.prompts.some(p => p.seat === mySeat) ||
    revealCurrent !== null ||
    cardReveal !== null ||
    youDied !== null ||
    passPending;


  return (
    <div className={`app app-board${logOpen ? ' app-log-open' : ''}`}>
      {/* In bot games the targeted-by banner waits until every queued reveal
          screen has closed (revealQueue drained) — it never fights the overlay
          for attention. Human games show it immediately. */}
      <TargetedNotice items={isBotGame && revealQueue !== null ? [] : targetedByMe} />
      <main className="app-main">
        <Board state={gameState} mySeat={mySeat} onAction={a => dispatchClient({ kind: 'sendAction', action: a })} disabled={disabled} />
        {logOpen && (
          <aside className="app-side">
            <GameLog state={gameState} chat={chat} lastError={lastError} seatNames={seatNames} onClose={() => setLogOpen(false)} />
          </aside>
        )}
      </main>
      {/* Narrow screens only: a scrim behind the slide-over log, tapped to close.
          On a wide screen the log is a permanent sidebar and this is display:none. */}
      {logOpen && (
        <div
          className="app-log-backdrop"
          data-log-backdrop
          aria-hidden="true"
          onClick={() => setLogOpen(false)}
        />
      )}
      <footer className="app-action-dock" ref={setDockEl}>
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
          cardHidden={revealCurrent !== null || youDied !== null || cardReveal !== null}
        />
      </footer>
      {revealCurrent !== null && (
        <MansionReveal
          def={revealCurrent.def}
          resultText={revealCurrent.resultText}
          damage={revealCurrent.damage}
          hp={revealCurrent.hp}
          weapons={revealCurrent.weapons}
          damageLabel={revealCurrent.explorerSeat === mySeat ? 'Your damage' : 'Damage dealt'}
          explorerName={revealCurrent.explorerSeat === mySeat ? 'Your explore' : `${revealCurrent.explorerName}'s explore`}
          explorerChanged={revealIndex === 0 || (revealQueue?.[revealIndex - 1]?.explorerSeat !== revealCurrent.explorerSeat)}
          forcedByLabel={forcedByLabel}
          party={revealCurrent.party}
          index={revealIndex}
          total={revealQueue?.length ?? 1}
          prompts={revealCurrent.explorerSeat === mySeat ? gameState.prompts.filter(p => p.seat === mySeat) : []}
          state={gameState}
          onChooseOption={(promptId, option) =>
            dispatchClient({ kind: 'sendAction', action: { type: 'chooseOption', seat: mySeat, promptId, option } })
          }
          onContinue={() => {
            // Several cards revealed in one explore: step through them one at
            // a time, then dismiss (and play the queued death screen, if any).
            if (revealQueue !== null && revealIndex < revealQueue.length - 1) {
              setRevealIndex(revealIndex + 1);
              return;
            }
            setRevealQueue(null);
            setRevealIndex(0);
            const queued = pendingDeathRef.current;
            pendingDeathRef.current = null;
            if (queued !== null) {
              setYouDied(queued === 'dead');
            }
          }}
        />
      )}
      {cardReveal !== null && revealCurrent === null && (
        <CardRevealOverlay
          state={gameState}
          reveals={cardReveal.reveals}
          action={cardReveal.action}
          mySeat={mySeat}
          onDismiss={() => setCardReveal(null)}
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
          endReason={gameOver?.endReason}
          playerNames={seatNames}
          standings={standings}
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