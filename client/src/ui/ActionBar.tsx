import { useEffect, useRef, useState } from 'react';
import type { JSX, ButtonHTMLAttributes } from 'react';
import type { Action, GameState } from '@re/game-core';
import { enumerateLegalActions } from '@re/game-core';
import type { ConnectionStatus } from '../net/ws';
import { ActionBarStats } from './ActionBarStats';
import { CharacterCards } from './CharacterCards';
import { Hand } from './Hand';
import { SkillPanel } from './SkillPanel';
import { ZonePile } from './ZonePile';
import { playFromHand } from './playFromHand';
import { defForInstance } from './cards';
import {
  bestExploreCombo,
  evaluateExploreCombo,
  exploreCountOptions,
  exploreWeaponOptions,
  legalExplores,
  resolveExploreLeader,
  grantedExploresForSelection,
  toggleWeaponDouble,
} from './explorePicker';
import { optionLabel } from './promptLabels';

/** Action types the rest of the UI already exposes (Hand / Board / SkillPanel /
 *  ActionBar). Any OTHER legal action is rendered as a generic button in the
 *  ActionBar so no legal action is ever unreachable — currently Outbreak
 *  `attack` and Alliance `attachToPartner`. */
const UI_HANDLED_ACTION_TYPES = new Set<Action['type']>([
  'playActionCard', 'playItem', 'playAmmo', 'explore', 'buy',
  'useCharacterAbility', 'useWeaponAbility', 'moveXp', 'useSkill',
  'removeAttachedItem', 'endTurn', 'chooseOption',
  // Alliance attach: humans get ONE guided `attachToPartnerStart` button that
  // raises the card/slot prompts; the direct per-card actions stay bot-only.
  'attachToPartner',
]);

/** The four colour variants of the one action button. Shape, size and type are
 *  identical across them — only colour carries meaning (see styles.css M7). */
type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'terminal';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ActionButtonVariant;
}

/** The single button component for every in-game action. Previously each kind
 *  of action had its own class (`.explore-button`, `.ability-button`,
 *  `.action-end-turn`, …) with its own radius, padding and font size; they now
 *  share one scale and differ only by variant colour. */
function ActionButton({ variant = 'secondary', className, ...rest }: ActionButtonProps): JSX.Element {
  const classes = `action-btn action-btn-${variant}${className === undefined ? '' : ` ${className}`}`;
  return <button type="button" className={classes} {...rest} />;
}

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
 *
 * Layout: one dock, three bands — stats (band 1), identity (band 2), controls
 * (band 3). The controls band used to be `position: fixed` floating above the
 * dock; it is a normal band now so every control shares one surface.
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
  /** Force the decision card away — set while a full-screen overlay (mansion
   *  reveal, you died) is showing, because those carry their own prompts. */
  readonly cardHidden?: boolean;
}

