# Expansion card implementation: pitfalls and workflow (Alliance, Mercenaries, future sets)

## Pitfall: Duplicate IDs in expansion cards

Expansion cards often re-use base game names (Alliance "Combat Knife" matches Premier's). DO NOT implement both; verify whether intentional or wiki transcription error:
- **Correct**: Same ID is a data deduplication rule — `alliance.ts` lists Alliance cards first so setup takes the alliance version for we-004/we-005 etc.
- **Wrong**: Two different card IDs in the same set = bug
- **Action**: Grep all card arrays for id duplicates before commit. Use `ALLIANCE_CARDS` entries that override `PREMIER_CARDS` entries for shared IDs (setup stops at first match). Test pile construction counts to catch missing/duplicate cards before runtime.

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