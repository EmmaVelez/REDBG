import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState } from '@re/game-core';
import { setup, startTurn, applyAction, PREMIER_CARDS, FIRST_TIMER_PILES } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { Hand } from './Hand';
import { Zones } from './Zones';
import { PlayerPanel } from './PlayerPanel';
import { Board } from './Board';
import { ActionBar } from './ActionBar';
import { Lobby } from './Lobby';
import { GameLog } from './GameLog';
import { defForInstance, typeLabel, statLine, costText } from './cards';

/**
 * M4-T03..T09 component tests. Pure render checks via renderToStaticMarkup
 * (node env — no jsdom dependency); the components take prop data and render
 * declaratively, so static markup assertions cover the contract.
 */

function twoPlayerState(seed = 11): GameState {
  return startTurn(
    setup(
      { seed, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    ),
  );
}

function firstWeaponDef(state: GameState): { instanceId: string; def: NonNullable<ReturnType<typeof defForInstance>> } {
  const hand = state.seats[0]?.hand ?? [];
  for (const instanceId of hand) {
    const def = defForInstance(state, instanceId);
    if (def !== null && def.type === 'weapon') return { instanceId, def };
  }
  throw new Error('no weapon in starting hand');
}

describe('cards helper', () => {
  it('resolves instance ids through the state index', () => {
    const state = twoPlayerState();
    const { instanceId, def } = firstWeaponDef(state);
    expect(defForInstance(state, instanceId)).toBe(def);
    expect(defForInstance(state, 'bogus')).toBeNull();
  });

  it('produces labels and stat lines', () => {
    expect(typeLabel('weapon')).toBe('WEAPON');
    expect(typeLabel('infected')).toBe('INFECTED');
    const state = twoPlayerState();
    const { def } = firstWeaponDef(state);
    expect(statLine(def)).toContain('DMG');
    expect(costText(def)).toMatch(/^\d+$|—/);
  });
});

describe('CardView (T03)', () => {
  it('renders name, type banner, cost', () => {
    const state = twoPlayerState();
    const { def } = firstWeaponDef(state);
    const html = renderToStaticMarkup(<CardView def={def} />);
    expect(html).toContain(def.name);
    expect(html).toContain('WEAPON');
    expect(html).toContain(`data-card-id="${def.id}"`);
  });

  it('renders a character card with its skill list and unlock gates', () => {
    // Chris: L1 gate 0 -> L1 unlocked from the start, L2 gated
    const chris = PREMIER_CARDS.find(c => c.id === 'ch-008');
    expect(chris).toBeDefined();
    if (chris === undefined || chris.level2At === undefined) return;
    // locked: decorations below the level-2 threshold
    const lockedHtml = renderToStaticMarkup(<CardView def={chris} decorations={chris.level2At - 1} />);
    expect(lockedHtml).toContain('skill-unlocked'); // L1 active (gate 0)
    expect(lockedHtml).toContain('skill-locked'); // L2 still gated
    expect(lockedHtml).toContain(`data-skill-level="1"`);
    expect(lockedHtml).toContain(`data-skill-level="2"`);
    // every level shows the gate: L1 ★ 0 (start), L2 shows remaining
    expect(lockedHtml).toContain(`★ 0`);
    expect(lockedHtml).toContain(`★ 1`); // one more decoration needed
    expect((lockedHtml.match(/data-skill-gate/g) ?? []).length).toBe(2);
    // unlocked: at or above threshold -> both gates read ★ 0
    const unlockedHtml = renderToStaticMarkup(<CardView def={chris} decorations={chris.level2At} />);
    expect(unlockedHtml).toContain(`★ 0`);
    expect(unlockedHtml).not.toContain(`★ 1`);
    expect(unlockedHtml).not.toContain('skill-locked');
  });

  it('Leon/Jill gates: L1 requires decorations — greyed on a fresh character', () => {
    const leon = PREMIER_CARDS.find(c => c.id === 'ch-002');
    const jill = PREMIER_CARDS.find(c => c.id === 'ch-009');
    expect(leon).toBeDefined();
    expect(jill).toBeDefined();
    if (leon === undefined || jill === undefined || leon.level1At === undefined) return;
    expect(leon.level1At).toBe(2);
    expect(jill.level1At).toBe(5);
    // fresh Leon: L1 locked with ★ 2, L2 locked with ★ 6
    const fresh = renderToStaticMarkup(<CardView def={leon} decorations={0} />);
    expect(fresh).toContain(`★ 2`);
    expect(fresh).not.toContain('skill-unlocked');
    // Leon at his L1 gate: L1 unlocked, L2 still gated
    const atGate = renderToStaticMarkup(<CardView def={leon} decorations={2} />);
    expect(atGate).toContain(`★ 0`);
    expect(atGate).toContain('skill-unlocked');
    expect(atGate).toContain(`★ 4`);
  });

  it('Krauser requires 1 decoration for his level-1 ability (level1At gate)', () => {
    const krauser = PREMIER_CARDS.find(c => c.id === 'ch-007');
    expect(krauser).toBeDefined();
    if (krauser === undefined || krauser.level1At === undefined) return;
    expect(krauser.level1At).toBe(1);
    // at 0 decorations: level 1 locked with ★ 1
    const fresh = renderToStaticMarkup(<CardView def={krauser} decorations={0} />);
    expect(fresh).toContain(`★ 1`);
    expect(fresh).toContain('skill-locked');
    // at 1 decoration: level 1 row unlocked (★ 0), level 2 still gated
    const earned = renderToStaticMarkup(<CardView def={krauser} decorations={1} />);
    expect(earned).toContain(`★ 0`);
    expect(earned).toContain('skill-unlocked');
    expect(earned).toContain(`★ 6`);
  });

  it('renders a character card with max HP when non-compact and undecorated', () => {
    const charDef = PREMIER_CARDS.find(c => c.type === 'character');
    expect(charDef).toBeDefined();
    if (charDef === undefined) return;
    const html = renderToStaticMarkup(<CardView def={charDef} />);
    expect(html).toContain('CHARACTER');
    expect(html).toContain(String(charDef.maxHp ?? -1));
  });
});

describe('Hand + Zones (T04)', () => {
  it('renders a playable button per hand card for my seat', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(<Hand state={state} seat={0} onPlay={() => {}} />);
    const hand = state.seats[0]?.hand ?? [];
    expect(html).toMatch(/class="hand"/);
    expect((html.match(/class="hand-card"/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((html.match(/class="hand-card"/g) ?? []).length).toBe(hand.length);
  });

  it('renders deck/discard piles with counts and the play area', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    const html = renderToStaticMarkup(<Zones state={state} seat={0} />);
    // visual piles carry anchor + count; hand count is a text badge
    expect(html).toContain('data-anim-zone="deck"');
    expect(html).toContain('data-anim-zone="discard"');
    expect(html).toContain(`data-pile-count="${player.inventory.length}"`);
    expect(html).toContain(`data-pile-count="${player.discard.length}"`);
    expect(html).toContain(`Hand: ${player.hand.length}`);
    // play area anchor present even when empty (flight target stability)
    expect(html).toContain('data-anim-zone="play"');
    expect(html).toContain('<span class="zone-empty">none</span>');
  });

  it('renders an empty-hand message when the hand is empty', () => {
    const state = twoPlayerState();
    const empty = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, hand: [] } : s)) };
    const html = renderToStaticMarkup(<Hand state={empty} seat={0} onPlay={() => {}} />);
    expect(html).toContain('No cards in hand');
  });
});

