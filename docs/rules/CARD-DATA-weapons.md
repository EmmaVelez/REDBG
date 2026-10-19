# Weapon card data (Premier Edition, WE-001..WE-016)

Source: fandom per-card pages (fetched 2026-10-15) + rulebook card scans.
Format: id — name — copies — cost(Gold) / ammoReq / damage — type — effect.
Stats marked ? = verify from card photo / BGG master list before data entry.

- we-001 Grenade ×5 — cost 50? / ammoReq 0 / dmg 15 — Explosive —
  splash: 5 dmg to players adjacent to target (Story: adjacent to attacked Infected's
  controller? — VS/adjacency only matters in Versus; in Story splash is mostly no-op;
  v1 engine: treat as plain 15 dmg weapon + tag explosive)
- we-002 Longbow ×5 — cost 110 / ammoReq 0 / dmg 25 — (unique pile) — no effect
- we-003 Submission ×5 — cost 20 / ammoReq 0 / dmg 5 — Melee —
  +5 dmg if user has 80+ Health (Story/Merc)
- we-004 Combat Knife ×11 — cost 0 / ammoReq 0 / dmg 5 — Knife — no effect
- we-005 Survival Knife ×1 — cost 50 / ammoReq 0 / dmg 10 — Knife —
  VERIFIED via card scan (we005-survival-knife.jpg): "This Weapon gets +5 Damage for
  every other 'Knife' Weapon used this turn." Engine: plusDamagePerKnifeUsed — counts
  OTHER knives in the same attack PLUS knives used in earlier explores this turn
  (log scan to last endTurn). Implemented + tested 2026-10-18.
  NOTE: rulebook says knife pile = Combat Knife + Survival Knife combined; wiki says
  Survival Knife sits at the BOTTOM of the knife pile — verify which (combined shuffle vs
  fixed bottom). Rulebook Ch IV explicitly says combined+shuffled → follow rulebook.
- we-006 Six Shooter ×5 — cost 50? / ammoReq 50 / dmg 50 — Magnum — no effect
  (rulebook scan showed "50 Ammo Requirement 50 Damage 90?" — verify cost/dmg)
- we-007 Gatling Gun ×1 — token-only (Mansion) — ammoReq X / dmg X: equals the player's
  total current Ammo when used (VERIFY printed wording) — gained via Gatling Gun Case token
- we-008 Rocket Launcher ×1 — token-only (Mansion) — cost n/a / ammoReq 0? / dmg 100+
  (wiki: kills any Infected instantly; "single most damaging weapon") — after use, trash
  (returns to Resource? rulebook Trash = back to Resource Pile; but RL is not a resource
  pile card — FAQ: Jill L2 sends explosives to discard instead of trash → RL normally
  TRASHED after use; verify destination: Mansion? wiki says "placed back in the Mansion")
  VERIFY exact dmg + ammoReq from card photo.
- we-009 Handgun ×9 — cost 20 / ammoReq 20 / dmg 10 — Pistol — no effect
- we-010 Burst-Fire Handgun ×1 — cost 60? / ammoReq 30 / dmg 20 — Pistol —
  +20 dmg when used together with another weapon in same Explore (rulebook scan: cost 60?)
- we-011 Assault Machine Gun ×4 — cost 30 / ammoReq 40 / dmg 20 — Machine Gun — no effect
- we-012 Full-Bore Machine Gun ×1 — cost 100 / ammoReq 70 / dmg 40 — Machine Gun —
  +30 dmg if player has MORE than 100 Ammo this turn (total 70)
- we-013 Pump-Action Shotgun ×4 — cost 40? / ammoReq 40 / dmg 25 — Shotgun — +1 Explore
- we-014 Automatic Shotgun ×1 — cost 80 / ammoReq 80 / dmg ? — Shotgun —
  instantly defeats any Infected with 40 Health or less; +1 Explore
- we-015 Bolt-Action Rifle ×4 — cost 50? / ammoReq 60? / dmg ? — Rifle —
  reveal top card of Inventory: if its Gold cost >= 40, +30 dmg (VERIFY cost/ammo/dmg)
- we-016 Semi-Automatic Rifle ×1 — cost ? / ammoReq ? / dmg ? — Rifle —
  +10 dmg per Action card played this turn (VERIFY stats)

## Type tags confirmed so far
Knife: we-004, we-005 | Pistol: we-009, we-010 | Magnum: we-006 | Machine Gun: we-011,
we-012 | Shotgun: we-013, we-014 | Rifle: we-015, we-016 | Melee: we-003 |
Explosive: we-001, we-008 | (we-002 Longbow type? — verify; we-007 Gatling type Machine Gun?)

## v1 engine implications
- Gatling Gun (X = current ammo) and Semi-Auto (+10/action), Bolt-Action (reveal check),
  Automatic Shotgun (instant kill <=40 HP), Submission (+5 if hp>=80) need dedicated
  WeaponEffect kinds — extend the union in types.ts when data task lands:
  plusDamagePerActionPlayedThisTurn, instantKillAtOrBelowHp, plusDamageIfSelfHpAtLeast,
  damageEqualsCurrentAmmo, revealTopOfInventoryCostGate+30.
- Grenade splash adjacency: Story Mode splash has no valid targets (no adjacency between
  players and infected) — VERIFY FAQ; likely only Versus-relevant → no-op in v1.
