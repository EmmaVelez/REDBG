
export interface Mansion {
  readonly deck: readonly string[];
  readonly bottom: readonly string[];
}

export function revealTop(mansion: Mansion): { mansion: Mansion; revealedInstanceId: string } {
  if (mansion.deck.length > 0) {
    const revealedInstanceId = mansion.deck[0];
    if (revealedInstanceId === undefined) {
      throw new Error('revealTop: mansion exhausted');
    }
    return {
      mansion: { deck: mansion.deck.slice(1), bottom: [...mansion.bottom] },
      revealedInstanceId,
    };
  }
  if (mansion.bottom.length === 0) {
    throw new Error('revealTop: mansion exhausted');
  }
  const newDeck = [...mansion.bottom];
  const revealedInstanceId = newDeck[0];
  if (revealedInstanceId === undefined) {
    throw new Error('revealTop: mansion exhausted');
  }
  return {
    mansion: { deck: newDeck.slice(1), bottom: [] },
    revealedInstanceId,
  };
}

/**
 * Reveal the BOTTOM-most card of the Mansion instead of the top.
 *
 * The engine keeps `bottom` as a separate pile under the deck, so the physical
 * bottom is the last card sent there; when nothing has been sent to the bottom
 * the deck's own last card is the bottom card.
 */
export function revealBottom(mansion: Mansion): { mansion: Mansion; revealedInstanceId: string } {
  if (mansion.bottom.length > 0) {
    const revealedInstanceId = mansion.bottom[mansion.bottom.length - 1];
    if (revealedInstanceId === undefined) throw new Error('revealBottom: mansion exhausted');
    return {
      mansion: { deck: [...mansion.deck], bottom: mansion.bottom.slice(0, -1) },
      revealedInstanceId,
    };
  }
  if (mansion.deck.length > 0) {
    const revealedInstanceId = mansion.deck[mansion.deck.length - 1];
    if (revealedInstanceId === undefined) throw new Error('revealBottom: mansion exhausted');
    return {
      mansion: { deck: mansion.deck.slice(0, -1), bottom: [...mansion.bottom] },
      revealedInstanceId,
    };
  }
  throw new Error('revealBottom: mansion exhausted');
}

export function sendToBottom(mansion: Mansion, instanceId: string): Mansion {
  return {
    deck: [...mansion.deck],
    bottom: [...mansion.bottom, instanceId],
  };
}

export function shuffleBack(mansion: Mansion, instanceId: string, rngShuffle: (items: readonly string[]) => string[]): Mansion {
  const newDeck = rngShuffle([...mansion.deck, instanceId]);
  return {
    deck: newDeck,
    bottom: [...mansion.bottom],
  };
}

export function recycleBottom(mansion: Mansion): Mansion {
  if (mansion.bottom.length > 0) {
    return {
      deck: [...mansion.deck, ...mansion.bottom],
      bottom: [],
    };
  }
  return {
    deck: [...mansion.deck],
    bottom: [...mansion.bottom],
  };
}

export function deckCount(mansion: Mansion): number {
  return mansion.deck.length + mansion.bottom.length;
}
