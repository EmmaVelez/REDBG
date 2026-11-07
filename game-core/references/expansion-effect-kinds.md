# Expansion card implementation: pitfalls and workflow (Alliance, Mercenaries, future sets)

## Pitfall: Duplicate IDs in expansion cards

Every card id in the database must be UNIQUE. `ALL_CARDS` is built as
`[...PREMIER_CARDS, ...ALLIANCE_CARDS, ...OUTBREAK_CARDS, ...MERCENARIES_CARDS, ...NIGHTMARE_CARDS]`
and `setup()` builds `defsById`/`cardDefs` with a plain object/Map assignment, so
when two files declare the same id the LAST one wins — a later, emptier
definition silently shadows the real card (this is how Alliance `we-015` lost its
"+30 damage" effect, and how the Outbreak mansion served Nightmare bosses).
- **Correct**: one definition per id. Re-prints of a base card keep the original
  (Premier) definition; do not add a second copy in the expansion file.
- **Wrong**: two different cards sharing an id. If the official numbering really
  does collide (Outbreak MA-054..057 vs Nightmare MA-054..057), disambiguate with
  an explicit suffix (`ma-054o`..`ma-057o`) rather than letting one shadow the other.
- **Action**: Grep all card arrays for id duplicates before commit
  (`new Set(ALL_CARDS.map(c => c.id)).size === ALL_CARDS.length`). Test pile
  construction counts to catch missing/duplicate cards before runtime.

## Pitfall: Effect kind consistency (tsc errors)

Every NEW weapon effect kind MUST exist in `types.ts` union BEFORE using it:
- **Wrong**: Adding `"damagePerX": 10` directly to a card def — compiles but fails typecheck
- **Correct**: Define `| { readonly kind: "damageEqualsDiscardPileMultiplier"; readonly baseDamage: number }` in the union, then use it in card effects
- **Action**: Before implementing a new mechanic (scalable damage, conditional triggers), write the union member first. See this file for naming convention and when to encode vs using `[REQUIRES-ENGINE]` text-only variant.

## Pitfall: Weapon effects vs item effects zone confusion

Weapon-specific effects belong in `weaponEffects[]`. ItemEffects is for permanent/attached abilities (Yellow Herb's max HP, character attach bonuses).

Correct pattern:
```typescript
{
  kind: "damageEqualsFiveTimesDiscardPile",    // weapon effect (damage formula)
}
```

Wrong zone misuse causes engine runtime errors as it never reads `itemEffects` on weapons.

## Pitfall: Cross-verify against external card lists

When provided with Cards.txt or similar bulk dumps:
- DO NOT assume all IDs are valid — check each against wiki/BGG rulebook data sources
- Verify copy counts from Box Layout/Game Content table in the official manual
- Use Cards.txt as a "user wants to implement" checklist, not production source of truth

## Actionable workflow for new expansion sets

1. Confirm ID uniqueness across ALL sets combined (premier, alliance, promos)
2. Verify all effect kinds exist in `types.ts` union (grep the file)
3. Ensure weapons use `weaponEffects[]`, items use `itemEffects[]`
4. Test pile composition counts match expected totals from rulebook
5. Create `docs/rules/{SET}-ENGINE-RULINGS.md` for any contract changes

## References

- `game-dev-local-llm/SKILL.md#Phase 0: Rulebook Verification` — reading before implementing
- `card-data-sources.md` — sources for Premier and expansion cards, data verification order