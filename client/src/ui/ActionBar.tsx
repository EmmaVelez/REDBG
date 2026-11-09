import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Action, GameState } from '@re/game-core';
import { enumerateLegalActions } from '@re/game-core';
import type { ConnectionStatus } from '../net/ws';
import { ActionBarStats } from './ActionBarStats';
import { CharacterCards } from './CharacterCards';
import { Hand } from './Hand';
import { ZonePile } from './ZonePile';
import { playFromHand } from './playFromHand';
import { defForInstance } from './cards';
import {
  bestExploreCombo,
  evaluateExploreCombo,
  exploreCountOptions,
  exploreWeaponOptions,
  legalExplores,
} from './explorePicker';

/** Prompt kinds whose numeric options are AMOUNTS (XP), not seat indices. */
const AMOUNT_KINDS = new Set(['we046ChooseAmount', 'skillRemoveXpAmount']);

/** Action types the rest of the UI already exposes (Hand / Board / SkillPanel /
 *  ActionBar). Any OTHER legal action is rendered as a generic button in the
 *  ActionBar so no legal action is ever unreachable — currently Outbreak
 *  `attack` and Alliance `attachToPartner`. */
const UI_HANDLED_ACTION_TYPES = new Set<Action['type']>([
  'playActionCard', 'playItem', 'playAmmo', 'explore', 'buy',
  'useCharacterAbility', 'useWeaponAbility', 'moveXp', 'useSkill',
  'removeAttachedItem', 'endTurn', 'chooseOption',
]);

/**
 * M4-T07: ActionBar — turn-level controls derived from the engine's own
 * legal-action enumeration (the server validates anything we dispatch, so
 * this is a convenience layer, not an authority).
 *
 * - End Turn, when legal
 * - Explore, when at least one explore action is legal. The player can fire
 *   the fullest legal combo in one click, or open the picker to choose which
 *   weapons to use — including weapons an ability lets them use again this
 *   turn (Leon L2 pistols), which sit in the play area.
 * - Prompt resolution (chooseOption) when a prompt awaits this seat
 * - Card-level play/buy remain click-driven (Hand / Board market piles)
 */

export interface ActionBarProps {
  readonly state: GameState;
  readonly seat: number;
  readonly onAction: (action: Action) => void;
  /** Disable all controls (e.g. not my turn / game over). */
  readonly disabled?: boolean;
  /** Last server rejection/error — surfaced as a toast so it is visible even
   *  when the game log sidebar is closed. */
  readonly lastError?: string | null;
  /** When provided, render a Log button that calls this (opens the log sidebar). */
  readonly onOpenLog?: () => void;
  /** Whether the log sidebar is currently open (button shows active state). */
  readonly logOpen?: boolean;
  /** Connection status, shown in the dock's lower-right corner. */
  readonly status?: ConnectionStatus;
  /** Room code, shown beside the status (null/undefined in pass-and-play). */
  readonly roomCode?: string | null;
}

