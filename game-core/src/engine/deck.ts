
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
  if (params.count === 0) {
    return {
      hand: [],
      deck: params.deck,
      discard: []
    };
  }

  let deck = [...params.deck];
  let reshuffledDeck = [...params.reshuffledDiscard];
  let hand: readonly string[] = [];

  for (let i = 0; i < params.count; i++) {
    if (deck.length === 0) {
      deck = reshuffledDeck;
      reshuffledDeck = [];
    }

    if (deck.length > 0) {
      const card = deck[0];
      if (card === undefined) {
        throw new Error('draw: deck is empty');
      }
      hand.push(card);
      deck = deck.slice(1);
    } else {
      break;
    }
  }

  return {
    hand,
    deck,
    discard: []
  };
}

export function discardFromHand(params: {
  hand: readonly string[];
  discard: readonly string[];
  instanceIds: readonly string[];
}): {
  hand: readonly string[];
  discard: readonly string[];
} {
  const newHand: readonly string[] = [];
  const newDiscard: readonly string[] = [...params.discard];

  for (const id of params.instanceIds) {
    let foundIndex = -1;
    for (let i = 0; i < params.hand.length; i++) {
      if (params.hand[i] === id) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === -1) {
      throw new Error('discardFromHand: card not in hand: ' + id);
    }

    const card = params.hand[foundIndex];
    newDiscard.push(card);
    newHand.push(params.hand[i]);
  }

  return {
    hand: newHand,
    discard: newDiscard
  };
}

export function discardHand(params: {
  hand: readonly string[];
  discard: readonly string[];
}): {
  hand: readonly string[];
  discard: readonly string[];
} {
  const newHand: readonly string[] = [];
  const newDiscard: readonly string[] = [...params.discard];

  for (const card of params.hand) {
    newDiscard.push(card);
  }

  return {
    hand: newHand,
    discard: newDiscard
  };
}
