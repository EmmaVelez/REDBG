import type { JSX } from 'react';
import type { GameState, PlayerState } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { defForInstance } from './cards';

export interface PlayerSkillsProps {
  readonly state: GameState;
  readonly seat: number;
}

/**
 * Another seat's Mercenaries Skill Area, drawn as the viewing player's own is:
 * a slim column immediately right of that seat's character cards.
 *
 * The viewer's panel (ActionBar -> SkillPanel) shows name + XP pips because the
 * viewer can act on their OWN skills (`moveXp` / `useSkill`). Neither action is
 * legal on someone else's, so an opponent's column is just the card faces —
 * each wrapped in a HoverCard so hovering pops the full-size card up to read.
 *
 * Renders nothing when the Skill System is off or the seat holds no Skills.
 */
export function PlayerSkills({ state, seat }: PlayerSkillsProps): JSX.Element | null {
  const player: PlayerState | undefined = state.seats[seat];
  if (player === undefined || state.skillSystem !== true) return null;
  const skills = player.skills ?? [];
  if (skills.length === 0) return null;

  return (
    <div className="player-skills" data-player-skills>
      <span className="player-zone-label">Skills</span>
      <div className="player-skills-list">
        {skills.map(id => {
          const def = defForInstance(state, id);
          if (def === null) return null;
          return (
            <HoverCard key={id} def={def}>
              <CardView def={def} compact artOnly />
            </HoverCard>
          );
        })}
      </div>
    </div>
  );
}
