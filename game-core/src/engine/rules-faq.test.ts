
import { describe, it, expect } from 'vitest';
import type { CharacterAbility } from '../types';
import {
    explosivesPlusDamageFor,
    explosiveWeaponsGoToDiscard,
    damagePerFull10Ammo,
    maxDrawableCards,
    effectiveDrawCount
} from './rules-faq';

describe('explosivesPlusDamageFor', () => {
    const jillL1 = [{ kind: 'explosivesPlusDamage', amount: 5, level: 1 }] as CharacterAbility[];

    // 1. 'jill l1 adds damage to each explosive weapon'
    it('jill l1 adds damage to each explosive weapon', () => {
        expect(explosivesPlusDamageFor(jillL1, 1)).toBe(5);
        expect(explosivesPlusDamageFor(jillL1, 2)).toBe(10);
        expect(explosivesPlusDamageFor(jillL1, 0)).toBe(0);
    });

    // 2. 'jill l1 with no explosives used'
    it('jill l1 with no explosives used', () => {
        expect(explosivesPlusDamageFor(jillL1, 0)).toBe(0);
    });

    // 3. 'no abilities means no explosive bonus'
    it('no abilities means no explosive bonus', () => {
        expect(explosivesPlusDamageFor(undefined, 3)).toBe(0);
        expect(explosivesPlusDamageFor([], 3)).toBe(0);
        expect(explosivesPlusDamageFor([{ kind: 'generic', level: 1 }], 3)).toBe(0);
    });

    // 4. 'level-2 only ability is not matched'
    it('level-2 only ability is not matched', () => {
        const jillL2 = [{ kind: 'explosivesPlusDamage', amount: 5, level: 2 }] as CharacterAbility[];
        expect(explosivesPlusDamageFor(jillL2, 1)).toBe(0);
    });

    // 5. 'mixed abilities pick the level-1 explosivesPlusDamage'
    it('mixed abilities pick the level-1 explosivesPlusDamage', () => {
        const mixedAbilities: CharacterAbility[] = [
            { kind: 'noHealingNoNonInfectedAttach', level: 1 },
            { kind: 'explosivesPlusDamage', amount: 7, level: 1 },
            { kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 }
        ];
        expect(explosivesPlusDamageFor(mixedAbilities, 3)).toBe(21);
    });
});

describe('explosiveWeaponsGoToDiscard', () => {
    // 6. 'jill l2 routes explosive weapons to discard'
    it('jill l2 routes explosive weapons to discard', () => {
        const jillL2 = [{ kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 }] as CharacterAbility[];
        expect(explosiveWeaponsGoToDiscard(jillL2)).toBe(true);
        expect(explosiveWeaponsGoToDiscard(undefined)).toBe(false);
        expect(explosiveWeaponsGoToDiscard([] as CharacterAbility[])).toBe(false);
    });

    // 7. 'explosives go to discard only at level 2'
    it('explosives go to discard only at level 2', () => {
        const jillL1 = [{ kind: 'explosivesGoToDiscardInsteadOfTrash', level: 1 }] as CharacterAbility[];
        expect(explosiveWeaponsGoToDiscard(jillL1)).toBe(false);
        const mixedAbilities: CharacterAbility[] = [
            { kind: 'explosivesPlusDamage', amount: 5, level: 1 },
            { kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 }
        ];
        expect(explosiveWeaponsGoToDiscard(mixedAbilities)).toBe(true);
    });
});

describe('damagePerFull10Ammo', () => {
    // 8. 'gatling majini scales per full 10 ammo'
    it('gatling majini scales per full 10 ammo', () => {
        expect(damagePerFull10Ammo(9, 5)).toBe(0);
        expect(damagePerFull10Ammo(10, 5)).toBe(5);
        expect(damagePerFull10Ammo(59, 5)).toBe(25);
        expect(damagePerFull10Ammo(60, 5)).toBe(30);
        expect(damagePerFull10Ammo(65, 5)).toBe(30);
        expect(damagePerFull10Ammo(100, 5)).toBe(50);
    });

    // 9. 'gatling majini zero or negative ammo'
    it('gatling majini zero or negative ammo', () => {
        expect(damagePerFull10Ammo(0, 5)).toBe(0);
        expect(damagePerFull10Ammo(-5, 5)).toBe(0); // Guard check
    });

    // 14. test naming the rulebook example
    it('rulebook example: two Ammo x30 = 60 ammo gives +30', () => {
        expect(damagePerFull10Ammo(60, 5)).toBe(30);
        expect(damagePerFull10Ammo(60, 5)).toBe(30); // Three Ammo x20 (60 total)
        expect(damagePerFull10Ammo(50, 5)).toBe(25); // One Ammo x30 + one x20 (50 total)
    });
});

describe('maxDrawableCards', () => {
    // 10. 'max drawable is inventory plus discard'
    it('max drawable is inventory plus discard', () => {
        expect(maxDrawableCards(5, 0)).toBe(5);
        expect(maxDrawableCards(2, 0)).toBe(2);
        expect(maxDrawableCards(2, 5)).toBe(7);
        expect(maxDrawableCards(0, 0)).toBe(0);
        expect(maxDrawableCards(5, 3)).toBe(8);
    });

    // 11. 'max drawable clamps negatives to zero'
    it('max drawable clamps negatives to zero', () => {
        expect(maxDrawableCards(-1, 5)).toBe(5);
        expect(maxDrawableCards(5, -2)).toBe(5);
        expect(maxDrawableCards(-1, -1)).toBe(0);
    });
});

describe('effectiveDrawCount', () => {
    // 12. 'effective draw does as much as you can'
    it('effective draw does as much as you can', () => {
        expect(effectiveDrawCount(5, 5, 0)).toBe(5);
        expect(effectiveDrawCount(5, 2, 0)).toBe(2);
        expect(effectiveDrawCount(5, 2, 5)).toBe(5);
        expect(effectiveDrawCount(8, 2, 5)).toBe(7);
        expect(effectiveDrawCount(3, 0, 0)).toBe(0);
        expect(effectiveDrawCount(0, 2, 5)).toBe(0);
    });

    // 13. 'effective draw with full discards'
    it('effective draw with full discards', () => {
        // Max drawable is 10. Requested 10 -> 10.
        expect(effectiveDrawCount(10, 4, 6)).toBe(10);
        // Max drawable is 10. Requested 12 -> 10.
        expect(effectiveDrawCount(12, 4, 6)).toBe(10);
    });
});
