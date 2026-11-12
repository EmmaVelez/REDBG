import type { JSX } from 'react';
import type { Action, GameState } from '@re/game-core';
import { defForInstance } from './cards';

/**
 * Mercenaries Skill System panel: the seat's Skill Area with its XP pips,
 * activation state, a "move XP" control (free action) and a "Use" button for
 * manual ("can") Skills. Renders nothing when the Skill System is off.
 */

const MANUAL_KINDS = new Set([
  'selfDamageForCardsAndAction', 'selfDamageForTrashDiscard', 'trashAmmoForAmmo',
  'movePlayAreaWeaponToInventoryTop', 'nameWeaponTypeAmmoDiscount', 'removeXpForTrashHand',
  'exploreBonusDamagePerCharacterDamage', 'giantKillingPlusDamage',
  'giantKillingAllWeaponsPlusDamage', 'exploreDuplicateWeaponEffect', 'removeXpForWeaponDamage',
  // Reactive Skills (SK-008/010/012): armed during the turn, consumed by the
  // next qualifying event.
  'negateDamageRemoveXp', 'negateInfectedEffectRemoveXp', 'redirectInfectedEffectRemoveXp',
]);

export interface SkillPanelProps {
  readonly state: GameState;
  readonly seat: number;
  readonly onAction: (action: Action) => void;
  readonly disabled: boolean;
}

export function SkillPanel({ state, seat, onAction, disabled }: SkillPanelProps): JSX.Element | null {
  const player = state.seats[seat];
  if (player === undefined || state.skillSystem !== true) return null;
  const skills = player.skills ?? [];
  if (skills.length === 0) return null;
  const xp = player.xp ?? 0;
  return (
    <div className="skill-panel" data-testid="skill-panel">
      <div className="skill-panel-head">
        <span className="skill-panel-title">Skills</span>
        <span className="skill-panel-xp" data-testid="skill-xp">XP {xp}</span>
      </div>
      {skills.map(id => {
        const def = defForInstance(state, id);
        if (def === null) return null;
        const on = state.cards[id]?.xp ?? 0;
        const req = def.skillXp ?? 0;
        const active = on >= req;
        const need = Math.max(req - on, 0);
        const manual = (def.skillEffects ?? []).some(e => MANUAL_KINDS.has(e.kind));
        return (
          <div
            key={id}
            className={active ? 'skill-row skill-row-active' : 'skill-row skill-row-inactive'}
            data-testid={`skill-row-${def.id}`}
            data-active={active}
          >
            <span className="skill-row-name" title={def.text}>{def.name}</span>
            {player.partnerSkillId === id && (
              <span className="skill-row-partner" data-testid={`skill-partner-${def.id}`}>Partner</span>
            )}
            <span className="skill-row-pips">{on}/{req}</span>
            {active && manual && (
              <button
                type="button"
                className="action-btn action-btn-ghost action-btn-compact"
                disabled={disabled}
                onClick={() => onAction({ type: 'useSkill', seat, skillInstanceId: id })}
              >
                Use
              </button>
            )}
            {!active && need > 0 && (
              <button
                type="button"
                className="action-btn action-btn-ghost action-btn-compact"
                disabled={disabled || xp < need}
                onClick={() => onAction({ type: 'moveXp', seat, skillInstanceId: id, amount: need })}
              >
                +{need} XP
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
