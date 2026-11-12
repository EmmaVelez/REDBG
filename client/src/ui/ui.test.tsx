import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Action, CardDef, GameState } from '@re/game-core';
import { setup, startTurn, applyAction, sanitize, PREMIER_CARDS, FIRST_TIMER_PILES, MERCENARIES_CARDS, CUSTOM_CARDS } from '@re/game-core';
import { ZonePile } from './ZonePile';
import { MansionReveal } from './MansionReveal';
import { YouDiedOverlay } from './YouDiedOverlay';
import { SeatSwap } from './SeatSwap';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { Hand } from './Hand';
import { Zones } from './Zones';
import { PlayerPanel } from './PlayerPanel';
import { CharacterCards, attachedOverlap } from './CharacterCards';
import { playFromHand } from './playFromHand';
import { Board } from './Board';
import { ActionBar } from './ActionBar';
import { bestExploreCombo, evaluateExploreCombo, exploreCountOptions, exploreWeaponOptions, resolveExploreLeader, toggleWeaponDouble } from './explorePicker';
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

/**
 * Leon at Level 2, so `pistolsTwicePerTurn` is unlocked — the ability that
 * lets a Pistol in the play area be used in a second explore.
 */
function leonState(seed = 11): GameState {
  const s = startTurn(
    setup(
      { seed, players: [{ name: 'Leon', controller: 'human', characterCardId: 'ch-002' }, { name: 'Bot', controller: 'bot' }] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES,
    ),
  );
  return {
    ...s,
    seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 2 as const, decorations: 6 } : p)),
  };
}

function firstWeaponDef(state: GameState): { instanceId: string; def: NonNullable<ReturnType<typeof defForInstance>> } {
  const hand = state.seats[0]?.hand ?? [];
  for (const instanceId of hand) {
    const def = defForInstance(state, instanceId);
    if (def !== null && def.type === 'weapon') return { instanceId, def };
  }
  throw new Error('no weapon in starting hand');
}

