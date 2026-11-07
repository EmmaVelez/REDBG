import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Action, GameState } from '@re/game-core';
import { enumerateLegalActions } from '@re/game-core';
import { ActionBarStats } from './ActionBarStats';
import { defForInstance } from './cards';
import {
  bestExploreCombo,
  evaluateExploreCombo,
  exploreWeaponOptions,
  legalExplores,
} from './explorePicker';

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
}

export function ActionBar({ state, seat, onAction, disabled = false, lastError, onOpenLog, logOpen = false }: ActionBarProps): JSX.Element {
  const legal = enumerateLegalActions(state, seat);
  const canEndTurn = legal.some(a => a.type === 'endTurn' && a.seat === seat);
  const explores = legalExplores(state, seat);
  const prompt = state.prompts.find(p => p.seat === seat);

  // Weapons usable in an explore: hand weapons plus any play-area weapon an
  // ability lets this seat use again (Leon L2 pistolsTwicePerTurn).
  const weaponOptions = exploreWeaponOptions(state, seat);
  const best = bestExploreCombo(state, seat);

  const [selected, setSelected] = useState<readonly string[]>(() => best ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const combo = evaluateExploreCombo(state, seat, selected);
  const canExplore = explores.length > 0 && prompt === undefined;

  const toggleWeapon = (instanceId: string): void => {
    setSelected(prev => (prev.includes(instanceId) ? prev.filter(id => id !== instanceId) : [...prev, instanceId]));
  };

  // Character abilities the engine says are legal right now (unlocked level,
  // targets available, not already used this turn). Label from the character
  // card's level text when resolvable.
  const abilities = legal.filter((a): a is Extract<Action, { type: 'useCharacterAbility' }> => a.type === 'useCharacterAbility' && a.seat === seat);
  const weaponAbilities = legal.filter((a): a is Extract<Action, { type: 'useWeaponAbility' }> => a.type === 'useWeaponAbility' && a.seat === seat);
  const attachedItems = legal.filter((a): a is Extract<Action, { type: 'removeAttachedItem' }> => a.type === 'removeAttachedItem' && a.seat === seat);
  const player = state.seats[seat];
  const charInst = player === undefined ? undefined : state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
  const abilityLabel = (abilityIndex: number): string => {
    const levelText = charDef?.levels?.find(l => l.level === (charDef.abilities?.[abilityIndex]?.level ?? 1))?.text;
    return levelText ?? 'Use ability';
  };
  // Prompt options are instance ids, 'DONE' for multi-choice chains, or seat
  // numbers for player-choice prompts (Wesker L2 target, Rebecca L1 redirect);
  // render readable labels for each.
  const optionLabel = (opt: string): string => {
    if (opt === 'DONE') return 'Done';
    if (/^\d+$/.test(opt)) {
      const target = state.seats[Number(opt)];
      return target !== undefined ? `${target.name} (seat ${target.seat})` : opt;
    }
    const def = defForInstance(state, opt);
    return def !== null ? def.name : opt;
  };
  const phaseNote = state.phase === 'gameOver' ? 'Game over'
    : state.phase === 'turnEnd' ? 'Resolving turn end…'
    : state.activeSeat === seat ? undefined
    : `Waiting for ${state.seats[state.activeSeat]?.name ?? `seat ${state.activeSeat}`}…`;

  return (
    <div className="action-bar" data-seat={seat}>
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
      {lastError !== undefined && lastError !== null && lastError !== '' && (
        <div className="action-error" data-action-error role="alert">{lastError}</div>
      )}

      {prompt !== undefined && (
        <div className="action-prompt" data-prompt={prompt.id}>
          <span className="prompt-text">{prompt.text}</span>
          <div className="prompt-options">
            {prompt.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onAction({ type: 'chooseOption', seat, promptId: prompt.id, option: i })}
              >
                {optionLabel(opt)}
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
              onClick={() => onAction({ type: 'explore', seat, weapons: selected, exploreCount: 1 })}
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
    </div>
  );
}
