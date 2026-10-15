export type Market = Readonly<Record<string, readonly string[]>>;

export function buildMarket(piles: ReadonlyArray<{ pileId: string; instanceIds: readonly string[] }>): Market {
    const market: Record<string, readonly string[]> = {};
    for (const { pileId, instanceIds } of piles) {
        if (market[pileId] !== undefined) {
            throw new Error('buildMarket: duplicate pileId: ' + pileId);
        }
        market[pileId] = [...instanceIds];
    }
    return market;
}

export function topCard(market: Market, pileId: string): string | undefined {
    const pile = market[pileId];
    if (pile === undefined || pile.length === 0) {
        return undefined;
    }
    return pile[0];
}

export function buyTopCard(market: Market, pileId: string): { market: Market; boughtInstanceId: string } {
    const pile = market[pileId];
    if (pile === undefined) {
        throw new Error('buyTopCard: unknown pile: ' + pileId);
    }
    if (pile.length === 0) {
        throw new Error('buyTopCard: empty pile: ' + pileId);
    }
    const boughtInstanceId = pile[0];
    if (boughtInstanceId === undefined) {
        throw new Error('buyTopCard: empty pile: ' + pileId);
    }
    const newPile = pile.slice(1);
    const newMarket = {
        ...market,
        [pileId]: newPile,
    };
    return { market: newMarket, boughtInstanceId };
}

export function pileCounts(market: Market): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [pileId, pile] of Object.entries(market)) {
        counts[pileId] = pile.length;
    }
    return counts;
}

export function affordablePiles(market: Market, costOfPileTop: (pileId: string, topInstanceId: string) => number, gold: number): string[] {
    const affordable: string[] = [];
    for (const [pileId, pile] of Object.entries(market)) {
        if (pile.length > 0) {
            const topInstanceId = pile[0];
            if (topInstanceId === undefined) {
                continue;
            }
            const cost = costOfPileTop(pileId, topInstanceId);
            if (cost <= gold) {
                affordable.push(pileId);
            }
        }
    }
    return affordable.sort();
}
