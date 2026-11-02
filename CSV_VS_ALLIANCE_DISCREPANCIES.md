# CSV vs `game-core/src/data/alliance.ts` — Discrepancy Report

Source CSV: `Untitled spreadsheet - Sheet1.csv` (Alliance edition card list). Target: `game-core/src/data/alliance.ts`.

## Summary

The CSV is a **partial, differently-named** card list. It covers 13 weapons, 23 infected/events, 10 characters, 10 actions, 2 items, 1 ammo. The TS file is a larger, re-themed set where many IDs are reused for *different* cards. Direct ID→name mismatches are the main problem.

## Weapon mismatches (same ID, different card)

| ID | CSV name | TS name | Notes |
|---|---|---|---|
| WE-018 | Grenade Launcher [F. Grenade] (cost 80, ammo 0, dmg 20) | Standard Sidearm (cost 30, ammo 10, dmg 10) | CSV's Grenade Launcher exists in TS as `we-018g`. ID collision. |

All other 12 weapon IDs (WE-004, 005, 009, 010, 017, 019, 020, 021, 022, 023, 024, 025) match by name, copies, cost, ammo, damage. ✓

## Character mismatches

- CSV CH-011 Carlos Oliveira: HP 90, abilities Level1(2)/Level2(8). TS `ch-011`: HP 85, different abilities text. (stat + ability text differ)
- CSV CH-012 Josh Stone: HP 80. TS `ch-012`: HP 75.
- CSV CH-013 Steve Burnside: HP 70. TS `ch-013`: HP 95.
- TS only defines 3 characters (ch-011/012/013); CSV defines 10 (CH-011..CH-020). Missing in TS: CH-014 Jack Krauser, CH-015 Hunk, CH-016 Jill, CH-017 Billy, CH-018 Leon, CH-019 Chris, CH-020 Claire.

## Action mismatches (ID reused for unrelated cards)

| ID | CSV name | TS name |
|---|---|---|
| AC-013 | Partners (cost 30) | Longbow (cost 30) |
| AC-014 | Star-Crossed Duo (cost 40) | Grenade (cost 40) |
| AC-015 | Great Ambition (cost 50) | Back to Back (cost 40) |
| AC-016 | Archrival (cost 30) | Reload (cost 50) |
| AC-017 | Fierce Battle (cost 80) | Single Shot Rifle w/Scope (cost 50) |
| AC-018 | Uroboros Injection (cost 60) | Special Ops Rifle (cost 80) |
| AC-019 | Quirck of Fate (cost 30) | (not present) |
| AC-020 | Cornered (cost 30) | High Caliber (cost 30) |
| AC-021 | Gathering Forces (cost 90) | Quick Reload (cost 20) |
| AC-022 | Desperate Forces (cost 70) | Adrenaline Shot (cost 30) |

All 10 CSV actions are missing from TS under their CSV names; TS reuses the IDs for different actions.

## Infected / Events (MA-022..MA-040)

None of these IDs exist in alliance.ts (TS has no MA-* infected at all). Entirely missing: Lurker, Infected Bat, Licker Beta, Duvalia, Garrador, Zombie (Male), Kipepeo, Albert Wesker, Cephalo, Proto Tyrant, Iron Maiden, Zombie Horde, Nosferatu, Los Illuminados Monk, Reaper, Guardian of Insanity, and events Explosive Barrel, Collapsing Floor Trap, Laser Targeting Device.

## Items / Ammo

- IT-001 Green Herb: CSV qty 6 cost 20; TS `it-004` Green Herb qty 6 cost 20 (ID differs: CSV IT-001 vs TS IT-004). TS also has IT-004 = Red Herb (CSV IT-004) — ID collision.
- AM-004 Treasure: CSV qty 10 cost 40; TS `am-004` Ammo x5 (different card, same ID).

## Recommendation

Decide which naming wins. If CSV is canonical, alliance.ts needs: rename/re-ID conflicting cards (WE-018g→WE-018, AC-* actions, IT-004 Red Herb, AM-004), add missing MA-*/CH-*/AC-*/IT-001 entries, and align Carlos/Josh/Steve stats. If TS is canonical, the CSV is a stale/variant list and should not drive changes.