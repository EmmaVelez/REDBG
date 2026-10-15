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

  for (let i = 0; i < params.count; i++) {
    if (remainingDeck.length > 0) {
      hand.push(remainingDeck[0]);
      remainingDeck = remainingDeck.slice(1);
    } else if (remainingDiscard.length > 0) {
      remainingDeck = params.reshuffledDiscard;
      remainingDiscard = [];
      hand.push(remainingDeck[0]);
      remainingDeck = remainingDeck.slice(1);
    } else {
      break;
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
    discard: [...params.discard, ...params.hand],
  };
}
