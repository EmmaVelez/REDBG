# ALLIANCE Expansion — Engine Change Spec

Source of truth: official Bandai manual **RE_RuleBk.pdf v1.1** (preserved at
`docs/rules/alliance_rulebook.txt`) + fandom per-card pages + BGG box content list.
Status: **SPEC ONLY — nothing implemented yet.**

---

## 1. What the expansion adds

Alliance is the 2nd set (standalone, April 2011, Premier-compatible). It ships:

- **10 new Character cards** (CH-011…CH-020)
- **13 Weapon cards** (4 are Premier reprints: WE-004/005/009/010 — skip; 9 new: WE-017…025)
- **10 new Action cards** (AC-013…AC-022)
- **23 Mansion cards**: 16 Infected (MA-022…037), 3 Event cards (MA-038…040),
  4 Mercenary-mode Bonus cards (MA-018/019/020/021 — Time Bonus +1/+2/+3, Combo Bonus)
- **Item cards**: Green Herb ×6 (reprint), **Red Herb IT-004 ×5** (NEW), Yellow Herb (reprint)
- Ammo ×10/×20/×30 + Treasure (reprints)
- **New game mode: PARTNER MODIFICATION** — the headline feature
- The manual also documents two other modes (Mercenary, Versus) — see §7, out of scope for first pass

## 2. Party mode: PARTNER MODIFICATION (new game mode)

Players: 1–4. Every player controls TWO characters:

- **(A) CHOOSING CHARACTERS** — each player picks 2 characters; designates one **Main**,
  the other **Partner**. Main is always main; Partner is always partner.
- **(C) YOUR PARTNER** — Partner is a full character under your control: own Health,
  own base Damage, own effects. Partner **level = total Decorations attached to your
  Main character** (shared level), using the normal level-up rules.
- Partner has separate Health; damage lowers it just like the Main's.
- **(1) ATTACHING CARDS TO YOUR PARTNER** — during your turn, **spend 1 Action to
  Attach any Weapon from your Hand to your Partner**. Attached cards stay across turns.
  Max **2 Attached cards** on a partner (unless a character says otherwise). Attached
  cards are removed only by **replacement** (old card → your Discard Pile).
  Some Actions may also Attach to a Partner (Star-Crossed Duo AC-014, Archrival AC-016):
  while Attached, they give ONLY their listed effect per turn, not their Bonus Icons.
- **(2) EXPLORING WITH A PARTNER** — you play all your Weapons as normal, and you may
  also assign Ammo to your Partner's Attached Weapons. Only Attached weapons count as
  your Partner's. Partner and Main explore at the **same time**. **Before revealing**,
  you choose who is **LEADING** (Main or Partner). If you fail to defeat the revealed
  Infected, **the LEADING character takes the full damage** (not both).
- **(3) PARTNER DEATH** — Partner at ≤0 HP is **removed from the game permanently**;
  trash all cards attached to it. Main at ≤0 HP uses the normal downed/revive rules
  (max-HP −20, heal to it, draw 5, end turn).
- Main character death rules unchanged (pg-11 penalty).

## 3. New card types & mechanics

### 3.1 Event cards (MA-038/039/040) — new top-level card type
Revealed instead of an Infected while exploring; **resolve the effect immediately** (no
take-or-bottom choice). Effects:

- **MA-038 Explosive Barrel ×3**: if the exploring characters' total damage ≥ 80, each
  exploring character takes 30 damage; otherwise your characters deal +30 damage
  collectively and you get +1 Explore. Then remove this card from the game.
- **MA-039 Collapsing Floor Traps ×1**: reveal the next 2 Mansion cards; you are now
  battling any Infected among them. Shuffle any non-Infected revealed this way
  (incl. this card) back… then remove this event from the game. (Requires a
  multi-reveal battle + reshuffle interaction.)
- **MA-040 Laser Targeting Device ×1**: the player who revealed it gets +1 Explore
  and kills any revealed Infected instantly (even the finale boss); then resolve the
  card (remove/trash). (Insta-defeat bypasses HP; used with events/combos.)

### 3.2 "X" Machine-Gun weapons (WE-022, WE-023)
New weapon subtype where **Ammo Requirement and Damage are both "X" = amount of ammo
assigned to the weapon this explore**:

- **WE-022 Russian Assault Rifle ×4** — cost 40 Gold; X/X ammo/damage but
  **cannot use more than 20 Ammo** (so ≤20 dmg without bonuses). "Machine Gun" deck.
- **WE-023 Signature Special ×1** — cost 70 Gold; X/X ammo/damage, cap **60 Ammo**.
  Same Machine Gun deck pile as the Rifle (combined pile per manual).
- Carlos (CH-011) is designed around these (peek-then-assign synergy).

Engine impact: per-weapon ammo assignment needs an upper cap AND damage computed from
assigned ammo; the explore screen must let a player assign ammo per X-weapon.

### 3.3 Red Herb IT-004 ×5 (item)
Trash this Item **and** a Green Herb from your hand → heal a Character **AND their
Partner** to full. (In Story mode without a partner it still heals the Main to full;
the partner line is the new bit.)

### 3.4 Off-turn / reactive cards (Uroboros Injection AC-018)
Manual "NEW" callout: some Actions can be used during ANOTHER player's turn at no
Action cost. AC-018: "During your opponent's turn, when an Infected is revealed, you
can trash this card from your hand to give +20 health to any revealed Infected during
this turn." Engine impact: a new **reactive hand trash window during opponents'
explore reveal** — first real cross-player reaction in the engine. Also +2 Actions +1
Buy on its own turn (won't trigger).

### 3.5 "Las Plagas" typing (infected)
Cephalo (MA-030), Duvalia (MA-025, MA-028 Kipepeo) etc. interact with:
- WE-018 Grenade Launcher: "the next time a 'Las Plagas' Infected is revealed this
  turn, Defeat it immediately" (trash after use)
- Jill CH-016 L2 interacts with Las Plagas reveals
- Claire CH-020/Red-Green herb synergy
Engine impact: infected need a `plagas?: boolean` flag + a per-turn "next Las Plagas
revealed → defeated" pending flag.

### 3.6 Partner-attach actions (AC-014 Star-Crossed Duo, AC-016 Archrival)
Actions that Attach to your Partner; while attached they grant a passive per-turn
effect instead of their printed play effect:
- AC-014 Star-Crossed Duo (8×): when attached and your Partner **leads** an explore,
  1 of your Partner's Weapons gets +10 Damage that turn.
- AC-016 Archrival (5×): at the start of your turn, while attached to your Partner,
  you get +1 Action that turn.
- AC-013 Partners (5×), cost 30 gold — needs text verify; likely partner gating.
Engine impact: attachable actions need a NEW attached-card role (ActionAttached vs
WeaponAttached) + per-turn passive hooks at turn start / explore leading.

## 4. New characters (CH-011…CH-020) — data + ability kinds

| ID | Character | HP | L1 gate | L1 ability (data note) | L2 gate | L2 ability (data note) |
|----|-----------|----|---------|------------------------|---------|------------------------|
| CH-011 | Carlos Oliveira | 90 | 1? | Look at top Mansion card BEFORE assigning ammo/exploring | ? | If total damage to revealed Infected equals their HP (perfect explore), take 1 discard card to hand |
| CH-012 | Josh Stone | 80 | 0 | Cannot use Weapons costing ≥50 Gold | 4 | Your Partner may Attach up to 2 additional cards (cap 4) |
| CH-013 | Steve Burnside | 70 | 1 | Recover 10 HP at start of each turn | ? | Discard "Cornered" (AC-020) from hand: heal 20 AND +30 base damage |
| CH-014 | Jack Krauser | 90 | 0 (start) | May use only ONE weapon at a time | ? | +10 damage per card in your hand |
| CH-015 | HUNK | 70 | ? | Partner Mode: transfer damage he takes to his Partner; +2 extra cards if alone at turn start | ? | — |
| CH-016 | Jill Valentine (Brainwashed) | 90 | 1 | When Jill explores, ONE weapon she uses gets +10 damage if her Partner has ≤1 attached card | 6 | During another player's turn, when a "Las Plagas" infected is revealed, trash a "Flash Grenade" from your hand and apply its effect |
| CH-017 | Billy Coen | 80 | 1 | During your turn, you may gain one "Ammo x10"; if you do, +10 gold | 5 | During your turn, if 10+ cards in discard, move one to your hand |
| CH-018 | Leon S. Kennedy | 80 | 1 | During your turn, move one card from discard to the bottom of your Inventory | 7 | During your turn, move the bottom card of your Inventory to the top |
| CH-019 | Chris Redfield | 80 | 1? | ONE weapon he is using requires 20 less ammo, only if using exactly one weapon | ? | Lower ammo req of ONE chosen weapon type by 20 (player picks type) |
| CH-020 | Claire Redfield | 80 | 1? | When she trashes a Green or Red Herb from use, +20 base damage that turn | ? | If she trashes BOTH herbs combined, DOUBLE all damage she deals that turn |

Engine impact: new passive kinds — `peekMansionTopBeforeAmmoAssign` (Carlos),
`perfectExploreReward` (Carlos), `weaponCostLock` (Josh), `partnerAttachCapBonus` (Josh),
`healAtTurnStart` (Steve — exists? check `healFixed20`), `discardCardForHealPlusDamage`
(Steve), `singleWeaponOnly` + `damagePerCardInHand` (Krauser), `damageTransferToPartner`
+ `extraCardsIfAloneAtTurnStart` (HUNK), `partnerAttachedCountDamageBonus` (Jill),
`offTurnFlashGrenadeLasPlagas` (Jill), `gainAmmoX10ForGold` (Billy),
`discardToInventoryBottom` / `inventoryBottomToTop` (Leon), `singleWeaponAmmoDiscount`
(Chris), `chosenWeaponTypeAmmoDiscount` (Chris), `trashHerbForDamage` / `doubleDamageIfBothHerbs`
(Claire). NOTE: several L2 gates marked ? — pull from card scans before data entry.

## 5. New Infected (MA-022…037) — data only

| ID | Name | HP | Dmg | ★ | Copies | Notes |
|----|------|----|----|----|--------|-------|
| MA-022 | Lurker | 10 | 10 | 1 | 3 | no ability |
| MA-023 | Infected Bat | ? | ? | ? | 3 | effect triggers vs multi-explore players |
| MA-024 | Licker β | 35 | 20 | 3 | 2 | |
| MA-025 | Duvalia (Las Plagas) | ? | ? | ? | 2 | plaga |
| MA-026 | Garrador | 50 | ? | ? | 2 | |
| MA-027 | Zombie (Male) | 20 | ? | 1 | 3 | |
| MA-028 | Kipepeo (Las Plagas) | 20 | 20 | 1 | 3 | plaga |
| MA-029 | Albert Wesker (finale) | 90 | 70 | 8 | 1 | all OTHER revealed Infected +10 HP & +10 dmg this turn |
| MA-030 | Cephalo (Las Plagas) | ? | ? | ? | 3 | plaga; instantly killed by Grenade Launcher |
| MA-031 | Proto Tyrant | 60 | 40 | ? | 1 | 2nd strongest |
| MA-032 | Iron Maiden | 50 | 30 | ? | 2 | |
| MA-033 | Zombie Horde | 30 | 20 | ? | 3 | |
| MA-034 | Nosferatu | 55 | ? | ? | 2 | |
| MA-035 | Los Illuminados Monk | 15 | ? | ? | 2 | weakest |
| MA-036 | Reaper | 35 | 40 | 4 | 2 | effect if NOT defeated from damage |
| MA-037 | Guardian of Insanity | 30 | 20 | ? | 3 | |

Characters' gates/star values marked ? need card-scan verification before data entry
(same workflow as Premier pass).

## 6. Engine changes — concrete surface map

### 6.1 Types (`game-core/src/types.ts`)
- Card def: add `type: 'event'`; add `plagas?: boolean` on infected; add
  `ammoCap?: number` + `xAmmo?: boolean` on weapons; `set: 'premier' | 'promo'` → add `'alliance'`.
- PlayerState: new `partner?: PartnerState` { characterCardId, hp, maxHp, level: 0|1|2,
  attached: string[] (weapon+action instances), leading?: boolean at explore time };
  new `pendingXWeaponTrash?: ` (Grenade Launcher "next Las Plagas defeated" flag);
  new `reactiveTrashWindow?` state for AC-018 off-turn use.
- `Action` union: `attachToPartner`, `chooseLeader`, `assignAmmoPerWeapon` (or fold into
  explore), `trashForReaction` (AC-018 / Jill L2), `useYellowHerb` already exists.
- New prompt kinds: `chooseLeader`, `attachToPartnerTarget`, `offTurnReaction`,
  `perfectExploreRewardCard`, `weaponTypePick` (Chris), `discardForSteveEffect`.

### 6.2 Data (`game-core/src/data/cards.ts`)
- 10 characters, 9 weapons, 10 actions, 19 infected/event cards, Red Herb.
- New `ALLIANCE_CARDS` export; `set` field threading; partner mode scenario piles
  (manual "Partners in Escape" / "A Little Gun goes a Long Way" / "Tactical Advance" +
  base Alliance Story setup) in `SCENARIOS`; Alliance mansion modifications
  (add Monk ×2, Guardian ×3, Reaper ×2).

### 6.3 Engine
- `game.ts` — mode selection (`story` | `partner`); two-character setup; partner
  level-from-main-decorations; turn-start hooks for attachable actions (Archrival),
  Steve heal, HUNK empty-partner cards.
- `actions.ts` — `attachToPartner` (spend 1 Action, cap enforcement, replacement rule);
  Red Herb item effect (trash+Green → heal main+partner); partner explore ammo pooling
  across both characters' weapons.
- `explore.ts` — choose-leader before reveal; leading character takes undefeated damage;
  Event card resolve path (Explosive Barrel threshold, Collapsing Floor Traps multi-
  reveal battle, Laser Targeting Device insta-kill); X-weapon ammo cap & damage-from-ammo.
- `validate.ts` — attach/leader/reaction validation; partner-attached actions
  exempt from bonus icons while attached.
- AI (`ai/evaluate.ts`) — partner decisions: keep partner, attach weapons, lead main vs
  partner damage tradeoffs, AC-018 reaction value.

### 6.4 Client/`server`
- PlayerPanel: second character card (Partner) below/next to Main; its own HP ring,
  level, attached card row; "Attach to Partner" affordance on hand cards.
- Explore UI: leader choice toggle; per-X-weapon ammo assignment input.
- Event card reveal overlay (new outcome zone or reuse mansion reveal); off-turn
  reaction prompt (toast "trash Uroboros Injection?").
- Protocol: new action types surfaced to the client store; hotseat unaffected.

## 7. Other modes in the same manual (documented only — NOT first-pass scope)

- **MERCENARY MODE** (2–4): teams, 15-turn countdown + Time Bonus cards (MA-018/019/020),
  Combo Pile (deck-building-style chain, decorations × pile size, Combo Bonus MA-021 ×2),
  Bonus cards ("When Obtained players gain 1 extra turn; trash"), custom starting
  inventories per character, team-shared levels, instant elimination at ≤0 HP.
- **VERSUS MODE**: PvP — explore targets a character instead of the Mansion; loot a
  weapon from the defeated player; defeat = 1 decoration, 3 = win; 1 decoration per level.
  This is where PR-001 Chris's weaponDamageReduction finally becomes live.
- Difficulty modifiers (Easy/Hard/Professional), custom starting inventories, and the
  "Day-Killer" combined-2-set mansion are drive-by config options.

First implementation pass should be: **Partner Modification + Alliance cards for
Story-level play** (modes §7 deferred), since that's the expansion's headline and
reuses our existing explore/attach/prompt plumbing.

## 8. Suggested build order (when approved)

1. Data: Alliance cards (characters, weapons incl. X-caps, actions, infected, Red Herb,
   events) + `set: 'alliance'` — no engine change, tests at data level.
2. Partner state + attach-to-partner action + partner HP/level + partner scene in
   UI (14b harness candidate: presentational component for partner panel).
3. Explore with partner: dual weapons, leader choice, partner-attached weapon effects,
   damage routing to leader. (Biggest engine chunk — direct implementation.)
4. Events + Las Plagas + X-weapons + off-turn AC-018 reaction prompts.
5. New character abilities batch (the ~15 new passive kinds).
6. Modes (Mercenary/Versus) — later milestone, driven by user choice.