describe('PlayerPanel (T06)', () => {
  it('shows name, HP, decorations, pools and zone counts', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    const html = renderToStaticMarkup(<PlayerPanel state={state} seat={0} isMe />);
    expect(html).toContain(player.name);
    expect(html).toContain(`HP ${player.hp}/${player.maxHp}`);
    expect(html).toContain(`★ ${player.decorations}`);
    expect(html).toContain(`Ammo ${player.turnAmmo}`);
    expect(html).toContain(`Gold ${player.turnGold}`);
    expect(html).toContain('YOU');
  });

  it('marks dead players', () => {
    const state = twoPlayerState();
    const dead = { ...state, seats: state.seats.map((s, i) => (i === 1 ? { ...s, dead: true } : s)) };
    const html = renderToStaticMarkup(<PlayerPanel state={dead} seat={1} />);
    expect(html).toContain('player-dead');
    expect(html).toContain('(dead)');
  });

  it('renders the character as a card beneath the player info', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    const charDef = defForInstance(state, player.characterInstanceId);
    expect(charDef).not.toBeNull();
    if (charDef === null) return;
    const html = renderToStaticMarkup(<PlayerPanel state={state} seat={0} isMe />);
    // character card rendered inside the panel
    expect(html).toContain('player-character-card');
    expect(html).toContain(`data-card-id="${charDef.id}"`);
    expect(html).toContain(charDef.name);
    expect(html).toContain('CHARACTER');
    // panel order: player info rows come before the character card
    const infoIdx = html.indexOf('player-pools');
    const charIdx = html.indexOf('player-character-card');
    expect(infoIdx).toBeGreaterThan(-1);
    expect(charIdx).toBeGreaterThan(infoIdx);
  });
});

