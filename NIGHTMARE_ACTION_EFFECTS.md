# NIGHTMARE_ACTION_EFFECTS — scoping doc (no type changes yet)

Source: `game-core/src/data/nightmare.ts` (placeholder text only) + `~/Downloads/nightmare - Sheet1.csv` (rows AC-032..AC-041).

## Unimplemented Nightmare action cards

| id | name | copies | cost | card text |
|---|---|---|---|---|
| ac-032 | Lonewolf | 5 | 80 | You get +10 ammo. When one of your characters explores, select one weapon he is using. That weapon gets +5 damage this turn for each card in your discard pile. |
| ac-033 | High Value Targets | 5 | 60 | You get +1 action. You get +5 gold and +5 ammo during this turn for each card in your inventory. |
| ac-034 | Raccoon City PD | 5 | 50 | You get +20 ammo. Discard cards from the top of your inventory until you reveal a weapon. Move that weapon to your hand. |
| ac-035 | PDA | 10 | 20 | Look at up to the top three cards of your inventory. Trash one of those cards, then return the others to the top or bottom of your inventory in any order. |
| ac-036 | Toe to Toe | 10 | 70 | You get +1 action. Draw one card for every five cards in your inventory. |
| ac-037 | A Gift? | 5 | 30 | You get +2 cards. Discard your inventory. |
| ac-038 | Mind Control | 5 | 80 | Choose another player. That player reveals his hand. Choose an action card with a cost of 70 or less. That player discards that card, then you copy its bonus icons and effects twice. |
| ac-039 | Long Awaited Dawn | 5 | 50 | You get +2 actions. Move up to two cards from a player's discard pile to the top of his inventory in any order. |
| ac-040 | Vengeful Intention | 5 | 40 | You get +2 cards. Your character takes 10 damage. You may play as many actions as you like this turn. Each time you play another action this turn, your character takes 10 damage. |
| ac-041 | Symbol of Evil | 5 | 40 | Attach this card to your character. At the beginning of your turn, if that character has 10 or less health, trash this card. Otherwise, that character takes 10 damage and you get +1 card. |

## Proposed new ActionEffect kinds (not yet added to types)

- `gainAmmo { amount }` — Lonewolf (+10 ammo)
- `onExploreWeaponDamagePerDiscardCard { amount }` — Lonewolf (+5 dmg/weapon this turn per discard card)
- `gainAction` (existing?) + `gainGoldAndAmmoPerInventoryCard { gold, ammo }` — High Value Targets
- `gainAmmo { amount }` + `discardInventoryUntilWeaponToHand` — Raccoon City PD
- `lookAtTopInventory { count }`, `trashOneOfLooked`, `returnRestTopOrBottomInAnyOrder` — PDA
- `gainAction` + `drawCardsPerInventoryDivisor { divisor }` — Toe to Toe (1 per 5)
- `gainCards { count }` + `discardInventory` — A Gift?
- `chooseOtherPlayerRevealHand`, `chooseActionCardCostAtMost { maxCost }`, `discardChosen`, `copyBonusesAndEffectsTwice` — Mind Control
- `gainActions { count }` + `moveCardsFromDiscardToTopInventory { count, owner }` — Long Awaited Dawn
- `gainCards { count }`, `damageCharacter { amount }`, `unlimitedActionsThisTurn`, `damagePerAdditionalAction { amount }` — Vengeful Intention
- `attachToCharacter`, `beginTurnTrashIfHealthAtMost { threshold }`, `elseDamageAndDraw { damage, cards }` — Symbol of Evil

## Implementation note

Stubs are proposals only; no changes to `ActionEffect` union in `types.ts` yet. Add kinds incrementally with engine handlers and tests; follow existing discriminated-union pattern (`{ readonly kind: "..."; ... }`).
