import type { JSX } from 'react';
import type { Action, GameState } from '@re/game-core';
import { enumerateLegalActions } from '@re/game-core';

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
}

export function ActionBar({ state, seat, onAction, disabled = false }: ActionBarProps): JSX.Element {
  const legal = enumerateLegalActions(state, seat);
  const canEndTurn = legal.some(a => a.type === 'endTurn' && a.seat === seat);
  const explores = legal.filter((a): a is Extract<Action, { type: 'explore' }> => a.type === 'explore' && a.seat === seat);
  // fullest legal explore = most weapons (ammo comes from the cumulative pool)
  const bestExplore = explores.length > 0
    ? explores.reduce((best, a) => (a.weapons.length > best.weapons.length ? a : best))
    : undefined;
  const prompt = state.prompts.find(p => p.seat === seat);
  const phaseNote = state.phase === 'gameOver' ? 'Game over'
    : state.phase === 'turnEnd' ? 'Resolving turn end…'
    : state.activeSeat === seat ? undefined
    : `Waiting for ${state.seats[state.activeSeat]?.name ?? `seat ${state.activeSeat}`}…`;

  return (
    <div className="action-bar" data-seat={seat}>
      {phaseNote !== undefined && <div className="action-note">{phaseNote}</div>}

      {prompt !== undefined && !disabled && (
        <div className="action-prompt" data-prompt={prompt.id}>
          <span className="prompt-text">{prompt.text}</span>
          <div className="prompt-options">
            {prompt.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onAction({ type: 'chooseOption', seat, promptId: prompt.id, option: i })}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="action-buttons">
        <button type="button" onClick={() => bestExplore !== undefined && onAction(bestExplore)} disabled={disabled || bestExplore === undefined} title={bestExplore !== undefined ? `Use ${bestExplore.weapons.length} weapon(s)` : undefined}>
          Explore{bestExplore !== undefined ? ` (${bestExplore.weapons.length} weapon${bestExplore.weapons.length === 1 ? '' : 's'})` : ''}
        </button>
        <button type="button" onClick={() => onAction({ type: 'endTurn', seat })} disabled={disabled || !canEndTurn}>
          End turn
        </button>
      </div>
    </div>
  );
}