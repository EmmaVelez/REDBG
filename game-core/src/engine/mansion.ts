
export interface Mansion {
  /** Face-down deck, top = index 0. Cards sent to the bottom are appended to
   *  the END of this same list — there is no separate bottom pile. */
  readonly deck: readonly string[];
}

export function revealTop(mansion: Mansion): { mansion: Mansion; revealedInstanceId: string } {
  if (mansion.deck.length === 0) {
    throw new Error('revealTop: mansion exhausted');
  }
  const revealedInstanceId = mansion.deck[0];
  if (revealedInstanceId === undefined) {
    throw new Error('revealTop: mansion exhausted');
  }
  return {
    mansion: { deck: mansion.deck.slice(1) },
    revealedInstanceId,
  };
}

/**
 * Reveal the BOTTOM-most card of the Mansion instead of the top.
 *
 * The bottom of the deck is simply the last card in `deck`, so this pops the
 * final element.
 */
export function revealBottom(mansion: Mansion): { mansion: Mansion; revealedInstanceId: string } {
  if (mansion.deck.length === 0) {
    throw new Error('revealBottom: mansion exhausted');
  }
  const revealedInstanceId = mansion.deck[mansion.deck.length - 1];
  if (revealedInstanceId === undefined) throw new Error('revealBottom: mansion exhausted');
  return {
    mansion: { deck: mansion.deck.slice(0, -1) },
    revealedInstanceId,
  };
}

/** Send a card to the bottom of the deck: append it to the end of `deck`. */
export function sendToBottom(mansion: Mansion, instanceId: string): Mansion {
  return {
    deck: [...mansion.deck, instanceId],
  };
}

export function shuffleBack(mansion: Mansion, instanceId: string, rngShuffle: (items: readonly string[]) => string[]): Mansion {
  const newDeck = rngShuffle([...mansion.deck, instanceId]);
  return {
    deck: newDeck,
  };
}

/**
 * Insert `instanceId` into the deck so it becomes the `position`-th
 * upcoming card (1-based from the top). Clamps to the end of the deck
 * when the deck is shorter than `position - 1`.
 * Used by MX-001 Mr. X ("place it on top of the mansion as the 5th
 * upcoming card").
 */
export function insertAt(mansion: Mansion, instanceId: string, position: number): Mansion {
  const deck = [...mansion.deck];
  const index = Math.max(0, Math.min(Math.floor(position) - 1, deck.length));
  deck.splice(index, 0, instanceId);
  return { deck };
}

export function deckCount(mansion: Mansion): number {
  return mansion.deck.length;
}
