# Character card data (Premier Edition, CH-001..CH-010)

Source: residentevil.fandom.com per-card pages (fetched 2026-10-15) + rulebook card scan.
Format: id — name — maxHp — L1 gate — L2 gate — L1 ability — L2 ability.
L1/L2 gates VERIFIED 2026-10-16 against BGG master thread "Character Cards Details"
(thread 574996) + fandom wiki per-card pages (they agree wherever both exist).
Level model (user ruling): characters START at LEVEL 0; each tier has its own decoration
gate — L1 gate = level1At (Chris 0 so he starts with his L1; Krauser 1; Wesker/Leon/
Claire/Sheva/Barry/Rebecca 2; Ada 4; Jill 5), L2 gate = level2At.

- ch-001 Albert Wesker — 100 HP — L1 at 2 — L2 at 9 —
  L1: When Wesker attacks a Character or Explores, +20 Gold that turn.
  L2: STORY MODE: during your turn choose a Player; that Player gets +1 Explore and must
      Explore at least once on their next turn.
- ch-002 Leon S. Kennedy — 80 HP — L1 at 2 — L2 at 6 —
  L1: All your "Pistol" weapons get -10 Ammo Requirement.
  L2: All your "Pistol" weapons can be used twice per turn.
- ch-003 Claire Redfield — 70 HP — L1 at 2 — L2 at 6 —
  L1: Your Ammunition cards give +10 Ammo (extra).
  L2: Your Ammunition cards give +10 Gold (extra).
- ch-004 Sheva Alomar — 80 HP — L1 at 2 — L2 at 4 —
  L1: During your turn, exchange 1 card in hand with the top card of your Inventory.
  L2: All your "Rifle" weapons get -20 Ammo Requirement.
- ch-005 Barry Burton — 90 HP — L1 at 2 — L2 at 7 —
  L1: When attacking/exploring, one of Barry's weapons gets +5 damage for the turn.
  L2: All "Magnum" weapons get +20 damage.
- ch-006 Ada Wong — 80 HP — L1 at 4 — L2 at 8 —
  L1: Reveal top of Mansion without engaging/effect.
  L2: Exchange your Buy for an additional Action.
- ch-007 Jack Krauser — 80 HP — L1 at 1 — L2 at 7 —
  L1: At beginning of your turn, may gain 1 "Knife" weapon.
  L2: All your "Knife" weapons get +5 Damage.
- ch-008 Chris Redfield — 120 HP — L1 at 0 — L2 at 4 —
  L1: Chris cannot be healed and cannot attach non-Infected cards.
  L2: 1 Weapon Chris uses gets +5 damage for each Infected he is fighting.
- ch-009 Jill Valentine — 80 HP — L1 at 5 — L2 at 8 —
  L1: All your "Explosive" weapons get +5 damage.
  L2: Your Explosive weapons go to discard instead of being trashed.
- ch-010 Rebecca Chambers — 70 HP — L1 at 2 — L2 at 4 —
  L1: Cards you trash via effects may go to other players' discard piles instead.
  L2: You may trash cards from hand whenever you please.

## Weapon-type tags implied (for CardDef.weaponTags)
Pistol (Handgun, Burst-Fire Handgun, Six Shooter=Magnum?), Rifle (Bolt-Action, Semi-Auto,
Assault MG?, Full-Bore MG?), Knife (Combat Knife, Survival Knife), Magnum (Six Shooter),
Explosive (Grenade, Rocket Launcher). VERIFY each weapon's printed type from card photos:
rulebook shows Weapon Type as a printed field. Known from scans: WE-004 Combat Knife type
"Melee"? (scan shows type line but text garbled) — verify in data task.

## Notes
- L1/L2 gates verified 2026-10-16 (BGG thread 574996 + fandom wiki agree). v1 engine used
  level2At only with L1 implied at 0; the level-0 ruling added level1At per character.
- v1 engine: implement machine-readable abilities for Chris (noHealing / plusDamagePerInfected)
  and Jill (explosive tag interactions) since rulebook FAQ covers them; model the rest as
  CharacterAbility generic + text (no-op in v1) OR extend the union when their engine
  support tasks come. Prefer adding union members per character when data task lands.