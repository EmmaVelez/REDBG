export interface DrawResult {
  readonly hand: readonly string[];
  readonly deck: readonly string[];
  readonly discard: readonly string[];
}

export function draw(params: {
  deck: readonly string[];
  discard: readonly string[];
  reshuffledDiscard: readonly string[];
  count: number;
}): DrawResult {
  if (params.count < 0) {
    throw new Error('draw: count must be >= 0');
  }

  if (params.count === 0) {
    return {
      hand: [],
      deck: params.deck,
      discard: params.discard,
    };
  }

  const hand: string[] = [];
  let remainingDeck = params.deck;
  let remainingDiscard = params.discard;

  while (hand.length < params.count && remainingDeck.length > 0) {
    const card = remainingDeck[0];
    if (card === undefined) {
      throw new Error('draw: unexpected undefined card in deck');
    }
    hand.push(card);
    remainingDeck = remainingDeck.slice(1);
  }

  if (hand.length < params.count && params.reshuffledDiscard.length > 0) {
    remainingDeck = params.reshuffledDiscard;
    remainingDiscard = [];

    while (hand.length < params.count && remainingDeck.length > 0) {
      const card = remainingDeck[0];
      if (card === undefined) {
        throw new Error('draw: unexpected undefined card in reshuffled discard');
      }
      hand.push(card);
      remainingDeck = remainingDeck.slice(1);
    }
  }

  return {
    hand,
    deck: remainingDeck,
    discard: remainingDiscard,
  };
}

export function discardFromHand(params: {
  hand: readonly string[];
  discard: readonly string[];
  instanceIds: readonly string[];
}): { hand: readonly string[]; discard: readonly string[] } {
  const hand = [...params.hand];
  const discard = [...params.discard];

  for (const id of params.instanceIds) {
    const index = hand.indexOf(id);
    if (index === -1) {
      throw new Error(`discardFromHand: card not in hand: ${id}`);
    }
    hand.splice(index, 1);
    discard.push(id);
  }

  return {
    hand,
    discard,
  };
}

export function discardHand(params: {
  hand: readonly string[];
  discard: readonly string[];
}): { hand: readonly string[]; discard: readonly string[] } {
  return {
    hand: [],
    discard: [...params.hand, ...params.discard],
  };
}
