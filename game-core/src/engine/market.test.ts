import { describe, it, expect } from 'vitest';
import type { Market } from './market';
import {
    buildMarket,
    topCard,
    buyTopCard,
    pileCounts,
    affordablePiles,
} from './market';

describe('buildMarket', () => {
    it('two piles round-trip', () => {
        const piles = [
            { pileId: 'pile1', instanceIds: ['card1', 'card2'] },
            { pileId: 'pile2', instanceIds: ['card3'] },
        ];
        const market = buildMarket(piles);
        expect(market).toEqual({
            pile1: ['card1', 'card2'],
            pile2: ['card3'],
        });
    });

    it('duplicate pileId throws', () => {
        const piles = [
            { pileId: 'pile1', instanceIds: ['card1'] },
            { pileId: 'pile1', instanceIds: ['card2'] },
        ];
        expect(() => buildMarket(piles)).toThrow('buildMarket: duplicate pileId: pile1');
    });

    it('mutating the input pile array does not affect the market (arrays copied)', () => {
        const input: string[] = ['card1', 'card2'];
        const piles = [
            { pileId: 'pile1', instanceIds: input },
        ];
        const market = buildMarket(piles);
        input.push('card3');
        expect(market.pile1).toEqual(['card1', 'card2']);
    });
});

describe('topCard', () => {
    it('returns index-0 card', () => {
        const market: Market = {
            pile1: ['card1', 'card2'],
        };
        expect(topCard(market, 'pile1')).toBe('card1');
    });

    it('empty pile -> undefined', () => {
        const market: Market = {
            pile1: [],
        };
        expect(topCard(market, 'pile1')).toBeUndefined();
    });

    it('unknown pileId -> undefined', () => {
        const market: Market = {
            pile1: ['card1'],
        };
        expect(topCard(market, 'pile2')).toBeUndefined();
    });
});

describe('buyTopCard', () => {
    it('removes top, returns it, other piles untouched', () => {
        const market: Market = {
            pile1: ['card1', 'card2'],
            pile2: ['card3'],
        };
        const { market: newMarket, boughtInstanceId } = buyTopCard(market, 'pile1');
        expect(boughtInstanceId).toBe('card1');
        expect(newMarket).toEqual({
            pile1: ['card2'],
            pile2: ['card3'],
        });
    });

    it('input market unchanged (deep-compare a JSON copy taken before the call)', () => {
        const market: Market = {
            pile1: ['card1', 'card2'],
        };
        const marketCopy = JSON.parse(JSON.stringify(market));
        buyTopCard(market, 'pile1');
        expect(market).toEqual(marketCopy);
    });

    it('buying twice in a row drains correctly', () => {
        const market: Market = {
            pile1: ['card1', 'card2'],
        };
        const { market: market1 } = buyTopCard(market, 'pile1');
        const { market: market2, boughtInstanceId } = buyTopCard(market1, 'pile1');
        expect(boughtInstanceId).toBe('card2');
        expect(market2).toEqual({
            pile1: [],
        });
    });

    it('unknown pile throws', () => {
        const market: Market = {
            pile1: ['card1'],
        };
        expect(() => buyTopCard(market, 'pile2')).toThrow('buyTopCard: unknown pile: pile2');
    });

    it('empty pile throws', () => {
        const market: Market = {
            pile1: [],
        };
        expect(() => buyTopCard(market, 'pile1')).toThrow('buyTopCard: empty pile: pile1');
    });
});

describe('pileCounts', () => {
    it('counts every pile including empty ones', () => {
        const market: Market = {
            pile1: ['card1', 'card2'],
            pile2: [],
            pile3: ['card3'],
        };
        expect(pileCounts(market)).toEqual({
            pile1: 2,
            pile2: 0,
            pile3: 1,
        });
    });
});

describe('affordablePiles', () => {
    // deterministic fake: cost of a pile's top card = its instanceId length
    // 'card1'/'card2'/'card3'/'card4' all have length 5
    it('uses costOfPileTop to decide inclusion (all cards cost 5)', () => {
        const market: Market = {
            pile1: ['card1', 'card2'],
            pile2: ['card3'],
            pile3: ['card4'],
        };
        const costOfPileTop = (pileId: string, topInstanceId: string): number => topInstanceId.length;
        expect(affordablePiles(market, costOfPileTop, 5)).toEqual(['pile1', 'pile2', 'pile3']);
        expect(affordablePiles(market, costOfPileTop, 4)).toEqual([]);
    });

    it('verify inclusion/exclusion at a gold threshold', () => {
        const market: Market = {
            pile1: ['ab'],     // cost 2
            pile2: ['abcd'],   // cost 4
        };
        const costOfPileTop = (pileId: string, topInstanceId: string): number => topInstanceId.length;
        expect(affordablePiles(market, costOfPileTop, 3)).toEqual(['pile1']);
        expect(affordablePiles(market, costOfPileTop, 4)).toEqual(['pile1', 'pile2']);
        expect(affordablePiles(market, costOfPileTop, 1)).toEqual([]);
    });

    it('empty piles skipped', () => {
        const market: Market = {
            pile1: [],
            pile2: ['abcd'],
        };
        const costOfPileTop = (pileId: string, topInstanceId: string): number => topInstanceId.length;
        expect(affordablePiles(market, costOfPileTop, 4)).toEqual(['pile2']);
    });

    it('result sorted alphabetically', () => {
        const market: Market = {
            pile2: ['ab'],
            pile1: ['ab'],
        };
        const costOfPileTop = (pileId: string, topInstanceId: string): number => topInstanceId.length;
        expect(affordablePiles(market, costOfPileTop, 4)).toEqual(['pile1', 'pile2']);
    });
});
