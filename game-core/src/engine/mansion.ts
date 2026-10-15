
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
