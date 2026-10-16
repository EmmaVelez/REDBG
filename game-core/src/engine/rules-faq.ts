
import type { CharacterAbility } from '../types';

/** FAQ ch. VIII: Jill L1 adds damage to each explosive weapon used. */
export function explosivesPlusDamageFor(abilities: readonly CharacterAbility[] | undefined, explosiveWeaponsUsed: number): number {
    if (!abilities || explosiveWeaponsUsed <= 0) {
        return 0;
    }

    const ability = abilities.find(a => 
        a.kind === 'explosivesPlusDamage' && a.level === 1
    );

    if (ability && 'amount' in ability) {
        // We assert the type here because the find operation guarantees the kind and level,
        // and the spec implies that if the kind matches, 'amount' exists.
        const damageAbility = ability as { kind: 'explosivesPlusDamage', amount: number, level: 1 };
        return damageAbility.amount * explosiveWeaponsUsed;
    }

    return 0;
}

/** FAQ ch. VIII: Explosive weapons go to discard only at level 2. */
export function explosiveWeaponsGoToDiscard(abilities: readonly CharacterAbility[] | undefined): boolean {
    if (!abilities) {
        return false;
    }

    return abilities.some(a => 
        a.kind === 'explosivesGoToDiscardInsteadOfTrash' && a.level === 2
    );
}

/** FAQ ch. VIII: Gatling Majini scales per full 10 Ammo. */
export function damagePerFull10Ammo(ammo: number, amountPer10: number): number {
    if (ammo <= 0) {
        return 0;
    }
    return amountPer10 * Math.floor(ammo / 10);
}

/** FAQ ch. VIII: Maximum number of cards a player can currently draw. */
export function maxDrawableCards(inventoryCount: number, discardCount: number): number {
    const safeInventory = Math.max(0, inventoryCount);
    const safeDiscard = Math.max(0, discardCount);
    return safeInventory + safeDiscard;
}

/** FAQ ch. VIII: Actual cards drawn = min(requested, maxDrawableCards). */
export function effectiveDrawCount(requested: number, inventoryCount: number, discardCount: number): number {
    if (requested <= 0) {
        return 0;
    }
    const max = maxDrawableCards(inventoryCount, discardCount);
    return Math.min(requested, max);
}