/** Add a specific card instance to seat 0's hand (deterministic fixtures). */
function withWeapon(state: GameState, cardId: string, instanceId: string): GameState {
  return {
    ...state,
    cards: {
      ...state.cards,
      [instanceId]: { instanceId, cardId, location: { zone: 'hand' as const, index: 99, seat: 0 } },
    },
    seats: state.seats.map((s, i) => (i === 0 ? { ...s, hand: [...s.hand, instanceId] } : s)),
  };
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

  it('uses the CARD-ART PNG as the card face when one exists', () => {
    const majini = PREMIER_CARDS.find(c => c.id === 'ma-001'); // MA-001.png exists
    const noArt = MERCENARIES_CARDS.find(c => c.id === 'ma-073'); // no PNG for this id
    expect(majini).toBeDefined();
    expect(noArt).toBeDefined();
    if (majini === undefined || noArt === undefined) return;

    const artHtml = renderToStaticMarkup(<CardView def={majini} />);
    expect(artHtml).toContain('card-has-art');
    expect(artHtml).toMatch(/<img class="card-art-img" src="[^"]*"/);

    const plainHtml = renderToStaticMarkup(<CardView def={noArt} />);
    expect(plainHtml).not.toContain('card-has-art');
    expect(plainHtml).not.toContain('card-art-img');
  });

  it('renders the MX-001 Mr. X custom card face from its PNG', () => {
    const mx = CUSTOM_CARDS.find(c => c.id === 'mx-001');
    expect(mx).toBeDefined();
    if (mx === undefined) return;
    const html = renderToStaticMarkup(<CardView def={mx} />);
    expect(html).toContain('card-has-art');
    expect(html).toMatch(/<img class="card-art-img" src="[^"]*MX-001[^"]*"/i);
  });

  it('artOnly gives the hand/pile face an art-only card (rows stay for the hover reveal)', () => {
    const majini = PREMIER_CARDS.find(c => c.id === 'ma-001'); // MA-001.png exists
    const noArt = MERCENARIES_CARDS.find(c => c.id === 'ma-073'); // no PNG for this id
    expect(majini).toBeDefined();
    expect(noArt).toBeDefined();
    if (majini === undefined || noArt === undefined) return;

    const artOnly = renderToStaticMarkup(<CardView def={majini} compact artOnly />);
    expect(artOnly).toContain('card-art-only');
    expect(artOnly).toContain('data-art-only="true"');
    // the printed rows stay in the DOM so the CSS :hover rule can reveal them
    expect(artOnly).toContain('card-top');
    expect(artOnly).toContain(majini.name);

    // without the prop the same card keeps its normal face
    const plain = renderToStaticMarkup(<CardView def={majini} compact />);
    expect(plain).not.toContain('card-art-only');

    // a card with no art has nothing to show but text, so artOnly is ignored
    const noArtHtml = renderToStaticMarkup(<CardView def={noArt} compact artOnly />);
    expect(noArtHtml).not.toContain('card-art-only');
  });

  it('gives a character card the art-only face too, so it matches the resource piles', () => {
    const chris = PREMIER_CARDS.find(c => c.id === 'ch-008'); // CH-008.png exists
    expect(chris).toBeDefined();
    if (chris === undefined) return;
    const artOnly = renderToStaticMarkup(<CardView def={chris} compact artOnly decorations={0} />);
    expect(artOnly).toContain('card-character');
    expect(artOnly).toContain('card-art-only');
    expect(artOnly).toContain('data-art-only="true"');
    // the frame is dropped by CSS for this face; the portrait is still there
    expect(artOnly).toContain('card-portrait');
    // without the prop the character card keeps its framed face
    const plain = renderToStaticMarkup(<CardView def={chris} compact decorations={0} />);
    expect(plain).not.toContain('card-art-only');
  });

  it('fills the character portrait window with the PNG when one exists', () => {
    const chris = PREMIER_CARDS.find(c => c.id === 'ch-008'); // CH-008.png exists
    expect(chris).toBeDefined();
    if (chris === undefined) return;
    const html = renderToStaticMarkup(<CardView def={chris} decorations={0} />);
    expect(html).toContain('card-portrait-has-art');
    expect(html).toMatch(/<img class="card-portrait-img" src="[^"]*"/);
    // the skill list stays available alongside the art
    expect(html).toContain('skill-row');
  });

  it('fills the CU-001 Ricardo Irving portrait from its PNG', () => {
    const ric = CUSTOM_CARDS.find(c => c.id === 'cu-001');
    expect(ric).toBeDefined();
    if (ric === undefined) return;
    const html = renderToStaticMarkup(<CardView def={ric} decorations={0} />);
    expect(html).toContain('card-portrait-has-art');
    expect(html).toMatch(/<img class="card-portrait-img" src="[^"]*CU-001[^"]*"/i);
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
    // stat boxes read "Lv1:0★" / "Lv2:4☆": the number is the Decoration cost
    // for that tier. At 3 decorations Chris's Lv1 (gate 0) is unlocked and his
    // Lv2 (gate 4) is still gated. The absolute gates also stay on the panel as
    // data-level1-at / data-level2-at.
    expect(lockedHtml).toContain('Lv1:0★');
    expect(lockedHtml).toContain('Lv2:4☆');
    expect(lockedHtml).toContain('data-level1-at="0"');
    expect(lockedHtml).toContain('data-level2-at="4"');
    // unlocked at the gate: both rows unlocked, same absolute gates shown
    const unlockedHtml = renderToStaticMarkup(<CardView def={chris} decorations={chris.level2At} />);
    expect(unlockedHtml).toContain('skill-unlocked');
    expect(unlockedHtml).not.toContain('skill-locked');
  });

  it('fills the EV-001 Zombie Grab art from its PNG', () => {
    const grab = CUSTOM_CARDS.find(c => c.id === 'ev-001');
    expect(grab).toBeDefined();
    if (grab === undefined) return;
    const html = renderToStaticMarkup(<CardView def={grab} />);
    expect(html).toContain('card-has-art');
    expect(html).toMatch(/<img class="card-art-img" src="[^"]*EV-001[^"]*"/i);
  });

  it('fills the CI-002 Infected Crow art from its PNG', () => {
    const crow = CUSTOM_CARDS.find(c => c.id === 'ci-002');
    expect(crow).toBeDefined();
    if (crow === undefined) return;
    const html = renderToStaticMarkup(<CardView def={crow} />);
    expect(html).toContain('card-has-art');
    expect(html).toMatch(/<img class="card-art-img" src="[^"]*CI-002[^"]*"/i);
  });

  it('fills the FCH-008 Sherry Birkin portrait from its PNG', () => {
    const sherry = CUSTOM_CARDS.find(c => c.id === 'fch-008');
    expect(sherry).toBeDefined();
    if (sherry === undefined) return;
    const html = renderToStaticMarkup(<CardView def={sherry} decorations={0} />);
    expect(html).toContain('card-portrait-has-art');
    expect(html).toMatch(/<img class="card-portrait-img" src="[^"]*FCH-008[^"]*"/i);
  });

  it('FCH-008 is a single-level character unlocked from the start', () => {
    const sherry = CUSTOM_CARDS.find(c => c.id === 'fch-008');
    expect(sherry).toBeDefined();
    if (sherry === undefined) return;
    expect(sherry.level1At).toBe(0);
    expect(sherry.level2At).toBeUndefined();
    const html = renderToStaticMarkup(<CardView def={sherry} decorations={0} />);
    expect(html).toContain('skill-unlocked');
    expect(html).not.toContain('skill-locked');
    expect(html).toContain('cannot use Weapons');
  });

  it('fills the LK-001/CR-001/CC-001 portraits from their PNGs', () => {
    for (const id of ['lk-001', 'cr-001', 'cc-001']) {
      const def = CUSTOM_CARDS.find(c => c.id === id);
      expect(def).toBeDefined();
      if (def === undefined) continue;
      const html = renderToStaticMarkup(<CardView def={def} decorations={0} />);
      expect(html).toContain('card-portrait-has-art');
      expect(html).toMatch(new RegExp(`<img class="card-portrait-img" src="[^"]*${id.toUpperCase()}[^"]*"`, 'i'));
    }
  });

  it('LK-001 gates: L1 at 1 decoration, L2 at 8', () => {
    const leon = CUSTOM_CARDS.find(c => c.id === 'lk-001');
    expect(leon).toBeDefined();
    if (leon === undefined) return;
    const fresh = renderToStaticMarkup(<CardView def={leon} decorations={0} />);
    expect(fresh).toContain('skill-locked');
    expect(fresh).not.toContain('skill-unlocked');
    expect(fresh).toContain('Lv1:1☆'); // gate 1, so still locked at 0 decorations
    expect(fresh).toContain('Lv2:8☆'); // gate 8
    expect(fresh).toContain('data-level1-at="1"');
    expect(fresh).toContain('data-level2-at="8"');
    expect(fresh).toContain('additional 5 damage for each pistol');
    expect(fresh).toContain('also labeled as pistol');
    const leveled = renderToStaticMarkup(<CardView def={leon} decorations={leon.level2At} />);
    expect(leveled).toContain('skill-unlocked');
    expect(leveled).not.toContain('skill-locked');
  });

  it('CR-001 gates: L1 at 0 decorations, L2 at 7', () => {
    const claire = CUSTOM_CARDS.find(c => c.id === 'cr-001');
    expect(claire).toBeDefined();
    if (claire === undefined) return;
    const fresh = renderToStaticMarkup(<CardView def={claire} decorations={0} />);
    // L1 gates at 0, so it is already unlocked on a fresh character.
    expect(fresh).toContain('skill-unlocked');
    expect(fresh).toContain('skill-locked');
    expect(fresh).toContain('Lv1:0★'); // gate 0, unlocked from the start
    expect(fresh).toContain('Lv2:7☆'); // gate 7
    expect(fresh).toContain('data-level1-at="0"');
    expect(fresh).toContain('data-level2-at="7"');
    expect(fresh).toContain('+1 Buy');
    expect(fresh).toContain('+2 Actions and -2 Buy');
    const leveled = renderToStaticMarkup(<CardView def={claire} decorations={claire.level2At} />);
    expect(leveled).not.toContain('skill-locked');
  });

  it('CC-001 gates: L1 at 2 decorations, L2 at 5', () => {
    const claire = CUSTOM_CARDS.find(c => c.id === 'cc-001');
    expect(claire).toBeDefined();
    if (claire === undefined) return;
    const fresh = renderToStaticMarkup(<CardView def={claire} decorations={0} />);
    expect(fresh).toContain('skill-locked');
    expect(fresh).not.toContain('skill-unlocked');
    expect(fresh).toContain('Lv1:2☆'); // gate 2
    expect(fresh).toContain('Lv2:5☆'); // gate 5
    expect(fresh).toContain('data-level1-at="2"');
    expect(fresh).toContain('data-level2-at="5"');
    expect(fresh).toContain('-10 Ammo Requirement');
    expect(fresh).toContain('Heal 5 Health');
    const leveled = renderToStaticMarkup(<CardView def={claire} decorations={claire.level2At} />);
    expect(leveled).toContain('skill-unlocked');
    expect(leveled).not.toContain('skill-locked');
  });

  it('CU-001 gates: L1 at 3 decorations, L2 at 8', () => {
    const ric = CUSTOM_CARDS.find(c => c.id === 'cu-001');
    expect(ric).toBeDefined();
    if (ric === undefined || ric.level1At === undefined || ric.level2At === undefined) return;
    expect(ric.level1At).toBe(3);
    expect(ric.level2At).toBe(8);
    const fresh = renderToStaticMarkup(<CardView def={ric} decorations={0} />);
    expect(fresh).toContain('skill-locked');
    expect(fresh).not.toContain('skill-unlocked');
    expect(fresh).toContain('Lv1:3☆'); // gate 3
    expect(fresh).toContain('Lv2:8☆'); // gate 8
    expect(fresh).toContain('data-level1-at="3"');
    expect(fresh).toContain('data-level2-at="8"');
    // both level texts are printed verbatim
    expect(fresh).toContain('Reveal the top card of your Inventory');
    expect(fresh).toContain('lower that Damage by 10');
    const leveled = renderToStaticMarkup(<CardView def={ric} decorations={ric.level2At} />);
    expect(leveled).toContain('skill-unlocked');
    expect(leveled).not.toContain('skill-locked');
  });

  it('Leon/Jill gates: L1 requires decorations — greyed on a fresh character', () => {
    const leon = PREMIER_CARDS.find(c => c.id === 'ch-002');
    const jill = PREMIER_CARDS.find(c => c.id === 'ch-009');
    expect(leon).toBeDefined();
    expect(jill).toBeDefined();
    if (leon === undefined || jill === undefined || leon.level1At === undefined) return;
    expect(leon.level1At).toBe(2);
    expect(jill.level1At).toBe(5);
    // fresh Leon: both rows locked (gates 2 / 6), so both boxes read ☆
    const fresh = renderToStaticMarkup(<CardView def={leon} decorations={0} />);
    expect(fresh).toContain('skill-locked');
    expect(fresh).not.toContain('skill-unlocked');
    expect(fresh).toContain('Lv1:2☆');
    expect(fresh).toContain('Lv2:6☆');
    expect(fresh).toContain('data-level1-at="2"');
    expect(fresh).toContain('data-level2-at="6"');
    // Leon at his L1 gate: L1 unlocked, L2 still gated
    const atGate = renderToStaticMarkup(<CardView def={leon} decorations={2} />);
    expect(atGate).toContain('skill-unlocked');
    expect(atGate).toContain('skill-locked');
  });

  it('Krauser requires 1 decoration for his level-1 ability (level1At gate)', () => {
    const krauser = PREMIER_CARDS.find(c => c.id === 'ch-007');
    expect(krauser).toBeDefined();
    if (krauser === undefined || krauser.level1At === undefined) return;
    expect(krauser.level1At).toBe(1);
    // at 0 decorations: level 1 locked (gates 1 / 7), so both boxes read ☆
    const fresh = renderToStaticMarkup(<CardView def={krauser} decorations={0} />);
    expect(fresh).toContain('skill-locked');
    expect(fresh).toContain('Lv1:1☆');
    expect(fresh).toContain('Lv2:7☆');
    expect(fresh).toContain('data-level1-at="1"');
    expect(fresh).toContain('data-level2-at="7"');
    // at 1 decoration: level 1 row unlocked, level 2 still gated
    const earned = renderToStaticMarkup(<CardView def={krauser} decorations={1} />);
    expect(earned).toContain('skill-unlocked');
    expect(earned).toContain('skill-locked');
  });

  it('renders a non-compact character card with its skill list', () => {
    const charDef = PREMIER_CARDS.find(c => c.type === 'character');
    expect(charDef).toBeDefined();
    if (charDef === undefined) return;
    const html = renderToStaticMarkup(<CardView def={charDef} decorations={0} />);
    expect(html).toContain('card-character');
    expect(html).toContain('card-skills');
    expect(html).toContain(`data-card-id="${charDef.id}"`);
    // the [CHARACTER] banner and the name bar are gone: both are printed on the
    // card art itself, so the app no longer duplicates them
    expect(html).not.toContain('cc-head');
    expect(html).not.toContain('card-name');
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

  it('renders the play area; the deck/hand/discard row moved to the action bar', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(<Zones state={state} seat={0} />);
    // play area anchor present even when empty (flight target stability)
    expect(html).toContain('data-anim-zone="play"');
    expect(html).toContain('<span class="zone-empty">none</span>');
    // the deck / hand / discard row now lives in the ActionBar, not here
    expect(html).not.toContain('data-anim-zone="deck"');
    expect(html).not.toContain('data-anim-zone="discard"');
    expect(html).not.toContain('zone-hand-slot');
    expect(html).not.toContain('class="hand"');
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
    // HP is now the segmented HealthRing (center label + data attrs)
    expect(html).toContain('health-ring');
    expect(html).toContain(`aria-label="Health ${player.hp} of ${player.maxHp}"`);
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

  it('renders attached counters (Unofficial Expansion Poison)', () => {
    const state = twoPlayerState();
    const withCounter = {
      ...state,
      seats: state.seats.map((s, i) => (i === 0 ? { ...s, counters: ['ex-009#1'] } : s)),
    };
    const html = renderToStaticMarkup(<PlayerPanel state={withCounter} seat={0} isMe />);
    expect(html).toContain('data-player-counters');
    expect(html).toContain('Counters');
    // no counters -> no row
    const plain = renderToStaticMarkup(<PlayerPanel state={state} seat={0} isMe />);
    expect(plain).not.toContain('data-player-counters');
  });

  it('renders the shared counter supply on the board only once a counter is attached', () => {
    const state = twoPlayerState();
    // The supply alone (nothing attached yet) must NOT advertise the pile.
    const supplyOnly = { ...state, supply: ['ex-009#1'] };
    const hidden = renderToStaticMarkup(<Board state={supplyOnly} mySeat={0} onAction={() => { /* noop */ }} />);
    expect(hidden).not.toContain('Counter supply');
    // A counter attached to a Character brings the supply into view.
    const attached = {
      ...supplyOnly,
      seats: state.seats.map((s, i) => (i === 0 ? { ...s, counters: ['ex-009#1'] } : s)),
    };
    const html = renderToStaticMarkup(<Board state={attached} mySeat={0} onAction={() => { /* noop */ }} />);
    expect(html).toContain('Counter supply');
    expect(html).toContain('data-anim-zone="supply"');
    const plain = renderToStaticMarkup(<Board state={state} mySeat={0} onAction={() => { /* noop */ }} />);
    expect(plain).not.toContain('Counter supply');
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
    // the [CHARACTER] banner is printed on the art, not drawn by the app
    expect(html).not.toContain('cc-head');
    // panel order: player info rows come before the character card
    const infoIdx = html.indexOf('player-pools');
    const charIdx = html.indexOf('player-character-card');
    expect(infoIdx).toBeGreaterThan(-1);
    expect(charIdx).toBeGreaterThan(infoIdx);
  });

  it('can drop the character cards from the viewing player’s own panel (they live in the bar)', () => {
    const state = twoPlayerState();
    const mine = renderToStaticMarkup(<PlayerPanel state={state} seat={0} isMe showCharacterCards={false} />);
    expect(mine).not.toContain('player-character-card');
    // every other seat still shows its character card on the board
    const theirs = renderToStaticMarkup(<PlayerPanel state={state} seat={1} />);
    expect(theirs).toContain('player-character-card');
  });

  it("shows another seat's public play area and discard top card (only hands are secret)", () => {
    const state = twoPlayerState();
    const other = state.seats[1];
    expect(other).toBeDefined();
    if (other === undefined) return;
    const [inPlay, discarded] = other.hand;
    expect(inPlay).toBeDefined();
    expect(discarded).toBeDefined();
    if (inPlay === undefined || discarded === undefined) return;
    const withZones: GameState = {
      ...state,
      seats: state.seats.map((s, i) => (i === 1
        ? { ...s, playArea: [inPlay], discard: [discarded], hand: s.hand.filter(id => id !== inPlay && id !== discarded) }
        : s)),
    };
    const html = renderToStaticMarkup(<PlayerPanel state={withZones} seat={1} />);
    expect(html).toContain('data-public-zones');
    expect(html).toContain('In play');
    expect(html).toContain(defForInstance(withZones, inPlay)?.name ?? '');
    expect(html).toContain('player-public-count');
    expect(html).toContain(defForInstance(withZones, discarded)?.name ?? '');
    // the viewing player's own panel does not repeat their play area
    const mine = renderToStaticMarkup(<PlayerPanel state={withZones} seat={0} isMe />);
    expect(mine).not.toContain('data-public-zones');
  });
});

describe('CharacterCards (action bar)', () => {
  /** A seat with a partner, so both cards render. */
  const withPartner = (over: Partial<GameState> = {}): GameState => {
    const state = twoPlayerState();
    const partnerCharInst = 'ch-002#p1';
    const partnerInst = 'we-004#77';
    const armed = {
      ...state,
      cards: {
        ...state.cards,
        [partnerCharInst]: { instanceId: partnerCharInst, cardId: 'ch-002', location: { zone: 'attached' as const, index: 0, seat: 0 } },
        [partnerInst]: { instanceId: partnerInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } },
      },
      seats: state.seats.map((s, i) => (i === 0
        ? { ...s, partnerInstanceId: partnerCharInst, partnerAttached: [partnerInst] }
        : s)),
    };
    return { ...armed, ...over };
  };

  it('renders the partner card identically to the player card, with no text underneath', () => {
    const html = renderToStaticMarkup(<CharacterCards state={withPartner()} seat={0} />);
    // both character cards take the art-only face (the trophy fan's cards are
    // counted separately below, so match the full class not just the suffix)
    expect(html).toContain('data-character-card');
    expect(html).toContain('data-partner-character-card');
    expect(html.match(/card card-character/g)?.length).toBe(2);
    // no HP / attached text rows under the partner card any more
    expect(html).not.toContain('player-partner-hp');
    expect(html).not.toContain('player-partner-attached');
    expect(html).not.toContain('Attached ');
  });

  it("levels the Partner card from the Main character's Decorations", () => {
    // Alliance Partner Modification: "Your Partner's level is determined by the
    // total Decorations attached to your Main Character." Both cards therefore
    // publish the Main character's Decorations, so the Partner's level badge
    // and skill gating advance as the Main collects trophies.
    const base = withPartner();
    const state = {
      ...base,
      seats: base.seats.map((s, i) => (i === 0 ? { ...s, decorations: 6 } : s)),
    };
    const html = renderToStaticMarkup(<CharacterCards state={state} seat={0} />);
    expect(html.match(/data-decorations="6"/g)?.length).toBe(2);
  });

  it('fans the attached infected out to the right of the character card', () => {
    const html = renderToStaticMarkup(<CharacterCards state={withPartner()} seat={0} />);
    // the partner has one trophy, the main character none
    expect(html).toContain('data-partner-attached-fan="1"');
    expect(html).not.toContain('data-attached-fan=');
    // the trophy is a real card in the fan, art-only like the hand
    expect(html).toMatch(/class="card card-weapon[^"]*card-art-only"/);
    // the overlap is published as a fraction of the card width for the CSS
    expect(html).toContain(`--cc-overlap:${attachedOverlap(0)}`);
    expect(html).toContain(`--cc-overlap:${attachedOverlap(1)}`);
  });

  it('grows the trophy fan overlap with the number of attached cards', () => {
    const one = renderToStaticMarkup(<CharacterCards state={withPartner()} seat={0} />);
    expect(one).toContain(`--cc-overlap:${attachedOverlap(1)}`); // the partner's trophy
    // a seat with four trophies must overlap more than one with a single trophy
    const state = twoPlayerState();
    const ids = ['ma-001#1', 'ma-002#2', 'ma-003#3', 'ma-004#4'];
    const four = {
      ...state,
      cards: {
        ...state.cards,
        ...Object.fromEntries(ids.map(id => [id, { instanceId: id, cardId: id.slice(0, 6), location: { zone: 'attached' as const, index: 0, seat: 0 } }])),
      },
      seats: state.seats.map((s, i) => (i === 0 ? { ...s, attached: ids } : s)),
    };
    const html = renderToStaticMarkup(<CharacterCards state={four} seat={0} />);
    expect(html).toContain('data-attached-fan="4"');
    expect(html).toContain(`--cc-overlap:${attachedOverlap(4)}`);
    expect(Number(attachedOverlap(4))).toBeGreaterThan(Number(attachedOverlap(1)));
    // and it is capped, so a long row can never stack backwards
    expect(Number(attachedOverlap(50))).toBeLessThanOrEqual(0.85);
  });

  it('shows each card\'s attached count as a badge, in the style of a zone-pile count', () => {
    const html = renderToStaticMarkup(<CharacterCards state={withPartner()} seat={0} />);
    expect(html).toContain('data-attached-count');
    expect(html).toContain('data-partner-attached-count');
    expect(html.match(/class="cc-attached"/g)?.length).toBe(2);
    // the partner has one infected attached, the main character none
    expect(html).toMatch(/data-partner-attached-count[^>]*>\s*1\s*</);
    expect(html).toMatch(/data-attached-count[^>]*>\s*0\s*</);
  });
});

describe('playFromHand', () => {
  it('dispatches nothing for a weapon — weapons are played as part of an Explore', () => {
    const state = twoPlayerState();
    const weapon = state.seats[0]?.hand.find(id => defForInstance(state, id)?.type === 'weapon');
    expect(weapon).toBeDefined();
    if (weapon === undefined) return;
    const dispatched: Action[] = [];
    playFromHand(state, 0, weapon, a => dispatched.push(a));
    expect(dispatched).toEqual([]);
  });

  it('still routes actions, items and ammunition to their own action kind', () => {
    const state = twoPlayerState();
    const seat = state.seats[0];
    expect(seat).toBeDefined();
    if (seat === undefined) return;
    const find = (type: string): string | undefined =>
      seat.hand.find(id => defForInstance(state, id)?.type === type);
    const cases: Array<[string | undefined, Action['type']]> = [
      [find('action'), 'playActionCard'],
      [find('item'), 'playItem'],
      [find('ammunition'), 'playAmmo'],
    ];
    for (const [instanceId, expected] of cases) {
      if (instanceId === undefined) continue;
      const dispatched: Action[] = [];
      playFromHand(state, 0, instanceId, a => dispatched.push(a));
      expect(dispatched).toEqual([{ type: expected, seat: 0, instanceId }]);
    }
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
    expect(html).toContain('Your table');
    // every OTHER seat gets a panel; the viewing player's own panel is not
    // repeated on the board because the action bar already shows it all
    expect((html.match(/class="player-panel/g) ?? []).length).toBe(1);
    expect(html).not.toContain('data-me="true"');
    expect(html).toContain('data-seat="1"');
    // at least one purchasable pile shows a gold cost
    expect(html).toMatch(/\d+g/);
    // flight layer mounts with zero active flights (SSR-safe)
    expect(html).toContain('data-flight-count="0"');
  });
});

describe('MansionReveal', () => {
  it('renders the revealed card, result text and a Continue button', () => {
    const monster = PREMIER_CARDS.find(c => c.type === 'infected');
    expect(monster).toBeDefined();
    if (monster === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal def={monster} resultText="Defeated! +4 ★" damage={35} onContinue={() => {}} />
    );
    expect(html).toContain('data-mansion-door');
    expect(html).toContain('The door creaks open');
    expect(html).toContain(monster.name);
    expect(html).toContain('Defeated! +4 ★');
    expect(html).toContain('Your damage:');
    expect(html).toContain('35');
    expect(html).toContain('Continue');
  });

  it('renders the weapons used when provided', () => {
    const monster = PREMIER_CARDS.find(c => c.type === 'infected');
    const knife = PREMIER_CARDS.find(c => c.id === 'we-004');
    const shotgun = PREMIER_CARDS.find(c => c.id === 'we-011');
    expect(monster).toBeDefined();
    expect(knife).toBeDefined();
    if (monster === undefined || knife === undefined || shotgun === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal def={monster} resultText="Defeated!" damage={30} weapons={[knife, shotgun]} onContinue={() => {}} />
    );
    expect(html).toContain('data-reveal-weapons');
    expect(html).toContain('Weapons used:');
    expect(html).toContain('Combat Knife');
    expect(html).toContain(shotgun.name);
  });

  it('omits the weapons row when no weapons were used', () => {
    const monster = PREMIER_CARDS.find(c => c.type === 'infected');
    if (monster === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal def={monster} resultText="Defeated!" damage={30} weapons={[]} onContinue={() => {}} />
    );
    expect(html).not.toContain('data-reveal-weapons');
  });

  it('renders the exploring character and Partner to the left of the weapons', () => {
    const monster = PREMIER_CARDS.find(c => c.type === 'infected');
    const leon = PREMIER_CARDS.find(c => c.id === 'ch-001');
    const partner = PREMIER_CARDS.find(c => c.type === 'character' && c.id !== 'ch-001');
    const knife = PREMIER_CARDS.find(c => c.type === 'weapon');
    if (monster === undefined || leon === undefined || partner === undefined || knife === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal
        def={monster}
        resultText="Defeated!"
        damage={30}
        weapons={[knife]}
        party={[{ def: leon, leader: true, hp: 70, maxHp: 80 }, { def: partner, leader: false }]}
        onContinue={() => {}}
      />
    );
    expect(html).toContain('data-reveal-party');
    expect(html).toContain('data-leader="true"');
    expect(html).toContain('LED');
    // Both character cards are present.
    expect(html.match(/card card-character/g)?.length).toBe(2);
  });

  it('shows a progress counter and a Next button for a multi-card reveal', () => {
    const monster = PREMIER_CARDS.find(c => c.type === 'infected');
    if (monster === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal def={monster} resultText="Defeated!" damage={30} index={0} total={3} onContinue={() => {}} />
    );
    expect(html).toContain('data-reveal-progress');
    expect(html).toContain('1 / 3');
    expect(html).toContain('Next');
  });

  it('reads Continue on the last card of a multi-card reveal', () => {
    const monster = PREMIER_CARDS.find(c => c.type === 'infected');
    if (monster === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal def={monster} resultText="Defeated!" damage={30} index={2} total={3} onContinue={() => {}} />
    );
    expect(html).toContain('3 / 3');
    expect(html).not.toContain('Next');
    expect(html).toContain('Continue');
  });

  it('renders a revealed non-Infected card with its prompt and locks Continue', () => {
    const item = PREMIER_CARDS.find(c => c.type === 'item');
    if (item === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal
        def={item}
        resultText={`${item.name} is revealed — answer the choice below to continue.`}
        damage={0}
        prompts={[
          {
            id: 'p1',
            seat: 0,
            text: 'Take it or send it to the bottom of the Mansion?',
            options: ['Take', 'Send to bottom of Mansion'],
            payload: { kind: 'takeOrBottom', instanceId: item.id },
          },
        ]}
        onContinue={() => {}}
      />
    );
    expect(html).toContain('You found something');
    expect(html).toContain('data-reveal-prompts');
    expect(html).toContain('Take it or send it to the bottom of the Mansion?');
    expect(html).toContain('data-option="0"');
    expect(html).toContain('Send to bottom of Mansion');
    expect(html).toContain('data-reveal-locked="true"');
    expect(html).toContain('Answer the choice above to continue.');
  });

  it('leaves Continue enabled when the reveal opened no prompt', () => {
    const monster = PREMIER_CARDS.find(c => c.type === 'infected');
    if (monster === undefined) return;
    const html = renderToStaticMarkup(
      <MansionReveal def={monster} resultText="Defeated!" damage={30} prompts={[]} onContinue={() => {}} />
    );
    expect(html).not.toContain('data-reveal-prompts');
    expect(html).not.toContain('data-reveal-locked');
    expect(html).toContain('Continue');
  });
});

describe('YouDiedOverlay', () => {
  it('renders YOU DIED with the downed subtitle for downed players', () => {
    const html = renderToStaticMarkup(<YouDiedOverlay dead={false} onContinue={() => {}} />);
    expect(html).toContain('YOU DIED');
    expect(html).toContain('data-you-died="downed"');
    expect(html).toContain('revive');
    expect(html).toContain('Continue');
  });

  it('renders the death subtitle for dead players', () => {
    const html = renderToStaticMarkup(<YouDiedOverlay dead onContinue={() => {}} />);
    expect(html).toContain('data-you-died="dead"');
    expect(html).toContain('dead');
  });
});

describe('SeatSwap (M4-T10)', () => {
  it('pass mode names the next player and hides nothing until tapped', () => {
    const html = renderToStaticMarkup(
      <SeatSwap mode="pass" nextName="Jill" onContinue={() => {}} />
    );
    expect(html).toContain('PASS THE DEVICE');
    expect(html).toContain('Jill');
    expect(html).toContain('Reveal my hand');
  });

  it('gameOver mode lists the winners by name', () => {
    const html = renderToStaticMarkup(
      <SeatSwap mode="gameOver" winners={[1]} playerNames={['Chris', 'Jill']} onContinue={() => {}} />
    );
    expect(html).toContain('CHAMPION');
    expect(html).toContain('Jill');
    expect(html).toContain('Back to lobby');
  });

  it('gameOver with multiple winners reads as a shared victory', () => {
    const html = renderToStaticMarkup(
      <SeatSwap mode="gameOver" winners={[0, 2]} playerNames={['A', 'B', 'C']} onContinue={() => {}} />
    );
    expect(html).toContain('SHARED VICTORY');
    expect(html).toContain('A &amp; C');
  });
});

describe('ActionBar (T07)', () => {
  it('renders the log button when onOpenLog is provided, not otherwise', () => {
    const state = twoPlayerState();
    const withLog = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} onOpenLog={() => {}} logOpen={false} />);
    expect(withLog).toContain('data-log-button');
    expect(withLog).toContain('data-log-open="false"');
    expect(withLog).toContain('Log');
    const without = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} />);
    expect(without).not.toContain('data-log-button');
  });

  it('shows the lastError toast in the action bar', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} lastError="playItem: Chris cannot be healed" />);
    expect(html).toContain('data-action-error');
    expect(html).toContain('Chris cannot be healed');
  });

  it('hides the error toast when lastError is null', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} lastError={null} />);
    expect(html).not.toContain('data-action-error');
  });

  it('marks the log button as open when logOpen is set', () => {
    const state = twoPlayerState();
    const html = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} onOpenLog={() => {}} logOpen />);
    expect(html).toContain('data-log-open="true"');
  });

  it('shows the connection status and room code as chips in the stats bar', () => {
    const state = twoPlayerState();
    const online = renderToStaticMarkup(
      <ActionBar state={state} seat={0} onAction={() => {}} status="connected" roomCode="ABC123" />,
    );
    expect(online).toContain('data-app-status="connected"');
    expect(online).toContain('app-status-connected');
    expect(online).toContain('app-room');
    expect(online).toContain('ABC123');
    // they sit inside the stats bar now, not a separate corner group
    const statsIdx = online.indexOf('action-stats');
    const roomIdx = online.indexOf('app-room');
    const statusIdx = online.indexOf('app-status-connected');
    expect(statsIdx).toBeGreaterThan(-1);
    expect(roomIdx).toBeGreaterThan(statsIdx);
    expect(statusIdx).toBeGreaterThan(statsIdx);
    expect(online).not.toContain('dock-status');
    // pass-and-play has no room code, and the status span is absent when not passed
    const offline = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} />);
    expect(offline).not.toContain('app-status-');
    expect(offline).not.toContain('app-room');
  });

  it('shows the turn number and the total decorations held by every player', () => {
    const base = twoPlayerState();
    const state: GameState = {
      ...base,
      turnNumber: 9,
      seats: base.seats.map((p, i) => ({ ...p, decorations: i === 0 ? 6 : 4 })),
    };
    const html = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} />);
    expect(html).toContain('data-stat="turn"');
    expect(html).toMatch(/data-stat="turn"[^>]*>.*?<strong>9<\/strong>/);
    expect(html).toContain('data-stat="decorations"');
    // 6 + 4 across both seats, not just the viewing player's 6
    expect(html).toMatch(/data-stat="decorations"[^>]*>.*?<strong>10<\/strong>/);
  });

  it('puts the character/partner cards and the deck/hand/discard between the stats and the buttons', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    const html = renderToStaticMarkup(<ActionBar state={state} seat={0} onAction={() => {}} />);
    const at = (needle: string): number => html.indexOf(needle);
    const statsIdx = at('action-stats');
    const charIdx = at('data-character-card');
    const deckIdx = at('data-anim-zone="deck"');
    const handIdx = at('class="hand"');
    const discardIdx = at('data-anim-zone="discard"');
    const buttonsIdx = at('action-buttons');
    for (const [label, i] of [['stats', statsIdx], ['char', charIdx], ['deck', deckIdx], ['hand', handIdx], ['discard', discardIdx], ['buttons', buttonsIdx]] as const) {
      expect(i, label).toBeGreaterThan(-1);
    }
    // left to right: stats, character, deck, hand, discard, buttons
    expect(charIdx).toBeGreaterThan(statsIdx);
    expect(deckIdx).toBeGreaterThan(charIdx);
    expect(handIdx).toBeGreaterThan(deckIdx);
    expect(discardIdx).toBeGreaterThan(handIdx);
    expect(buttonsIdx).toBeGreaterThan(discardIdx);
    // the hand still renders one playable button per card
    expect((html.match(/class="hand-card"/g) ?? []).length).toBe(player.hand.length);
  });

  it('offers end turn on my turn and disables explore with no legal combo', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    // revoke explores so no explore is legal (deterministic: empty the pool)
    const noExplore = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, exploresLeft: 0 } : s)) };
    const html = renderToStaticMarkup(<ActionBar state={noExplore} seat={0} onAction={() => {}} />);
    expect(html).toContain('End turn');
    expect(html).not.toContain('data-explore-button'); // no legal explore action
  });

  it('offers explore when weapons make it legal', () => {
    const state = twoPlayerState();
    // turnAmmo is 0 until an Ammo card is played, so the raw fixture has no
    // legal explore — arm the pool (as playing Ammo x10 would) to make the
    // Handgun explore legal.
    const armed = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, turnAmmo: 30 } : s)) };
    const html = renderToStaticMarkup(<ActionBar state={armed} seat={0} onAction={() => {}} />);
    expect(html).toContain('data-explore-button');
    expect(html).toContain('data-weapons="1"');
  });

  it('explore click dispatches the fullest legal weapon combo', () => {
    const state = twoPlayerState();
    // Handgun (10 dmg, 20 ammo) + Survival Knife (5 dmg, 0 ammo): with 30 ammo
    // in the pool every non-empty subset is legal, so the fullest combo (both
    // weapons) is the one the button must send.
    const knifeInst = 'we-004#99';
    // The starting Handgun's instance id comes from setup (seat-scoped since
    // the starting-deck id fix), so look it up instead of hardcoding it.
    const handgunInst = state.seats[0]?.hand.find(id => state.cards[id]?.cardId === 'we-009');
    expect(handgunInst).toBeDefined();
    const armed = {
      ...state,
      cards: { ...state.cards, [knifeInst]: { instanceId: knifeInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } } },
      seats: state.seats.map((s, i) =>
        i === 0 ? { ...s, hand: [...s.hand, knifeInst], turnAmmo: 30 } : s,
      ),
    };
    // The component holds its selection in React state, so the dispatch is
    // asserted through the pure picker logic the button is wired to.
    expect(bestExploreCombo(armed, 0)).toEqual([handgunInst, knifeInst]);
    const evalResult = evaluateExploreCombo(armed, 0, [handgunInst as string, knifeInst]);
    expect(evalResult.legal).toBe(true);
    expect(evalResult.damage).toBe(15);
    expect(evalResult.ammo).toBe(20);
  });

  it('explore picker offers a weapon in the play area again when an ability allows it', () => {
    // Leon L2 (pistolsTwicePerTurn): after exploring with the Handgun it moves
    // to the play area, and the picker must still offer it as a second use.
    const pistolInst = 'we-009#77';
    const armed = withWeapon(leonState(), 'we-009', pistolInst);
    const after = applyAction(
      { ...armed, seats: armed.seats.map((s, i) => (i === 0 ? { ...s, turnAmmo: 30 } : s)) },
      { type: 'explore', seat: 0, weapons: [pistolInst], exploreCount: 1 },
    );
    const options = exploreWeaponOptions(after, 0);
    expect(options.map(o => o.instanceId)).toContain(pistolInst);
    const opt = options.find(o => o.instanceId === pistolInst);
    expect(opt?.reusable).toBe(true);
    expect(opt?.remainingUses).toBe(1);
  });

  it('explore picker marks a weapon exhausted once it has been used twice', () => {
    const pistolInst = 'we-009#77';
    let s: GameState = withWeapon(leonState(), 'we-009', pistolInst);
    s = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 60, exploresLeft: 3 } : p)),
    };
    // Two explores with the pistol are already in the log this turn.
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [pistolInst], exploreCount: 1 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [pistolInst], exploreCount: 1 });
    const options = exploreWeaponOptions(s, 0);
    expect(options.map(o => o.instanceId)).not.toContain(pistolInst);
  });

  it('explore picker prices a double use: double damage, double ammo', () => {
    // Leon L2 official FAQ: "you can pay its ammo requirement twice for that
    // weapon to apply its effect and damage twice."
    const pistolInst = 'we-009#77';
    const armed = withWeapon(leonState(), 'we-009', pistolInst);
    const s = {
      ...armed,
      seats: armed.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 60, exploresLeft: 2 } : p)),
    };
    const opt = exploreWeaponOptions(s, 0).find(o => o.instanceId === pistolInst);
    expect(opt?.remainingUses).toBe(2);

    const once = evaluateExploreCombo(s, 0, [pistolInst]);
    expect(once.legal).toBe(true);
    expect(once.damage).toBe(10);
    expect(once.ammo).toBe(10);

    const twice = evaluateExploreCombo(s, 0, [pistolInst, pistolInst]);
    expect(twice.legal).toBe(true);
    expect(twice.damage).toBe(20);
    expect(twice.ammo).toBe(20);
  });

  it('toggleWeaponDouble switches a weapon between one and two uses', () => {
    expect(toggleWeaponDouble([], 'w', 2)).toEqual(['w', 'w']);
    expect(toggleWeaponDouble(['w'], 'w', 2)).toEqual(['w', 'w']);
    expect(toggleWeaponDouble(['w', 'w'], 'w', 2)).toEqual([]);
    // A weapon with only one use left can never be doubled.
    expect(toggleWeaponDouble([], 'w', 1)).toEqual(['w']);
    // Other selections are preserved.
    expect(toggleWeaponDouble(['k'], 'w', 2)).toEqual(['k', 'w', 'w']);
  });

  it('explore picker disables the explore action when the selection is unaffordable', () => {
    const state = twoPlayerState();
    const knifeInst = 'we-004#99';
    const armed = {
      ...state,
      cards: { ...state.cards, [knifeInst]: { instanceId: knifeInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } } },
      seats: state.seats.map((s, i) =>
        i === 0 ? { ...s, hand: [...s.hand, knifeInst], turnAmmo: 5 } : s,
      ),
    };
    // Handgun needs 20 ammo; with 5 in the pool that combo is not legal.
    const result = evaluateExploreCombo(armed, 0, ['we-009#1']);
    expect(result.legal).toBe(false);
    expect(result.reason).toContain('Not enough ammo');
    // The affordable weapon is still offered and legal.
    expect(evaluateExploreCombo(armed, 0, [knifeInst]).legal).toBe(true);
  });

  it('renders the weapon picker with per-weapon stats and a reuse badge', () => {
    const state = twoPlayerState();
    const knifeInst = 'we-004#99';
    const armed = {
      ...state,
      cards: { ...state.cards, [knifeInst]: { instanceId: knifeInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } } },
      seats: state.seats.map((s, i) =>
        i === 0 ? { ...s, hand: [...s.hand, knifeInst], turnAmmo: 30 } : s,
      ),
    };
    const html = renderToStaticMarkup(<ActionBar state={armed} seat={0} onAction={() => {}} />);
    expect(html).toContain('data-explore-choose');
    expect(html).toContain('data-combos="4"'); // 2 weapons -> 3 non-empty subsets + the unarmed explore
  });

  it('shows a waiting note off turn', () => {
    const state = twoPlayerState();
    // seat 1 is active: don't call startTurn again — construct by switching active seat
    const otherTurn = { ...state, activeSeat: 1 };
    const html = renderToStaticMarkup(<ActionBar state={otherTurn} seat={0} onAction={() => {}} />);
    expect(html).toContain('Waiting for');
  });

  it('offers a manual character-ability button once the level unlocks it', () => {
    // Barry (ch-005) L1 = plusDamageThisTurn; force level 1 (2 decorations).
    const s = startTurn(
      setup(
        { seed: 11, players: [{ name: 'Barry', controller: 'human', characterCardId: 'ch-005' }, { name: 'Bot', controller: 'bot' }] },
        PREMIER_CARDS,
        FIRST_TIMER_PILES,
      ),
    );
    // level 0: no ability button
    const html0 = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html0).not.toContain('data-ability-index');
    // level 1: the ability button appears with the card text
    const leveled = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 2 } : p)),
    };
    const html1 = renderToStaticMarkup(<ActionBar state={leveled} seat={0} onAction={() => {}} />);
    expect(html1).toContain('action-btn action-btn-secondary');
    expect(html1).toContain('data-ability-index="0"');
    expect(html1).toContain('Ability:');
    expect(html1).toContain('+5 damage');
  });

  it("labels a Partner's manual ability button from the Partner's own card", () => {
    // Alliance Partner Modification: the Partner's abilities are the player's
    // too, so its manual abilities get their own button, labelled as the
    // Partner's rather than the Main character's.
    const base = twoPlayerState();
    const partnerCharInst = 'ch-005#p1';
    const armed: GameState = {
      ...base,
      cardDefs: {
        ...base.cardDefs,
        'ch-005': {
          ...(base.cardDefs['ch-005'] as CardDef),
          level1At: 0,
          abilities: [{ kind: 'plusDamageThisTurn' as const, amount: 5, level: 1 as const }],
        },
      },
      cards: {
        ...base.cards,
        [partnerCharInst]: { instanceId: partnerCharInst, cardId: 'ch-005', location: { zone: 'attached' as const, index: 0, seat: 0 } },
      },
      seats: base.seats.map((s, i) => (i === 0
        ? { ...s, partnerInstanceId: partnerCharInst, partnerAttached: [], level: 0, decorations: 0 }
        : s)),
    };
    const html = renderToStaticMarkup(<ActionBar state={armed} seat={0} onAction={() => {}} />);
    expect(html).toContain('data-ability-character="partner"');
    expect(html).toContain('Partner:');
    expect(html).toContain('+5 damage');
  });

  it('explore count options are bounded by the pool and the Mansion', () => {
    const state = twoPlayerState();
    const armed = {
      ...state,
      seats: state.seats.map((s, i) => (i === 0 ? { ...s, turnAmmo: 30, exploresLeft: 5 } : s)),
    };
    // The starting Mansion has fewer than 5 cards in this fixture, so the cap
    // is the Mansion size, not the pool.
    const options = exploreCountOptions(armed, 0);
    expect(options[0]).toBe(1);
    expect(options.length).toBe(Math.min(5, armed.mansionDeck.length));
    expect(options.length).toBeGreaterThan(1);
  });

  it('evaluateExploreCombo rejects an explore count above the pool', () => {
    const state = twoPlayerState();
    const handgunInst = state.seats[0]?.hand.find(id => state.cards[id]?.cardId === 'we-009');
    expect(handgunInst).toBeDefined();
    const armed = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, turnAmmo: 30, exploresLeft: 2 } : s)) };
    const result = evaluateExploreCombo(armed, 0, [handgunInst as string], 3);
    expect(result.legal).toBe(false);
    expect(result.reason).toContain('Not enough explores');
    // The same combo with a legal count is fine.
    expect(evaluateExploreCombo(armed, 0, [handgunInst as string], 2).legal).toBe(true);
  });

  it('explore count options include the Explores the selected weapons grant', () => {
    const state = twoPlayerState();
    const shotgun = 'we-013#t1';
    const base = withWeapon(state, 'we-013', shotgun);
    const armed = { ...base, seats: base.seats.map((s, i) => (i === 0 ? { ...s, turnAmmo: 40, exploresLeft: 1 } : s)) };
    // 1 Explore left + 1 granted by the Pump-Action Shotgun = 2.
    expect(Math.max(...exploreCountOptions(armed, 0, [shotgun]))).toBe(2);
    // Without it, the pool is just the 1 Explore left.
    expect(Math.max(...exploreCountOptions(armed, 0, []))).toBe(1);
  });

  it('shows the granted-Explore hint when a granting weapon is in the combo', () => {
    const state = twoPlayerState();
    const shotgun = 'we-013#t1';
    const base = withWeapon(state, 'we-013', shotgun);
    const armed = { ...base, seats: base.seats.map((s, i) => (i === 0 ? { ...s, turnAmmo: 40, exploresLeft: 1 } : s)) };
    const html = renderToStaticMarkup(<ActionBar state={armed} seat={0} onAction={() => {}} />);
    expect(html).toContain('data-explore-granted-hint');
    expect(html).toContain('Pump-Action Shotgun');
  });

  it('prices the explore preview with the selected leader abilities', () => {
    const state = twoPlayerState();
    const partnerInst = 'we-004#77';
    const partnerCharInst = 'ch-002#p1';
    const handgunInst = state.seats[0]?.hand.find(id => state.cards[id]?.cardId === 'we-009');
    expect(handgunInst).toBeDefined();
    // Give the Partner Leon S. Kennedy L1: all Pistol weapons -10 Ammo. The
    // Handgun costs 20, so the Main-led explore is unaffordable with 10 Ammo
    // while the Partner-led one is exactly payable.
    const armed = {
      ...state,
      cardDefs: {
        ...state.cardDefs,
        'ch-002': {
          ...(state.cardDefs['ch-002'] as CardDef),
          level1At: 0,
          abilities: [{ kind: 'ammoReqReduction' as const, tag: 'pistol' as const, amount: 10, level: 1 as const }],
        },
      },
      cards: {
        ...state.cards,
        [partnerCharInst]: { instanceId: partnerCharInst, cardId: 'ch-002', location: { zone: 'attached' as const, index: 0, seat: 0 } },
        [partnerInst]: { instanceId: partnerInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } },
      },
      seats: state.seats.map((s, i) => (i === 0
        ? { ...s, partnerInstanceId: partnerCharInst, partnerAttached: [partnerInst], turnAmmo: 10 }
        : s)),
    };
    const mainLed = evaluateExploreCombo(armed, 0, [handgunInst as string], 1, 'main');
    const partnerLed = evaluateExploreCombo(armed, 0, [handgunInst as string], 1, 'partner');
    expect(mainLed.legal).toBe(false);
    expect(partnerLed.legal).toBe(true);
    expect(mainLed.ammo).toBe(20);
    expect(partnerLed.ammo).toBe(10);
    // The weapon list prices the same way.
    const partnerPriced = exploreWeaponOptions(armed, 0, 'partner')
      .find(o => o.instanceId === handgunInst);
    expect(partnerPriced?.ammo).toBe(10);
  });

  it('explore picker marks a partner-attached weapon and keeps it out of the hand', () => {
    const state = twoPlayerState();
    const partnerInst = 'we-004#77';
    const withPartner = {
      ...state,
      cards: { ...state.cards, [partnerInst]: { instanceId: partnerInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } } },
      seats: state.seats.map((s, i) => (i === 0
        ? { ...s, partnerInstanceId: 'ch-002#p1', partnerAttached: [partnerInst], turnAmmo: 30 }
        : s)),
    };
    const options = exploreWeaponOptions(withPartner, 0);
    const opt = options.find(o => o.instanceId === partnerInst);
    expect(opt).toBeDefined();
    expect(opt?.partner).toBe(true);
    // The partner weapon is offered even though it is not in the hand.
    expect(withPartner.seats[0]?.hand).not.toContain(partnerInst);
  });

  it('renders the explore-count selector and the partner leader toggle', () => {
    const state = twoPlayerState();
    const partnerInst = 'we-004#77';
    const armed = {
      ...state,
      cards: { ...state.cards, [partnerInst]: { instanceId: partnerInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } } },
      seats: state.seats.map((s, i) => (i === 0
        ? { ...s, partnerInstanceId: 'ch-002#p1', partnerAttached: [partnerInst], turnAmmo: 30, exploresLeft: 3 }
        : s)),
    };
    const html = renderToStaticMarkup(<ActionBar state={armed} seat={0} onAction={() => {}} />);
    expect(html).toContain('data-explore-count');
    expect(html).toContain('data-explore-count-option="2"');
    expect(html).toContain('data-explore-leader');
    expect(html).toContain('data-leader-option="partner"');
  });

  it('falls back to the Main character once the Partner is gone', () => {
    // Regression: the ActionBar's leader selection is component state and
    // survives the Partner's death. While it still read 'partner', every
    // explore was priced with the (now empty) Partner abilities and sent as
    // `leader: 'partner'`, which validate rejects with "explore: no partner" -
    // the player could not explore at all on the following turn.
    const base = twoPlayerState();
    const partnerInst = 'we-004#77';
    const withPartner = {
      ...base,
      cards: { ...base.cards, [partnerInst]: { instanceId: partnerInst, cardId: 'we-004', location: { zone: 'hand' as const, index: 5, seat: 0 } } },
      seats: base.seats.map((s, i) => (i === 0
        ? { ...s, partnerInstanceId: 'ch-002#p1', partnerAttached: [partnerInst], turnAmmo: 100 }
        : s)),
    };
    expect(resolveExploreLeader(withPartner, 0, 'partner')).toBe('partner');
    // The Partner died: its instance and attachments are cleared.
    const partnerDied = {
      ...withPartner,
      seats: withPartner.seats.map((s, i) => (i === 0
        ? { ...s, partnerInstanceId: undefined, partnerAttached: undefined }
        : s)),
    };
    expect(resolveExploreLeader(partnerDied, 0, 'partner')).toBe('main');
    expect(resolveExploreLeader(partnerDied, 0, 'main')).toBe('main');
    // The fallback is what the picker prices with, so a combo that is legal
    // for the Main no longer reads as illegal.
    const { instanceId: handWeapon } = firstWeaponDef(partnerDied);
    const legal = evaluateExploreCombo(partnerDied, 0, [handWeapon], 1, resolveExploreLeader(partnerDied, 0, 'partner'));
    expect(legal.legal).toBe(true);
  });
});

