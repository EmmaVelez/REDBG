import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState } from '@re/game-core';
import { setup, startTurn, applyAction, sanitize, PREMIER_CARDS, FIRST_TIMER_PILES, MERCENARIES_CARDS } from '@re/game-core';
import { ZonePile } from './ZonePile';
import { MansionReveal } from './MansionReveal';
import { YouDiedOverlay } from './YouDiedOverlay';
import { SeatSwap } from './SeatSwap';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { Hand } from './Hand';
import { Zones } from './Zones';
import { PlayerPanel } from './PlayerPanel';
import { Board } from './Board';
import { ActionBar } from './ActionBar';
import { bestExploreCombo, evaluateExploreCombo, exploreCountOptions, exploreWeaponOptions } from './explorePicker';
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
    // stat boxes read [level, absolute decoration gate] (reference frame):
    // Chris Lv1 gates at 0, Lv2 at 4
    expect(lockedHtml).toMatch(/<span class="skill-gate" data-skill-gate="true">0<\/span>/);
    expect(lockedHtml).toMatch(/<span class="skill-gate" data-skill-gate="true">4<\/span>/);
    expect((lockedHtml.match(/data-skill-gate/g) ?? []).length).toBe(2);
    // unlocked at the gate: both rows unlocked, same absolute gates shown
    const unlockedHtml = renderToStaticMarkup(<CardView def={chris} decorations={chris.level2At} />);
    expect(unlockedHtml).toContain('skill-unlocked');
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
    // fresh Leon: both rows locked, boxes show his gates (2 / 6)
    const fresh = renderToStaticMarkup(<CardView def={leon} decorations={0} />);
    expect(fresh).toContain('skill-locked');
    expect(fresh).not.toContain('skill-unlocked');
    expect(fresh).toMatch(/<span class="skill-gate" data-skill-gate="true">2<\/span>/);
    expect(fresh).toMatch(/<span class="skill-gate" data-skill-gate="true">6<\/span>/);
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
    // at 0 decorations: level 1 locked, box shows his gates (1 / 7)
    const fresh = renderToStaticMarkup(<CardView def={krauser} decorations={0} />);
    expect(fresh).toContain('skill-locked');
    expect(fresh).toMatch(/<span class="skill-gate" data-skill-gate="true">1<\/span>/);
    expect(fresh).toMatch(/<span class="skill-gate" data-skill-gate="true">7<\/span>/);
    // at 1 decoration: level 1 row unlocked, level 2 still gated
    const earned = renderToStaticMarkup(<CardView def={krauser} decorations={1} />);
    expect(earned).toContain('skill-unlocked');
    expect(earned).toContain('skill-locked');
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

  it('renders deck/discard piles flanking the hand slot and the play area', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    const html = renderToStaticMarkup(
      <Zones state={state} seat={0}>
        <Hand state={state} seat={0} onPlay={() => {}} />
      </Zones>
    );
    // deck (left) and discard (right) piles carry anchors + counts
    expect(html).toContain('data-anim-zone="deck"');
    expect(html).toContain('data-anim-zone="discard"');
    expect(html).toContain(`data-pile-count="${player.inventory.length}"`);
    expect(html).toContain(`data-pile-count="${player.discard.length}"`);
    // hand slot contains the actual hand component
    expect(html).toContain('zone-hand-slot');
    expect(html).toContain('class="hand"');
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
    expect(html).toContain('Your table');
    // every seated player gets a panel
    expect((html.match(/class="player-panel/g) ?? []).length).toBe(2);
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

  it('offers end turn on my turn and disables explore with no legal combo', () => {
    const state = twoPlayerState();
    const player = state.seats[0];
    expect(player).toBeDefined();
    if (player === undefined) return;
    // revoke explores so no explore is legal (deterministic: empty the pool)
    const noExplore = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, exploresLeft: 0 } : s)) };
    const html = renderToStaticMarkup(<ActionBar state={noExplore} seat={0} onAction={() => {}} />);
    expect(html).toContain('End turn');
    expect(html).not.toContain("explore-button"); // no legal explore action
  });

  it('offers explore when weapons make it legal', () => {
    const state = twoPlayerState();
    // turnAmmo is 0 until an Ammo card is played, so the raw fixture has no
    // legal explore — arm the pool (as playing Ammo x10 would) to make the
    // Handgun explore legal.
    const armed = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, turnAmmo: 30 } : s)) };
    const html = renderToStaticMarkup(<ActionBar state={armed} seat={0} onAction={() => {}} />);
    expect(html).toContain("explore-button");
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
    expect(html).toContain('data-combos="3"'); // 2 weapons -> 3 non-empty subsets
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
    expect(html0).not.toContain('ability-button');
    // level 1: the ability button appears with the card text
    const leveled = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 2 } : p)),
    };
    const html1 = renderToStaticMarkup(<ActionBar state={leveled} seat={0} onAction={() => {}} />);
    expect(html1).toContain('ability-button');
    expect(html1).toContain('data-ability-index="0"');
    expect(html1).toContain('Ability:');
    expect(html1).toContain('+5 damage');
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
    expect(options.length).toBe(Math.min(5, armed.mansionDeck.length + armed.mansionBottom.length));
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
    };
    const html = renderToStaticMarkup(<Lobby {...lobbyProps({ room })} />);
    expect(html).toContain('ABCDEF');
    expect(html).toContain('Seat 0');
    expect(html).toContain('Bot');
    expect(html).toContain('Start game');
    expect(html).toContain('Spy Games');
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