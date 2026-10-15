# Infected + Item card data (Premier Edition)

Source: fandom per-card pages (fetched 2026-10-15) + rulebook scans.
Format: id — name — copies — HP / Damage / Decorations — effect.
? = GAP: fill from BGG "RE DBG Master Card List" (filepage 83287) before data entry.

## Infected (Mansion deck — 33 total: copies must sum to 33)
- ma-001 Majini ×3 — HP ? / dmg ? / dec ? — effect ? (wiki page has no stats)
- ma-002 Zombie (Male) ×2 — 20 HP / 20 dmg / 1 dec (rulebook scan) — no effect
- ma-003 Zombie (Female) ×2 — 15 HP / 10 dmg / 1 dec —
  on defeat: choose a Player; that Player cannot play Actions on their next turn
- ma-004 Zombie Butcher ×3 — 15 HP? / 10 dmg? / 1 dec (rulebook scan showed 15/10/1) — effect ?
- ma-005 Bui Kichwa ×3 — 10 HP / 10 dmg? / dec ? — weakest in set (rulebook example: 10 HP)
- ma-006 Licker ×3 — 40 HP / 30 dmg / 3 dec — no effect
- ma-007 Nemesis (T-Type) ×1 — HP ? / dmg ? / dec ? —
  effect: when revealed? deals +10 damage to each character?? (wiki: Guardian of Insanity
  copy "inflicts +10 damage to each character when revealed"; Nemesis itself — VERIFY;
  rulebook: "without considering the +20 Damage inflicted by Nemesis' effect" per El Gigante
  page → Nemesis dmg 40 + effect +20? VERIFY)
- ma-008 Hunter ×2 — HP ? / dmg ? / dec ? — effect ?
- ma-009 Mimicry Marcus ×2 — 30 HP / 20 dmg / 2 dec — no effect
- ma-010 Uroboros Aheri ×1 — 90 HP / 70 dmg / 8 dec — BOSS: defeat ends game;
  if not defeated: shuffle back into Mansion deck (not bottom)
- ma-011 Dr. Salvador ×3 — 20 HP / 15 dmg / 2 dec — no effect
- ma-014 Gatling Gun Majini ×3 — 40 HP / 25 dmg / 4 dec —
  +5 damage per every 10 Ammo in exploring player's play area (FAQ: increments of total ammo)
- ma-015 Cerberus ×3 — 25 HP / 10 dmg / 2 dec — no effect
- ma-016 El Gigante ×1 — 40 HP / 40 dmg / dec ? — effect ?
- ma-017 Executioner ×1 — 30 HP / 25 dmg / 3 dec —
  rulebook scan: "When this Infected is defeated, choose a player and Skip that player's
  next turn." (NOTE: earlier digest said on-defeat skip; wiki/rulebook text: ON DEFEAT
  choose a player → skip their next turn. Correct the engine spec accordingly!)
Copies sum check: 3+2+2+3+3+3+1+2+2+1+3+3+3+1+1 = 33 ✓ (matches rulebook "All Infected
cards (33 total)")

## Items
- it-001 Green Herb ×6 — cost 20 — trash to heal 20, OR trash this + another Green Herb
  from hand to heal 60 (rulebook scan exact text)
- it-002 Yellow Herb ×3 — MANSION ONLY (not purchasable) — when gained via Explore:
  attach to Character; +10 max Health; following turn heal 10 (wiki) — VERIFY exact text
- it-003 First Aid Spray ×5 — cost 60 — trash to heal Character to full

## Corrections to RULES-DIGEST (apply)
- Executioner: skip-a-player effect triggers ON DEFEAT (not on non-defeat).
- Zombie (Female): on defeat — chosen player cannot play Actions next turn (NEW effect,
  add InfectedEffect kind "noActionsNextTurnOfAPlayerOnDefeat" to types union).
- Yellow Herb: attach + maxHp+10 + heal 10 next turn (not just plusMaxHp20 — wiki says 10;
  rulebook item analysis says Yellow Herb "increases Maximum Health" — VERIFY 10 vs 20).

## Tokens (Mansion, 2 total)
- ma-012 Rocket Launcher Case ×1 — gain 1 Rocket Launcher (we-008); trash token after
- ma-013 Gatling Gun Case ×1 — gain 1 Gatling Gun (we-007); trash token after