describe('Lobby (T08)', () => {
  const lobbyProps = (over: Partial<Parameters<typeof Lobby>[0]> = {}) => ({
    room: null as Parameters<typeof Lobby>[0]['room'],
    clientId: null,
    status: 'connected',
    onCreateRoom: () => {},
    onJoinRoom: () => {},
    onSelectSeat: () => {},
    onAddBot: () => {},
    onRemoveBot: () => {},
    onSetScenario: () => {},
    onSetPartnerMode: () => {},
    onSetSkillSystem: () => {},
    onSetCustomCards: () => {},
    onSetMansionAttachmentMode: () => {},
    onSetCharacterSelection: () => {},
    onStart: () => {},
    onStartHotseat: () => {},
    ...over,
  });

  it('renders the create/join forms with no room', () => {
    const html = renderToStaticMarkup(<Lobby {...lobbyProps()} />);
    expect(html).toContain('Create room');
    expect(html).toContain('Join room');
    expect(html).toContain('Pass &amp; Play');
    expect(html).toContain('First Timer');
    expect(html).toContain('Classic Horror');
    expect(html).toContain('Spy Games');
    expect(html).toContain('scenario-select');
    // online play is listed first, pass & play second
    expect(html.indexOf('Create room')).toBeLessThan(html.indexOf('Pass &amp; Play'));
    expect(html.indexOf('Create room')).toBeLessThan(html.indexOf('or pass'));
  });

  it('renders seats, room code and host controls in a room', () => {
    const room = {
      roomCode: 'ABCDEF',
      phase: 'lobby' as const,
      maxSeats: 2,
      scenario: 'spyGames' as const,
      players: [
        { clientId: 'c1', name: 'Me', seat: 0, isBot: false, connected: true },
        { clientId: 'c2', name: 'Bot', seat: 1, isBot: true, connected: true },
      ],
      partnerMode: false,
      skillSystem: false,
      customCards: [],
      mansionAttachmentMode: 1 as const,
    };
    const html = renderToStaticMarkup(<Lobby {...lobbyProps({ room })} />);
    expect(html).toContain('ABCDEF');
    expect(html).toContain('Seat 0');
    expect(html).toContain('Bot');
    expect(html).toContain('Start game');
    expect(html).toContain('Spy Games');
  });

  it('lists the custom card line in an expandable picker (create-room form)', () => {
    const html = renderToStaticMarkup(<Lobby {...lobbyProps()} />);
    expect(html).toContain('data-testid="custom-cards"');
    expect(html).toContain('data-testid="custom-card-mx-001"');
    expect(html).toContain('Mr. X');
    expect(html).toContain('Custom Cards (0 selected)');
    // IT-000 Antique Coin prints a cost but is a MANSION card, so it must be
    // grouped with the Mansion cards (rendered before the Resource Area
    // section), never with the Resource Area piles.
    const coinAt = html.indexOf('data-testid="custom-card-it-000"');
    const resourceAt = html.indexOf('data-testid="custom-card-ex-002"');
    expect(coinAt).toBeGreaterThan(-1);
    expect(resourceAt).toBeGreaterThan(-1);
    expect(coinAt).toBeLessThan(resourceAt);
  });

  it('offers one Poison check instead of the four EX-006..EX-009 cards', () => {
    const html = renderToStaticMarkup(<Lobby {...lobbyProps()} />);
    expect(html).toContain('data-testid="custom-card-poison"');
    expect(html).toContain('POISON');
    for (const id of ['ex-006', 'ex-007', 'ex-008', 'ex-009']) {
      expect(html).not.toContain(`data-testid="custom-card-${id}"`);
    }
  });

  it('shows the host custom-card picker bound to the room selection', () => {
    const room = {
      roomCode: 'ABCDEF',
      phase: 'lobby' as const,
      maxSeats: 2,
      scenario: 'firstTimer' as const,
      players: [{ clientId: 'c1', name: 'Me', seat: 0, isBot: false, connected: true }],
      partnerMode: false,
      skillSystem: false,
      customCards: ['mx-001'],
      mansionAttachmentMode: 1 as const,
    };
    const html = renderToStaticMarkup(<Lobby {...lobbyProps({ room, clientId: 'c1' })} />);
    expect(html).toContain('Custom Cards (1 selected)');
    expect(html).toContain('checked');
  });

  it('offers custom characters in the host picker only when the room enabled them', () => {
    const base = {
      roomCode: 'ABCDEF',
      phase: 'lobby' as const,
      maxSeats: 2,
      scenario: 'firstTimer' as const,
      players: [{ clientId: 'c1', name: 'Me', seat: 0, isBot: false, connected: true }],
      partnerMode: false,
      skillSystem: false,
      customCards: [] as string[],
      mansionAttachmentMode: 1 as const,
    };
    const off = renderToStaticMarkup(<Lobby {...lobbyProps({ room: base, clientId: 'c1' })} />);
    expect(off).not.toContain('value="cu-001"');

    const on = renderToStaticMarkup(<Lobby {...lobbyProps({ room: { ...base, customCards: ['cu-001', 'lk-001', 'cr-001', 'cc-001', 'ci-002', 'fch-008', 'ev-001'] }, clientId: 'c1' })} />);
    expect(on).toContain('value="cu-001"');
    expect(on).toContain('value="lk-001"');
    expect(on).toContain('value="cr-001"');
    expect(on).toContain('value="cc-001"');
    expect(on).toContain('value="fch-008"');
    expect(on).toContain('Infected Crow');
    expect(on).toContain('Zombie Grab');
    expect(on).toContain('Sherry Birkin');
  });

  it('offers ch-008 as a main character but never as a partner', () => {
    const room = {
      roomCode: 'ABCDEF',
      phase: 'lobby' as const,
      maxSeats: 2,
      scenario: 'firstTimer' as const,
      players: [{ clientId: 'c1', name: 'Me', seat: 0, isBot: false, connected: true }],
      partnerMode: true,
      skillSystem: false,
      customCards: [] as string[],
      mansionAttachmentMode: 1 as const,
    };
    const html = renderToStaticMarkup(<Lobby {...lobbyProps({ room, clientId: 'c1' })} />);
    // Main character dropdown still offers Chris
    const mainSection = html.split('Main character:')[1]?.split('Partner character:')[0] ?? '';
    expect(mainSection).toContain('value="ch-008"');
    // Partner dropdown excludes him (he cannot receive attachments) but keeps
    // every other character
    const partnerSection = html.split('Partner character:')[1] ?? '';
    expect(partnerSection).not.toContain('value="ch-008"');
    expect(partnerSection).toContain('value="ch-001"');
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

describe('Mercenaries Skill draft UI', () => {
  function draftState(seed = 11): GameState {
    return setup(
      { seed, players: [{ name: 'Me', controller: 'human' }, { name: 'Bot', controller: 'bot' }], skillSystem: true },
      [...PREMIER_CARDS, ...MERCENARIES_CARDS],
      FIRST_TIMER_PILES,
    );
  }

  it('renders the opening draft prompt with the seat\'s five Skill names', () => {
    const s = draftState();
    expect(s.phase).toBe('skillDraft');
    const hand = s.skillDraft?.hands[0] ?? [];
    expect(hand).toHaveLength(5);
    const html = renderToStaticMarkup(<ActionBar state={s} seat={0} onAction={() => {}} />);
    expect(html).toContain('Skill Draft');
    // Options render as card NAMES via optionLabel, never as raw instance ids.
    for (const id of hand) {
      const def = s.cardDefs[s.cards[id]?.cardId ?? ''];
      expect(def).toBeDefined();
      expect(html).toContain(def!.name);
      expect(html).not.toContain(id);
    }
  });

  it('never leaks another seat\'s draft hand into the sanitized view', () => {
    const s = draftState();
    const view = sanitize(s, 0);
    const html = renderToStaticMarkup(<ActionBar state={view} seat={0} onAction={() => {}} />);
    for (const id of s.skillDraft?.hands[1] ?? []) {
      const def = s.cardDefs[s.cards[id]?.cardId ?? ''];
      if (def !== undefined) expect(html).not.toContain(def.name);
    }
  });

  it('advances the draft when the seat picks a Skill', () => {
    const s = draftState();
    const prompt = s.prompts.find(p => p.payload?.kind === 'skillDraftPick' && p.seat === 0);
    expect(prompt).toBeDefined();
    const next = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect(next.skillDraft?.kept[0]).toHaveLength(1);
    expect(next.prompts.some(p => p.payload?.kind === 'skillDraftPick')).toBe(true);
  });
});