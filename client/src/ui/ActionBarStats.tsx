import type { JSX } from 'react';

export interface ActionBarStatsProps {
  /** Current health. */
  readonly hp: number;
  /** Maximum health. */
  readonly maxHp: number;
  /** Gold remaining this turn. */
  readonly gold: number;
  /** Ammo remaining this turn. */
  readonly ammo: number;
  /** Actions remaining this turn. */
  readonly actions: number;
  /** Buys remaining this turn. */
  readonly buys: number;
}

export function ActionBarStats({ hp, maxHp, gold, ammo, actions, buys }: ActionBarStatsProps): JSX.Element {
  return (
    <div className="action-stats" data-action-stats>
      <span className="action-stat action-stat-hp" data-stat="hp">HP <strong>{hp}/{maxHp}</strong></span>
      <span className="action-stat action-stat-gold" data-stat="gold">Gold <strong>{gold}</strong></span>
      <span className="action-stat action-stat-ammo" data-stat="ammo">Ammo <strong>{ammo}</strong></span>
      <span className="action-stat action-stat-actions" data-stat="actions">Actions <strong>{actions}</strong></span>
      <span className="action-stat action-stat-buys" data-stat="buys">Buys <strong>{buys}</strong></span>
    </div>
  );
}
