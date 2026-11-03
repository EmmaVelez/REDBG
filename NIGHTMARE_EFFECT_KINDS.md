# NIGHTMARE_EFFECT_KINDS — scoping doc (no type changes yet)

Source: `game-core/src/data/nightmare.ts` (placeholder text only) + `~/Downloads/nightmare - Sheet1.csv`.

## Distinct effect phrases (CSV)

Weapons (WE-032..WE-042): +1 card +1 action; +2 cards +1 action; +10 dmg per Ammo in play area; +20 dmg if inventory ≥10; choose player discard; each non-exploring player discards; +20 gold; +10 dmg per Machine Gun in discard; +1 explore + revealed infected ≤40 HP deal 0 damage + trash after use; N.A.; +5 dmg per infected battled.

Infected (MA-054..MA-069): gain Ammo x10 (+per level) + shuffle back if not defeated; extra turn on defeat; all used weapons -10 dmg on reveal; gain top card from resource on defeat; N.A.; reveal: characters take 50-10*inventory damage; cannot be defeated if ≥3 actions; +20 gold +1 buy on defeat; cannot be defeated if inventory ≤5; heal 20 on defeat; +30 dmg if character has ≥30 damage; most-decorated lowers max HP 20; -20 HP if using ≥2 weapons.

Items/Events (MA-070..MA-072): attach Treasure Map, later remove for +3 cards +20 gold; +30 gold +1 buy + remove; P.R.L. 412 reveal/top mansion, auto-defeat if infected by lowest decorations else shuffle.

## Proposed new effect-kind stubs (not yet added to types)

### WeaponEffect
- `gainCardsAndActions { cards, actions }` — Silver Ghost/Punisher
- `plusDamagePerAmmoInPlayArea { amount }` — Mine Thrower
- `plusDamageIfInventoryAtLeast { threshold, amount }` — Broken Butterfly
- `choosePlayerDiscard { count }` — Single Shot Rifle
- `allNonExploringPlayersDiscard { count }` — Special Ops Rifle
- `gainGoldThisTurn { amount }` — Machine Pistol
- `plusDamagePerWeaponTagInDiscard { tag, amount }` — Gangster's Machine Gun
- `grantExploreAndSuppressLowHpInfected { hpThreshold }` + trashAfterUse — Flashbang
- `plusDamagePerInfectedBattled { amount }` — Incendiary Grenade

### InfectedEffect
- `onNotDefeatedGainAmmoAndShuffle { base, perLevel }` — Osmund Saddler
- `extraTurnOnDefeat` — Bitores Mendez
- `onRevealWeaponDamagePenalty { amount }` — Regenerator
- `onDefeatGainTopResourceCard` — Jack Krauser
- `onRevealDamageToExploringCharacters { base, perInventoryCard }` — Militia Rocket Launcher
- `cannotBeDefeatedIfActionsAtLeast { count }` — Novistador
- `onDefeatGainGoldAndBuy { gold, buys }` — Zombie Security Guard
- `cannotBeDefeatedIfInventoryAtMost { count }` — Verdugo
- `onDefeatHealExploring { amount }` — Ivy
- `onRevealBonusDamageIfCharacterDamaged { threshold, amount }` — Neptune
- `mostDecoratedLowersMaxHp { amount }` — Hunter
- `onRevealHealthPenaltyIfMultipleWeapons { count, amount }` — Cerberus

### ItemEffect
- `attachThenRemoveForCardsAndGold { cards, gold }` — Treasure Map
- `gainGoldAndBuyThenRemove { gold, buys }` — Hidden Treasure

### ActionEffect
- `prl412RevealAndAutoDefeatOrShuffle` — P.R.L. 412

### CharacterAbility
- None new from this CSV (characters are tokens).

## Implementation note
Stubs are proposals only; no changes to `WeaponEffect`/`InfectedEffect`/`ItemEffect`/`ActionEffect`/`CharacterAbility` unions in `types.ts` yet. Add kinds incrementally with engine handlers and tests; follow existing discriminated-union pattern (`{ readonly kind: "..."; ... }`).