export function ActionBar({ state, seat, onAction, disabled = false, lastError, onOpenLog, logOpen = false, status, roomCode = null }: ActionBarProps): JSX.Element {
  const legal = enumerateLegalActions(state, seat);
  const canEndTurn = legal.some(a => a.type === 'endTurn' && a.seat === seat);
  const explores = legalExplores(state, seat);
  // Every prompt awaiting this seat, in queue order — chained prompts (a
  // resolver that raises the next step) must all be visible, not just the first.
  const prompts = state.prompts.filter(p => p.seat === seat);
  const prompt = prompts[0];

  // Weapons usable in an explore: hand weapons plus any play-area weapon an
  // ability lets this seat use again (Leon L2 pistolsTwicePerTurn).
  const weaponOptions = exploreWeaponOptions(state, seat);
  const best = bestExploreCombo(state, seat);

  const [selected, setSelected] = useState<readonly string[]>(() => best ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const handScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollHand = (direction: -1 | 1): void => {
    handScrollRef.current?.scrollBy({ left: direction * 200, behavior: 'smooth' });
  };
  // Multi-explore: how many of the seat's remaining Explores this action spends.
  const [exploreCount, setExploreCount] = useState(1);
  // Alliance Partner Modification: who leads (takes the damage on a failed
  // explore). Defaults to the Main character.
  const [leader, setLeader] = useState<'main' | 'partner'>('main');

  // Re-pick the default combo when the available weapons change (an explore
  // moves a weapon to the play area; end of turn clears it) or when the best
  // combo itself changes (ammo spent). The player's manual edits survive any
  // state change that leaves both untouched.
  const availableKey = weaponOptions.map(o => o.instanceId).join(',');
  const bestKey = best === null ? '' : [...best].sort().join(',');
  useEffect(() => {
    setSelected(best ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableKey, bestKey]);

  const combo = evaluateExploreCombo(state, seat, selected, exploreCount);
  const canExplore = explores.length > 0 && prompt === undefined;
  const exploreCounts = exploreCountOptions(state, seat);
  const exploreCountsKey = exploreCounts.join(',');
  useEffect(() => {
    const max = exploreCounts[exploreCounts.length - 1] ?? 1;
    if (exploreCount > max) setExploreCount(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploreCountsKey]);

  // WE-025 Blowback Pistol: "Discard any number of 'Pistol' cards from hand to
  // play. +10 damage per card discarded." Offered only while a Blowback Pistol
  // is part of the selected explore.
  const blowbackArmed = selected.some(id => defForInstance(state, id)?.weaponEffects?.some(
    e => e.kind === 'discardPistolsForDamage') === true);
  const pistolOptions = blowbackArmed
    ? (state.seats[seat]?.hand ?? []).filter(id => {
        const def = defForInstance(state, id);
        return def?.type === 'weapon' && (def.weaponTags ?? []).includes('pistol') && !selected.includes(id);
      })
    : [];
  const [discardPistols, setDiscardPistols] = useState<readonly string[]>([]);

  const toggleDiscardPistol = (instanceId: string): void => {
    setDiscardPistols(prev => (prev.includes(instanceId) ? prev.filter(id => id !== instanceId) : [...prev, instanceId]));
  };

  const toggleWeapon = (instanceId: string): void => {
    setSelected(prev => (prev.includes(instanceId) ? prev.filter(id => id !== instanceId) : [...prev, instanceId]));
  };

  // Character abilities the engine says are legal right now (unlocked level,
  // targets available, not already used this turn). Label from the character
  // card's level text when resolvable.
  const abilities = legal.filter((a): a is Extract<Action, { type: 'useCharacterAbility' }> => a.type === 'useCharacterAbility' && a.seat === seat);
  const weaponAbilities = legal.filter((a): a is Extract<Action, { type: 'useWeaponAbility' }> => a.type === 'useWeaponAbility' && a.seat === seat);
  const attachedItems = legal.filter((a): a is Extract<Action, { type: 'removeAttachedItem' }> => a.type === 'removeAttachedItem' && a.seat === seat);
  // Legal actions the rest of the UI does not expose (Outbreak attack, Alliance
  // attachToPartner) — rendered as generic buttons so they stay reachable.
  const extraActions = legal.filter(a => 'seat' in a && a.seat === seat && !UI_HANDLED_ACTION_TYPES.has(a.type));
  const extraLabel = (a: Action): string => {
    if (a.type === 'attack') {
      const target = state.seats[a.targetSeat];
      const weapon = a.weaponInstanceId !== undefined ? defForInstance(state, a.weaponInstanceId)?.name : undefined;
      const infect = (a.infectionCardIds?.length ?? 0) > 0 ? ' + infection card' : '';
      return `Attack ${target?.name ?? `seat ${a.targetSeat}`}${weapon !== undefined ? ` with ${weapon}` : ''}${infect}`;
    }
    if (a.type === 'attachToPartner') {
      const def = defForInstance(state, a.instanceId);
      return `Attach ${def?.name ?? a.instanceId} to Partner${a.replaceIndex !== undefined ? ` (replace slot ${a.replaceIndex + 1})` : ''}`;
    }
    return a.type;
  };
  const player = state.seats[seat];
  const discardTopId = player?.discard[0];
  const discardTopDef = discardTopId === undefined ? null : defForInstance(state, discardTopId);
  const charInst = player === undefined ? undefined : state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
  const abilityLabel = (abilityIndex: number): string => {
    const levelText = charDef?.levels?.find(l => l.level === (charDef.abilities?.[abilityIndex]?.level ?? 1))?.text;
    return levelText ?? 'Use ability';
  };
  // Prompt options are card instance ids, 'DONE' for multi-choice chains, seat
  // numbers for player-choice prompts (Wesker L2 target, Rebecca L1 redirect),
  // or bare amounts (XP removal). Render a readable label for each.
  const optionLabel = (opt: string, kind: unknown): string => {
    if (opt === 'DONE') return 'Done';
    // XP-amount prompts offer numbers that are amounts, NOT seat indices.
    if (typeof kind === 'string' && AMOUNT_KINDS.has(kind)) return `${opt} XP`;
    if (/^\d+$/.test(opt)) {
      const target = state.seats[Number(opt)];
      return target !== undefined ? `${target.name} (seat ${target.seat})` : opt;
    }
    const def = defForInstance(state, opt) ?? state.cardDefs[opt];
    return def?.name ?? opt;
  };
  const phaseNote = state.phase === 'gameOver' ? 'Game over'
    : state.phase === 'turnEnd' ? 'Resolving turn end…'
    : state.activeSeat === seat ? undefined
    : `Waiting for ${state.seats[state.activeSeat]?.name ?? `seat ${state.activeSeat}`}…`;

  return (
    <div className="action-bar" data-seat={seat}>
      {/* band 1 — the player's numbers */}
      <div className="action-row">
        {player !== undefined && (
          <ActionBarStats
            hp={player.hp}
            maxHp={player.maxHp}
            gold={player.turnGold}
            ammo={player.turnAmmo}
            actions={player.actionsLeft}
            buys={player.buysLeft}
          />
        )}
        {phaseNote !== undefined && <div className="action-note">{phaseNote}</div>}
      </div>

      {/* band 2 — character, deck, hand, discard */}
      {player !== undefined && (
        <div className="action-row action-identity" data-action-identity>
          <div className="action-col">
            <span className="action-col-label">Character</span>
            <CharacterCards state={state} seat={seat} />
          </div>
          <div className="action-col">
            <span className="action-col-label">Deck</span>
            <ZonePile label="Deck" count={player.inventory.length} animZone="deck" seat={seat} />
          </div>
          <div className="action-col action-col-hand">
            <div className="action-hand-scroll" ref={handScrollRef}>
              <Hand
                state={state}
                seat={seat}
                onPlay={instanceId => playFromHand(state, seat, instanceId, onAction)}
                disabled={disabled}
              />
            </div>
            <button type="button" className="hand-scroll hand-scroll-left" onClick={() => scrollHand(-1)} title="Scroll hand left" aria-label="Scroll hand left">◀</button>
            <button type="button" className="hand-scroll hand-scroll-right" onClick={() => scrollHand(1)} title="Scroll hand right" aria-label="Scroll hand right">▶</button>
          </div>
          <div className="action-col">
            <span className="action-col-label">Discard</span>
            <ZonePile label="Discard" count={player.discard.length} animZone="discard" seat={seat} topDef={discardTopDef} />
          </div>
        </div>
      )}
      {/* band 3 — prompts and the turn's actions */}
      <div className="action-row action-row-controls">
      {lastError !== undefined && lastError !== null && lastError !== '' && (
        <div className="action-error" data-action-error role="alert">{lastError}</div>
      )}

      {prompts.length > 0 && (
        <div className="action-prompts" data-prompts={prompts.length}>
          {prompts.map((p, promptIndex) => (
            <div key={p.id} className="action-prompt" data-prompt={p.id} data-prompt-index={promptIndex}>
              <span className="prompt-text">{p.text}</span>
              <div className="prompt-options">
                {p.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    data-option={i}
                    onClick={() => onAction({ type: 'chooseOption', seat, promptId: p.id, option: i })}
                  >
                    {optionLabel(opt, p.payload?.kind)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {extraActions.length > 0 && (
        <div className="action-extra" data-extra-actions={extraActions.length}>
          <span className="action-extra-title">Other actions</span>
          <div className="prompt-options">
            {extraActions.map((a, i) => (
              <button
                key={i}
                type="button"
                className="extra-action-button"
                data-extra-action={a.type}
                disabled={disabled}
                onClick={() => onAction(a)}
              >
                {extraLabel(a)}
              </button>
            ))}
          </div>
        </div>
      )}

      {pickerOpen && canExplore && (
        <div className="explore-picker" data-explore-picker>
          <div className="explore-picker-list">
            {weaponOptions.map(opt => (
              <label key={opt.instanceId} className="explore-option" data-explore-option={opt.instanceId}>
                <input
                  type="checkbox"
                  checked={selected.includes(opt.instanceId)}
                  disabled={disabled}
                  onChange={() => toggleWeapon(opt.instanceId)}
                />
                <span className="explore-option-name">{opt.name}</span>
                <span className="explore-option-stats">DMG {opt.damage} · AMMO {opt.ammo}</span>
                {opt.partner && (
                  <span
                    className="explore-option-partner"
                    title="Attached to your Partner. It joins this explore but stays attached."
                  >
                    partner
                  </span>
                )}
                {opt.reusable && (
                  <span
                    className="explore-option-reuse"
                    title="This weapon is in your play area and an ability lets you use it again this turn."
                  >
                    use again ({opt.remainingUses} left)
                  </span>
                )}
              </label>
            ))}
          </div>
          <div className="explore-picker-total" data-explore-total>
            {combo.damage} damage · {combo.ammo} ammo
          </div>
          {combo.reason !== null && (
            <div className="explore-picker-reason" data-explore-reason>{combo.reason}</div>
          )}
          {blowbackArmed && pistolOptions.length > 0 && (
            <div className="explore-picker-pistols" data-explore-pistols>
              <div className="explore-picker-pistols-title">
                Blowback Pistol: discard Pistols for +10 damage each
              </div>
              {pistolOptions.map(id => (
                <label key={id} className="explore-option">
                  <input
                    type="checkbox"
                    checked={discardPistols.includes(id)}
                    onChange={() => toggleDiscardPistol(id)}
                  />
                  <span className="explore-option-name">{defForInstance(state, id)?.name ?? id}</span>
                </label>
              ))}
            </div>
          )}
          <div className="explore-picker-actions">
            <button type="button" disabled={disabled} onClick={() => setSelected(weaponOptions.map(o => o.instanceId))}>
              Select all
            </button>
            <button type="button" disabled={disabled} onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        </div>
      )}

      {canExplore && (
        <div className="explore-options">
          {exploreCounts.length > 1 && (
            <div className="explore-picker-count" data-explore-count>
              <span>Explores to use:</span>
              {exploreCounts.map(n => (
                <button
                  key={n}
                  type="button"
                  className={exploreCount === n ? 'explore-count-active' : undefined}
                  data-explore-count-option={n}
                  onClick={() => setExploreCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {player?.partnerInstanceId !== undefined && (
            <div className="explore-picker-leader" data-explore-leader>
              <span>Leading (takes damage):</span>
              <button
                type="button"
                className={leader === 'main' ? 'explore-count-active' : undefined}
                data-leader-option="main"
                onClick={() => setLeader('main')}
              >
                Main
              </button>
              <button
                type="button"
                className={leader === 'partner' ? 'explore-count-active' : undefined}
                data-leader-option="partner"
                onClick={() => setLeader('partner')}
              >
                Partner
              </button>
            </div>
          )}
        </div>
      )}

      <div className="action-buttons">
        {onOpenLog !== undefined && (
          <button
            type="button"
            className="log-button"
            data-log-button
            data-log-open={logOpen}
            onClick={onOpenLog}
            title="Toggle game log"
          >
            📜 Log
          </button>
        )}

        {canExplore && (
          <>
            <button
              type="button"
              className="explore-button"
              data-explore-button
              data-combos={explores.length}
              data-weapons={selected.length}
              disabled={disabled || !combo.legal}
              title={combo.legal ? `${combo.damage} damage, ${combo.ammo} ammo` : (combo.reason ?? undefined)}
              onClick={() => onAction({
                type: 'explore',
                seat,
                weapons: selected,
                exploreCount,
                ...(leader === 'partner' ? { leader: 'partner' as const } : {}),
                ...(discardPistols.length > 0 ? { discardedPistols: discardPistols } : {}),
              })}
            >
              {pickerOpen ? 'Explore selected' : 'Explore'}
            </button>
            {weaponOptions.length > 1 && (
              <button
                type="button"
                className="explore-choose-button"
                data-explore-choose
                aria-expanded={pickerOpen}
                disabled={disabled}
                onClick={() => setPickerOpen(open => !open)}
              >
                {pickerOpen ? 'Hide weapons' : 'Choose weapons'}
              </button>
            )}
          </>
        )}

        {abilities.map(a => (
          <button
            key={`ability-${a.abilityIndex}`}
            type="button"
            className="ability-button"
            data-ability-index={a.abilityIndex}
            onClick={() => onAction(a)}
            disabled={disabled}
            title={abilityLabel(a.abilityIndex)}
          >
            Ability: {abilityLabel(a.abilityIndex)}
          </button>
        ))}

        {weaponAbilities.map(a => (
          <button
            key={`weapon-ability-${a.instanceId}`}
            type="button"
            className="ability-button"
            data-weapon-ability={a.instanceId}
            onClick={() => onAction(a)}
            disabled={disabled}
            title={defForInstance(state, a.instanceId)?.name ?? 'Activate weapon effect'}
          >
            Weapon: {defForInstance(state, a.instanceId)?.name ?? 'Activate'}
          </button>
        ))}

        {attachedItems.map(a => (
          <button
            key={`attached-item-${a.instanceId}`}
            type="button"
            className="ability-button"
            data-attached-item={a.instanceId}
            onClick={() => onAction(a)}
            disabled={disabled}
            title={defForInstance(state, a.instanceId)?.name ?? 'Remove attached item'}
          >
            Item: {defForInstance(state, a.instanceId)?.name ?? 'Remove'}
          </button>
        ))}

        <button type="button" onClick={() => onAction({ type: 'endTurn', seat })} disabled={disabled || !canEndTurn}>
          End turn
        </button>

      </div>

      <div className="dock-status" data-app-status={status ?? 'unknown'}>
        {roomCode !== null && roomCode !== undefined && <span className="app-room">Room {roomCode}</span>}
        {status !== undefined && <span className={`app-status app-status-${status}`}>{status}</span>}
      </div>
      </div>
    </div>
  );
}
