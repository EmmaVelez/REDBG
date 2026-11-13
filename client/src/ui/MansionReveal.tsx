import type { JSX } from 'react';
import type { CardDef, GameState, Prompt } from '@re/game-core';
import { CardView } from './CardView';
import { cardArtUrl } from './cardArt';
import { optionLabel } from './promptLabels';

/**
 * Mansion-door reveal: shown after the owner explores and the fight resolves,
 * pausing the table until the player reads the revealed card and clicks
 * Continue. The engine resolves combat atomically, so the reveal renders from
 * the outcome (attached / escaped / taken).
 *
 * The panel is a BATTLE LINE, left to right: the exploring player's character
 * and Partner cards, the Weapons that were used, and the revealed card on the
 * right. A multi-explore reveals several cards in one action — the panel steps
 * through them ONE AT A TIME (`index`/`total`), each entrance re-running the
 * card-in animation via the `key` on `.mansion-door-card`.
 *
 * NON-Infected reveals (items, tokens, events with a Take/Send-to-bottom
 * choice) park the card in limbo and open a prompt. Those prompts render INSIDE
 * this panel — the overlay would otherwise cover the ActionBar they used to
 * live in — and the panel LOCKS (Continue disabled) until every one is answered.
 */

/** One of the exploring player's character cards, as shown beside the weapons. */
export interface RevealPartyMember {
  readonly def: CardDef;
  /** True when this character led the explore (it is the one that took the hit). */
  readonly leader: boolean;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly decorations?: number;
  /** Purple health gauge: this character is carrying a counter (Poison). */
  readonly poisoned?: boolean;
}

export interface MansionRevealProps {
  readonly def: CardDef;
  readonly resultText: string;
  /** Total damage the exploring player dealt with this attack. */
  readonly damage: number;
  /** Effective Health of the revealed Infected, when it is not the printed
   *  value (CI-011 Queen Leech's Health equals the leader's Max Health). */
  readonly hp?: number;
  /** Weapon definitions the exploring player used for this attack. */
  readonly weapons?: readonly CardDef[];
  /** "Your damage" for the exploring player; "Damage dealt" for someone
   *  watching a forced explore (FCH-008 Sherry). */
  readonly damageLabel?: string;
  /** The exploring player's character + Partner, LEFT of the weapons. */
  readonly party?: readonly RevealPartyMember[];
  /** 0-based position of this card in a multi-card reveal. */
  readonly index?: number;
  /** How many cards this explore revealed. */
  readonly total?: number;
  /** Prompts the revealed card left open for the exploring seat. */
  readonly prompts?: readonly Prompt[];
  /** The game state, for resolving prompt option labels. */
  readonly state?: GameState;
  readonly onChooseOption?: (promptId: string, option: number) => void;
  readonly onContinue: () => void;
}

export function MansionReveal({
  def,
  resultText,
  damage,
  hp,
  weapons,
  damageLabel = 'Your damage',
  party,
  index = 0,
  total = 1,
  prompts,
  state,
  onChooseOption,
  onContinue,
}: MansionRevealProps): JSX.Element {
  const isInfected = def.type === 'infected';
  const art = cardArtUrl(def.id);
  const isLast = index >= total - 1;
  const locked = prompts !== undefined && prompts.length > 0;
  return (
    <div className="mansion-door-backdrop" data-mansion-door>
      <div className="mansion-door-panel" data-reveal-type={def.type}>
        <span className="mansion-door-title">{isInfected ? 'The door creaks open…' : 'You found something…'}</span>
        <div className="mansion-door-damage">{damageLabel}: <strong>{damage}</strong></div>
        <div className="mansion-door-battle">
          {party !== undefined && party.length > 0 && (
            <div className="mansion-door-party" data-reveal-party>
              {party.map((m, i) => {
                // Damage flashes only when combat occurred AND this character's HP is below max — the party snapshot comes from post-combat state so we compare against maxHp.
                const wasHit = damage > 0 && m.hp !== undefined && m.maxHp !== undefined && m.hp < m.maxHp;
                return (
                  <div
                    className={`mansion-door-party-member${m.leader ? ' is-leader' : ''}${wasHit ? ' has-damage' : ''}`}
                    key={`${m.def.id}-${i}`}
                    data-leader={m.leader || undefined}
                    data-damaged={wasHit || undefined}
                  >
                    <CardView
                      def={m.def}
                      compact
                      artOnly
                      hp={m.hp}
                      maxHp={m.maxHp}
                      decorations={m.decorations}
                      poisoned={m.poisoned}
                    />
                    {m.leader && <span className="mansion-door-leader-tag">LED</span>}
                  </div>
                );
              })}
            </div>
          )}
          {weapons !== undefined && weapons.length > 0 && (
            <div className="mansion-door-weapons" data-reveal-weapons>
              <span className="mansion-door-weapons-label">Weapons used:</span>
              <div className="mansion-door-weapons-row">
                {weapons.map((w, i) => (
                  <div className="mansion-door-weapon" key={`${w.id}-${i}`}>
                    <CardView def={w} compact />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div
            className={`mansion-door-card${isInfected && damage > 0 ? ' has-defeated-infected' : ''}`}
            key={`${def.id}-${index}`}
            style={{ backgroundImage: art ? `url(${art})` : undefined, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
          >
            <div className="mansion-door-dmg-flash" />
            <CardView def={def} hideCost hp={hp} maxHp={hp} />
          </div>
        </div>
        <span className="mansion-door-result">{resultText}</span>
        {locked && (
          <div className="mansion-door-prompts" data-reveal-prompts={prompts.length}>
            {prompts.map((p, promptIndex) => (
              <div className="mansion-door-prompt" key={p.id} data-prompt={p.id} data-prompt-index={promptIndex}>
                <span className="mansion-door-prompt-text">{p.text}</span>
                <div className="mansion-door-prompt-options">
                  {p.options.map((opt, i) => (
                    <button
                      type="button"
                      key={i}
                      data-option={i}
                      onClick={() => onChooseOption?.(p.id, i)}
                    >
                      {state !== undefined ? optionLabel(state, opt, p.payload?.kind) : opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <span className="mansion-door-result mansion-door-lock" data-reveal-locked={locked || undefined}>
          {locked ? 'Answer the choice above to continue.' : ''}
        </span>
        {total > 1 && (
          <span className="mansion-door-progress" data-reveal-progress>
            {index + 1} / {total}
          </span>
        )}
        <button
          type="button"
          className="mansion-door-continue btn-primary"
          onClick={onContinue}
          disabled={locked}
          data-reveal-locked={locked || undefined}
        >
          {isLast ? 'Continue' : 'Next'}
        </button>
      </div>
    </div>
  );
}
