# Luis Sera (CH-036) — L1 Spec

## Ability
`optionalPlusOneCardWithDiscardCondition` (level 1, requires level >= 3).

## Trigger
At the start of the player's turn, if Luis is their active character and they have the ability at their current level.

## Condition
If the player's discard pile has 10 or fewer cards, offer a prompt to draw +1 card.
If discard pile has > 10 cards, no prompt, no card.

## Prompt contract
- Prompt kind: `luisPlusOneCard` (or reuse existing `drawCard` prompt if available)
- Options: Yes / No
- On Yes: draw 1 card from inventory to hand (using drawWithReshuffle)
- On No: nothing

## Resolution
When prompt resolves with Yes, add 1 card to hand. When No, no change.

## L2 (separate, not in this spec)
On defeat of an infected: prompt to move any subset of discard cards to bottom of inventory in chosen order.
", "path">
C:/Users/moralesem/Downloads/dev/REDBG/SPEC_LUIS_L1.md