describe('Board (T05)', () => {
  it('renders market piles, mansion piles, panels and my hand', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(<Board state={state} mySeat={0} onAction={() => {}} />);
    expect(html).toContain('Resource Area');
    expect(html).toContain('Mansion');
    // mansion deck is a visual pile with anchor + count
    expect(html).toContain('data-anim-zone="mansion"');
    expect(html).toContain(`data-pile-count="${state.mansionDeck.length}"`);
    expect(html).toContain('Your hand');
    // every seated player gets a panel
    expect((html.match(/class="player-panel/g) ?? []).length).toBe(2);
    // at least one purchasable pile shows a gold cost
    expect(html).toMatch(/\d+g/);
    // flight layer mounts with zero active flights (SSR-safe)
    expect(html).toContain('data-flight-count="0"');
  });
});

describe('ActionBar (T07)', () => {
  it('offers end turn on my turn and disables explore with no legal combo', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    // revoke explores so no explore is legal (deterministic: empty the pool)
    const noExplore = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, exploresLeft: 0 } : s)) };
    const html = renderToStaticMarkup(<ActionBar state={noExplore} seat={0} onAction={() => {}} />);
    expect(html).toContain('End turn');
    expect(html).toContain('disabled=""'); // explore button (has no legal action)
  });

  it('offers explore when weapons make it legal', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} />);
    expect(html).toContain('Explore');
  });

  it('shows a waiting note off turn', () => {
    const state = twoPlayerState();
    // seat 1 is active: don't call startTurn again — construct by switching active seat
    const otherTurn = { ...state, activeSeat: 1 };
    const html = renderToStaticMarkup(<ActionBar state={otherTurn} seat={0} onAction={() => {}} />);
    expect(html).toContain('Waiting for');
  });
});

describe('Lobby (T08)', () => {
  it('renders the create/join forms with no room', () => {
    const html = renderToStaticMarkup(
      <Lobby room={null} clientId={null} status="connected" onCreateRoom={() => {}} onJoinRoom={() => {}} onSelectSeat={() => {}} onAddBot={() => {}} onRemoveBot={() => {}} onStart={() => {}} />,
    );
    expect(html).toContain('Create room');
    expect(html).toContain('Join room');
  });

  it('renders seats, room code and host controls in a room', () => {
    const room = {
      roomCode: 'ABCDEF',
      phase: 'lobby' as const,
      maxSeats: 2,
      players: [
        { clientId: 'c1', name: 'Me', seat: 0, isBot: false, connected: true },
        { clientId: 'c2', name: 'Bot', seat: 1, isBot: true, connected: true },
      ],
    };
    const html = renderToStaticMarkup(
      <Lobby room={room} clientId="c1" status="connected" onCreateRoom={() => {}} onJoinRoom={() => {}} onSelectSeat={() => {}} onAddBot={() => {}} onRemoveBot={() => {}} onStart={() => {}} />,
    );
    expect(html).toContain('ABCDEF');
    expect(html).toContain('Seat 0');
    expect(html).toContain('Bot');
    expect(html).toContain('Start game');
  });
});

describe('HoverCard (M4-T11)', () => {
  it('wraps its trigger; popup is state-driven (renders on hover, not in static markup)', () => {
    const state = twoPlayerState();
    const { def } = firstWeaponDef(state);
    const html = renderToStaticMarkup(
      <HoverCard def={def}>
        <span className="trigger-marker">T</span>
      </HoverCard>,
    );
    expect(html).toContain('hover-card');
    expect(html).toContain('trigger-marker');
    // popup only mounts after onMouseEnter sets position state
    expect(html).not.toContain('hover-card-pop');
  });
});

describe('GameLog (T09)', () => {
  it('shows turn, active player, chat and errors', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(
      <GameLog
        state={state}
        chat={[{ seat: 0, text: 'glhf' }]}
        lastError="not your turn"
        seatNames={['Me', 'Bot']}
      />,
    );
    expect(html).toContain(`Turn ${state.turnNumber}`);
    expect(html).toContain(`Active: ${state.seats[state.activeSeat]?.name}`);
    expect(html).toContain('glhf');
    expect(html).toContain('not your turn');
  });

  it('renders an empty log without a state', () => {
    const html = renderToStaticMarkup(<GameLog state={null} chat={[]} lastError={null} seatNames={[]} />);
    expect(html).toContain('No messages yet');
  });

  it('renders a scrollable turn history with all seats', () => {
    const s0 = twoPlayerState();
    // build a small action history: seat 0 plays ammo, ends turn; seat 1 buys
    const s1 = applyAction(s0, { type: 'playAmmo', seat: 0, instanceId: firstAmmoInHand(s0) } as never);
    const s2 = applyAction(s1, { type: 'endTurn', seat: 0 } as never);
    const pileId = Object.keys(s2.marketPiles)[0] as string;
    const s3 = applyAction(s2, { type: 'buy', seat: 1, pileId } as never);
    const html = renderToStaticMarkup(
      <GameLog state={s3} chat={[]} lastError={null} seatNames={['Me', 'Bot']} />,
    );
    expect(html).toContain('Turn history');
    expect(html).toContain('T1');
    expect(html).toContain('Me:');
    expect(html).toContain('Bot:');
    expect(html).toContain('played ammo');
    expect(html).toContain('ended their turn');
    expect(html).toContain('bought');
    expect((html.match(/data-history/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

function firstAmmoInHand(state: GameState): string | undefined {
  return state.seats[0]?.hand.find(id => {
    const inst = state.cards[id];
    return inst !== undefined && state.cardDefs[inst.cardId]?.type === 'ammunition';
  });
}