export function ActionBar({ state, seat, onAction, disabled = false, lastError, onOpenLog, logOpen = false, status, roomCode = null, cardHidden = false }: ActionBarProps): JSX.Element {
  const legal = enumerateLegalActions(state, seat);
  const canEndTurn = legal.some(a => a.type === 'endTurn' && a.seat === seat);
  const explores = legalExplores(state, seat);
  // Every prompt awaiting this seat, in queue order — chained prompts (a
  // resolver that raises the next step) must all be visible, not just the first.
  const prompts = state.prompts.filter(p => p.seat === seat);
  const prompt = prompts[0];

  // Alliance Partner Modification: who leads (takes the damage on a failed
  // explore). Defaults to the Main character. Declared before the picker
  // helpers below because the preview must price the LEADING character's
  // abilities, not the Main's.
  const [leader, setLeader] = useState<'main' | 'partner'>('main');
  // A dead Partner cannot lead. The leader toggle disappears when the Partner
  // dies, but this state survives the death — without the fallback below every
  // later explore would still be priced with the (now empty) Partner abilities
  // and sent as `leader: 'partner'`, which validate rejects with
  // "explore: no partner". The Main character takes over automatically.
  const hasPartner = state.seats[seat]?.partnerInstanceId !== undefined;
  const effectiveLeader = resolveExploreLeader(state, seat, leader);
  useEffect(() => {
    if (!hasPartner) setLeader('main');
  }, [hasPartner]);

  // Weapons usable in an explore: hand weapons plus any play-area weapon an
  // ability lets this seat use again (Leon L2 pistolsTwicePerTurn).
  const weaponOptions = exploreWeaponOptions(state, seat, effectiveLeader);
  const best = bestExploreCombo(state, seat, effectiveLeader);

  const [selected, setSelected] = useState<readonly string[]>(() => best ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const handScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollHand = (direction: -1 | 1): void => {
    handScrollRef.current?.scrollBy({ left: direction * 200, behavior: 'smooth' });
  };
  // Multi-explore: how many of the seat's remaining Explores this action spends.
  const [exploreCount, setExploreCount] = useState(1);

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

  const combo = evaluateExploreCombo(state, seat, selected, exploreCount, effectiveLeader);
  const canExplore = explores.length > 0 && prompt === undefined;
  const exploreCounts = exploreCountOptions(state, seat, selected);
  // Explores the selected weapons grant this turn (Pump-Action Shotgun et al.) —
  // they can be spent in THIS explore (revealing that many cards at once) or
  // saved for a later, separate explore.
  const grantedExplores = grantedExploresForSelection(state, selected);
  const grantedWeaponNames: string[] = [];
  for (const id of selected) {
    const d = defForInstance(state, id);
    if (d !== null && (d.weaponEffects ?? []).some(e => e.kind === 'grantExplores' || e.kind === 'grantExploreAndSuppressLowHpInfected')) {
      grantedWeaponNames.push(d.name);
    }
  }
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
    if (a.type === 'attachToPartnerStart') {
      return 'Attach to partner';
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
  const partnerInst = player?.partnerInstanceId === undefined ? undefined : state.cards[player.partnerInstanceId];
  const partnerDef = partnerInst === undefined ? undefined : state.cardDefs[partnerInst.cardId];
  // Alliance Partner Modification: a legal ability button may belong to the
  // Partner, so label it from that character's own level text.
  const abilityLabel = (a: Extract<Action, { type: 'useCharacterAbility' }>): string => {
    const def = a.character === 'partner' ? partnerDef : charDef;
    const levelText = def?.levels?.find(l => l.level === (def.abilities?.[a.abilityIndex]?.level ?? 1))?.text;
    if (a.character === 'partner') return 'Partner: ' + (levelText ?? 'Use ability');
    return levelText ?? 'Use ability';
  };
  const phaseNote = state.phase === 'gameOver' ? 'Game over'
    : state.phase === 'turnEnd' ? 'Resolving turn end…'
    : state.activeSeat === seat ? undefined
    : `Waiting for ${state.seats[state.activeSeat]?.name ?? `seat ${state.activeSeat}`}…`;

  // The decision card is the contextual action surface: it is rendered only
  // when there is something to decide (a prompt, a legal explore, or any legal
  // ability/item/extra action). Its header names that decision.
  const decisionTitle = prompts.length > 0
    ? 'Resolve'
    : canExplore
      ? (pickerOpen ? 'Explore · Choose your weapons' : 'Explore')
      : 'Actions';
  const hasError = lastError !== undefined && lastError !== null && lastError !== '';
  const showDecisionCard = !cardHidden
    && (prompts.length > 0
      || canExplore
      || abilities.length > 0
      || weaponAbilities.length > 0
      || attachedItems.length > 0
      || extraActions.length > 0);

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
            skillSystem={state.skillSystem}
            xp={player.xp ?? 0}
            turn={state.turnNumber}
            decorations={state.seats.reduce((sum, s) => sum + s.decorations, 0)}
            roomCode={roomCode}
            status={status}
          />
        )}
        {phaseNote !== undefined && <div className="action-note">{phaseNote}</div>}
        {onOpenLog !== undefined && (
          <div className="action-row-actions">
            <ActionButton
              variant="ghost"
              className="log-button"
              data-log-button
              data-log-open={logOpen}
              onClick={onOpenLog}
              title="Toggle game log"
            >
              📜 Log
            </ActionButton>
          </div>
        )}
      </div>

      {/* band 2 — character, deck, hand, discard */}
      {player !== undefined && (
        <div className="action-row action-identity" data-action-identity>
          <div className="action-col">
            <CharacterCards state={state} seat={seat} />
          </div>
          {/* Skill Area sits immediately right of the character/partner cards
              (Manny's layout reference), before the deck. */}
          <div className="action-col action-col-skills" data-skill-column>
            <SkillPanel state={state} seat={seat} onAction={onAction} disabled={disabled} />
          </div>
          <div className="action-col">
            <ZonePile label="Deck" count={player.inventory.length} animZone="deck" seat={seat} />
          </div>
          <div className="action-col action-col-hand">
            <div className="action-hand-scroll" ref={handScrollRef}>
              <Hand
                state={state}
                seat={seat}
                onPlay={instanceId => {
                  // A weapon is not played as a standalone action — the rulebook
                  // has you play the weapons you will be using as part of an
                  // Explore. Clicking one opens the picker with it selected,
                  // which is the only way to actually use it (dispatching
                  // playActionCard made the server reject the click).
                  if (defForInstance(state, instanceId)?.type === 'weapon') {
                    setSelected([instanceId]);
                    setPickerOpen(true);
                    return;
                  }
                  playFromHand(state, seat, instanceId, onAction);
                }}
                disabled={disabled}
              />
            </div>
            <button type="button" className="hand-scroll hand-scroll-left" onClick={() => scrollHand(-1)} title="Scroll hand left" aria-label="Scroll hand left">◀</button>
            <button type="button" className="hand-scroll hand-scroll-right" onClick={() => scrollHand(1)} title="Scroll hand right" aria-label="Scroll hand right">▶</button>
          </div>
          <div className="action-col">
            <ZonePile label="Discard" count={player.discard.length} animZone="discard" seat={seat} topDef={discardTopDef} />
          </div>
        </div>
      )}
      {hasError && (
        <div className="action-error" data-action-error role="alert">{lastError}</div>
      )}

      {/* the dock's own action row — persistent turn controls only. Everything
          contextual lives in the decision card above the dock. */}
      <div className="action-row action-row-dock-actions action-buttons">
        <ActionButton
          variant="terminal"
          data-end-turn
          onClick={() => onAction({ type: 'endTurn', seat })}
          disabled={disabled || !canEndTurn}
        >
          End turn
        </ActionButton>
      </div>

      {/* the decision card — the contextual action surface, anchored above the
          dock. A real surface (not floating buttons): a header names the
          decision, the body holds the controls, the footer holds the primary. */}
      {showDecisionCard && (
        <div className="decision-card" data-decision-card data-decision={decisionTitle}>
          <div className="decision-card-head">
            <span className="decision-card-title">{decisionTitle}</span>
            {canExplore && weaponOptions.length > 1 && prompts.length === 0 && (
              <ActionButton
                variant="ghost"
                className="action-btn-compact"
                data-explore-choose
                aria-expanded={pickerOpen}
                disabled={disabled}
                onClick={() => setPickerOpen(open => !open)}
              >
                {pickerOpen ? 'Hide weapons' : 'Choose weapons'}
              </ActionButton>
            )}
          </div>

          <div className="decision-card-body">
            {prompts.length > 0 && (
              <div className="action-prompts" data-prompts={prompts.length}>
                {prompts.map((p, promptIndex) => (
                  <div key={p.id} className="action-prompt" data-prompt={p.id} data-prompt-index={promptIndex}>
                    <span className="prompt-text">{p.text}</span>
                    {/* A prompt is a DECISION, not an action: options render as
                        full-width choice rows, never as action buttons. */}
                    <div className="choice-list">
                      {p.options.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          className="choice"
                          data-option={i}
                          onClick={() => onAction({ type: 'chooseOption', seat, promptId: p.id, option: i })}
                        >
                          <span className="choice-dot" aria-hidden="true" />
                          <span className="choice-label">{optionLabel(state, opt, p.payload?.kind)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {prompts.length === 0 && (
              <>
                {extraActions.length > 0 && (
                  <div className="action-extra" data-extra-actions={extraActions.length}>
                    <span className="action-extra-title">Other actions</span>
                    <div className="action-extra-list">
                      {extraActions.map((a, i) => (
                        <ActionButton
                          key={i}
                          variant="secondary"
                          data-extra-action={a.type}
                          disabled={disabled}
                          onClick={() => onAction(a)}
                        >
                          {extraLabel(a)}
                        </ActionButton>
                      ))}
                    </div>
                  </div>
                )}

                {canExplore && pickerOpen && (
                  <div className="explore-picker" data-explore-picker>
                    <div className="explore-picker-list">
                      {weaponOptions.map(opt => {
                        const times = selected.filter(id => id === opt.instanceId).length;
                        return (
                          <div key={opt.instanceId} className="explore-option" data-explore-option={opt.instanceId}>
                            <label>
                              <input
                                type="checkbox"
                                checked={times >= 1}
                                disabled={disabled}
                                onChange={() => toggleWeapon(opt.instanceId)}
                              />
                              <span className="explore-option-name">{opt.name}</span>
                              <span className="explore-option-stats">DMG {opt.damage} · AMMO {opt.ammo}</span>
                            </label>
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
                            {opt.remainingUses >= 2 && (
                              <ActionButton
                                variant="ghost"
                                className="action-btn-compact"
                                data-explore-double={opt.instanceId}
                                data-active={times >= 2}
                                disabled={disabled}
                                onClick={() => setSelected(toggleWeaponDouble(selected, opt.instanceId, opt.remainingUses))}
                                title="Use this weapon twice in one explore: pay its Ammo Requirement twice, and its effect and damage apply twice."
                              >
                                {times >= 2 ? '×2 ✓' : '×2'}
                              </ActionButton>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                      <ActionButton variant="ghost" className="action-btn-compact" disabled={disabled} onClick={() => setSelected(weaponOptions.map(o => o.instanceId))}>
                        Select all
                      </ActionButton>
                      <ActionButton variant="ghost" className="action-btn-compact" disabled={disabled} onClick={() => setSelected([])}>
                        Clear
                      </ActionButton>
                    </div>
                  </div>
                )}

                {canExplore && (
                  <div className="explore-options">
                    {exploreCounts.length > 1 && (
                      <div className="segmented" data-explore-count>
                        <span className="segmented-label">Explores</span>
                        {exploreCounts.map(n => (
                          <button
                            key={n}
                            type="button"
                            className={exploreCount === n ? 'segmented-option segmented-option-active' : 'segmented-option'}
                            data-explore-count-option={n}
                            onClick={() => setExploreCount(n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                    {grantedExplores > 0 && (
                      <div className="explore-granted-hint" data-explore-granted-hint>
                        +{grantedExplores} Explore{grantedExplores === 1 ? '' : 's'} from {grantedWeaponNames.join(', ') || 'the selected weapon'} —
                        use {exploreCounts[exploreCounts.length - 1] ?? 1} to reveal that many cards now, or fewer to save some for later.
                      </div>
                    )}
                    {player?.partnerInstanceId !== undefined && (
                      <div className="segmented" data-explore-leader>
                        <span className="segmented-label">Leading</span>
                        <button
                          type="button"
                          className={leader === 'main' ? 'segmented-option segmented-option-active' : 'segmented-option'}
                          data-leader-option="main"
                          onClick={() => setLeader('main')}
                        >
                          Main
                        </button>
                        <button
                          type="button"
                          className={leader === 'partner' ? 'segmented-option segmented-option-active' : 'segmented-option'}
                          data-leader-option="partner"
                          onClick={() => setLeader('partner')}
                        >
                          Partner
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {abilities.length > 0 && (
                  <div className="decision-actions" data-decision-group="abilities">
                    {abilities.map(a => (
                      <ActionButton
                        key={`ability-${a.abilityIndex}`}
                        variant="secondary"
                        data-ability-index={a.abilityIndex}
                        data-ability-character={a.character ?? 'main'}
                        onClick={() => onAction(a)}
                        disabled={disabled}
                        title={abilityLabel(a)}
                      >
                        Ability: {abilityLabel(a)}
                      </ActionButton>
                    ))}
                  </div>
                )}

                {weaponAbilities.length > 0 && (
                  <div className="decision-actions" data-decision-group="weapon-abilities">
                    {weaponAbilities.map(a => (
                      <ActionButton
                        key={`weapon-ability-${a.instanceId}`}
                        variant="secondary"
                        data-weapon-ability={a.instanceId}
                        onClick={() => onAction(a)}
                        disabled={disabled}
                        title={defForInstance(state, a.instanceId)?.name ?? 'Activate weapon effect'}
                      >
                        Weapon: {defForInstance(state, a.instanceId)?.name ?? 'Activate'}
                      </ActionButton>
                    ))}
                  </div>
                )}

                {attachedItems.length > 0 && (
                  <div className="decision-actions" data-decision-group="items">
                    {attachedItems.map(a => (
                      <ActionButton
                        key={`attached-item-${a.instanceId}`}
                        variant="secondary"
                        data-attached-item={a.instanceId}
                        onClick={() => onAction(a)}
                        disabled={disabled}
                        title={defForInstance(state, a.instanceId)?.name ?? 'Remove attached item'}
                      >
                        Item: {defForInstance(state, a.instanceId)?.name ?? 'Remove'}
                      </ActionButton>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {canExplore && (
            <div className="decision-card-foot">
              <span className="decision-card-total" data-explore-total>
                {combo.damage} DMG · {combo.ammo} ammo
              </span>
              {combo.reason !== null && (
                <span className="explore-picker-reason" data-explore-reason>{combo.reason}</span>
              )}
              <span className="spacer" />
              <ActionButton
                variant="primary"
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
                  ...(effectiveLeader === 'partner' ? { leader: 'partner' as const } : {}),
                  ...(discardPistols.length > 0 ? { discardedPistols: discardPistols } : {}),
                })}
              >
                {pickerOpen ? 'Explore selected' : 'Explore'}
              </ActionButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
