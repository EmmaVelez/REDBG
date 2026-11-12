import type { GameState } from '@re/game-core';
import { defForInstance } from './cards';

/** Prompt kinds whose numeric options are AMOUNTS (XP), not seat indices. */
const AMOUNT_KINDS = new Set(['we046ChooseAmount', 'skillRemoveXpAmount']);

/** Prompt kinds whose options are the Partner's ATTACHED card instance ids —
 *  labelled as the slot being replaced, not as a bare card name. */
const REPLACE_KINDS = new Set(['attachToPartnerSlot']);

/**
 * Readable label for one prompt option. Prompt options are card instance ids,
 * 'DONE' for multi-choice chains, seat numbers for player-choice prompts
 * (Wesker L2 target, Rebecca L1 redirect), or bare amounts (XP removal).
 *
 * Shared by the ActionBar and the mansion-reveal overlay so a prompt renders
 * the same labels wherever it appears.
 */
export function optionLabel(state: GameState, opt: string, kind: unknown): string {
  if (opt === 'DONE') return 'Done';
  // XP-amount prompts offer numbers that are amounts, NOT seat indices.
  if (typeof kind === 'string' && AMOUNT_KINDS.has(kind)) return `${opt} XP`;
  // Attach-to-Partner slot prompt: options are the attached cards themselves.
  if (typeof kind === 'string' && REPLACE_KINDS.has(kind)) {
    const def = defForInstance(state, opt);
    return `Replace ${def?.name ?? opt}`;
  }
  if (/^\d+$/.test(opt)) {
    const target = state.seats[Number(opt)];
    return target !== undefined ? `${target.name} (seat ${target.seat})` : opt;
  }
  const def = defForInstance(state, opt) ?? state.cardDefs[opt];
  return def?.name ?? opt;
}
