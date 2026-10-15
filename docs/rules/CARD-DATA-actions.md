# Action card data (Premier Edition, AC-001..AC-012)

Source: fandom per-card pages (fetched 2026-10-15) + rulebook card scans (consistent).
Format: id — name — copies — cost(Gold) — bonus icons — text effect — mode notes.

- ac-001 Mansion Foyer ×10 — cost 30 — +2 Cards — no text effect. Story.
- ac-002 Deadly Aim ×5 — cost 50 — +20 Ammo — all your Weapons get +10 damage this turn. Story.
- ac-003 Shattered Memories ×5 — cost 20 — (icons? VERIFY) — trash up to 2 cards from your
  discard pile; trash this card after use ("must be trashed after its effect" — VERIFY if
  this means the card itself is trashed/exiled). Story.
- ac-004 Escape from the Dead City ×10 — cost 70 — +1 Card, +2 Actions — no text. Story.
- ac-005 Reload ×5 — cost 50 — +2 Actions, +20 Ammo — move 1 Weapon from your discard pile
  to your hand (Prompt choice). Story.
- ac-006 The Merchant ×6 — cost 50 — +1 Buy, +1 Card, +20 Gold — no text. Story.
- ac-007 Umbrella Corporation ×5 — cost 50 — +1 Action, +2 Cards — move 1 card from your
  hand to the top of your Inventory (Prompt choice). Story.
- ac-008 Back to Back ×5 — cost ? — +1 Action, +10 Gold? — VERSUS ONLY: discard from hand
  to lower damage of 1 opposing weapon by 20. NOT in First Timer scenario.
- ac-009 Item Management ×5 — cost 30 — icons? VERIFY — trash 1 Ammo card from hand to gain
  an Ammo card worth at least 30 Gold more (x10→x20→x30) (Prompt choice). Story.
- ac-010 Ominous Battle ×5 — cost 60 — +3 Cards, +10 Gold — trash 1 card from your hand
  (Prompt choice). Story.
- ac-011 Master of Unlocking ×3 — cost 30 — icons? VERIFY — all other players reveal top
  card of their Inventory; you may take each revealed Weapon (to your discard? VERIFY dest).
  Story scenarios include it.
- ac-012 Struggle for Survival ×5 — cost 30 — +1 Action, +1 Explore — VERSUS-flavored
  defensive: may discard from hand to set damage of 1 weapon (cost <= 40) being used to 0.
  NOT in First Timer scenario list? — NOTE: rulebook Versus section says add Struggle +
  Back to Back. First Timer list does NOT include them. Story-legal but irrelevant in v1
  First Timer; still enter data.

## First Timer scenario (18 piles) — CONFIRMED from rulebook
Basic Resources (6): Ammo x10 (AM-001), Ammo x20 (AM-002), Ammo x30 (AM-003),
Handgun+Burst-Fire Handgun (combined), Combat Knife+Survival Knife (combined), Green Herb.
Added (12): Umbrella Corporation, Mansion Foyer, Escape from the Dead City, Deadly Aim,
Shattered Memories, The Merchant, Reload, Grenade, Six Shooter,
Pump-Action+Automatic Shotgun (combined), Bolt-Action+Semi-Automatic Rifle (combined),
Assault Machine Gun+Full-Bore Machine Gun (combined).

## v1 engine implications (ActionEffect union additions needed in types.ts)
- trashUpToTwoFromDiscard (ac-003, Prompt multi-choice)
- upgradeAmmoBy30Gold (ac-009)
- stealRevealedWeaponsFromOpponentsTopCards (ac-011)
- versus-only reactive kinds (ac-008/ac-012): keep text-only `generic` in v1 (not in
  First Timer; Story Mode ignores them)
