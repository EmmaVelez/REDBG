import type { JSX } from 'react';
import type { Action, GameState } from '@re/game-core';
import { enumerateLegalActions } from '@re/game-core';
import { ActionBarStats } from './ActionBarStats';
import { defForInstance } from './cards';

/**
 * M4-T07: ActionBar — turn-level controls derived from the engine's own
 * legal-action enumeration (the server validates anything we dispatch, so
 * this is a convenience layer, not an authority).
 *
 * - End Turn, when legal
 * - Explore, when at least one explore action is legal (plays the fullest
 *   legal combination of hand weapons/ammo)
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
  const explores = legal.filter((a): a is Extract<Action, { type: 'explore' }> => a.type === 'explore' && a.seat === seat);
  // fullest legal explore = most weapons (ammo comes from the cumulative pool)
  const bestExplore = explores.length > 0
    ? explores.reduce((best, a) => (a.weapons.length > best.weapons.length ? a : best))
    : undefined;
  // Character abilities the engine says are legal right now (unlocked level,
  // targets available, not already used this turn). Label from the character
  // card's level text when resolvable.
  const abilities = legal.filter((a): a is Extract<Action, { type: 'useCharacterAbility' }> => a.type === 'useCharacterAbility' && a.seat === seat);
  const player = state.seats[seat];
  const charInst = player === undefined ? undefined : state.cards[player.characterInstanceId];
  const charDef = charInst === undefined ? undefined : state.cardDefs[charInst.cardId];
  const abilityLabel = (abilityIndex: number): string => {
    const levelText = charDef?.levels?.find(l => l.level === (charDef.abilities?.[abilityIndex]?.level ?? 1))?.text;
    return levelText ?? 'Use ability';
  };
  const prompt = state.prompts.find(p => p.seat === seat);
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
              <button type="button" onClick={() => bestExplore !== undefined && onAction(bestExplore)} disabled={disabled || bestExplore === undefined} title={bestExplore !== undefined ? `Use ${bestExplore.weapons.length} weapon(s)` : undefined}>
                Explore{bestExplore !== undefined ? ` (${bestExplore.weapons.length} weapon${bestExplore.weapons.length === 1 ? '' : 's'})` : ''}
              </button>
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
              <button type="button" onClick={() => onAction({ type: 'endTurn', seat })} disabled={disabled || !canEndTurn}>
                End turn
              </button>
            </div>
    </div>
  );
}