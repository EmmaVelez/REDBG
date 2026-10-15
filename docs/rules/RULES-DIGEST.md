# RE Deck Building Game — Rules Digest (Premier Edition / Story Mode)

Source: official rulebook PDF (docs/rules/RE1_Rulebook.pdf, extracted text re1_rulebook.txt)
+ fandom wiki card list. Scope for v1: **Story Mode** ("First Timer" scenario).

## Core concepts
- 1–4 players. Each player = 1 Character card (random pick from 10, unused set aside).
- **Inventory** = player's deck. Start: 7× Ammo x10, 1× Handgun, 2× Combat Knife (10 cards),
  shuffled; draw 5 as starting hand.
- **Resource Area** (market): 18 face-up piles, bought with **Gold**. Basic Resources in every
  game: Ammo x10 / x20 / x30, Handgun+Burst-Fire Handgun (combined pile), Combat Knife+
  Survival Knife (combined pile), Green Herb. First Timer scenario adds: Umbrella Corp,
  Mansion Foyer, Escape from the Dead City, Deadly Aim, Shattered Memories, The Merchant,
  Reload, Grenade, Six Shooter, Pump-Action+Automatic Shotgun (combined), Bolt-Action+
  Semi-Automatic Rifle (combined), Assault Machine Gun+Full-Bore Machine Gun (combined).
- **Mansion Area**: face-down deck = all 33 Infected cards + 2 Token cards (Rocket Launcher
  Case, Gatling Gun Case) + 3× Yellow Herb, shuffled.
- Bought/gained cards go to your **Discard Pile** immediately.
- End of turn: discard Play Area (non-attached) + hand, draw 5 (reshuffle discard into
  inventory if needed). Play passes left.

## Turn structure
Each turn you get: **1 Action, 1 Buy, 1 Explore**.
1. **Play Action(s)**: costs 1 Action (cards can grant +X Actions). Bonus icons first
   (+X Card(s), +X Gold, +X Ammo, +X Buy, +X Explore), then text. One action fully resolves
   before the next.
2. **Play Item(s)**: free, unlimited per turn (e.g. Green Herb: trash to heal 20, or trash
   with another Green Herb to heal 60; First Aid Spray: heal to full).
3. **Character effect** (if timing correct; "can" = once per noted timing).
4. **Explore the Mansion**: play Weapons + required Ammo from hand; each Weapon used once;
   total Damage; apply weapon effects. Reveal top Mansion card:
   - Infected revealed: if Damage total >= its Health → defeated; Infected attaches to your
     Character, its Decoration Reward added to your total. If NOT defeated → Infected deals
     its Damage to your Character, then goes to bottom of Mansion. Some Infected have
     "when not defeated" effects (e.g. Uroboros Aheri: if not defeated, shuffle back into
     Mansion instead of bottom).
   - Non-Infected revealed (Item/Token): optionally take it (perform effects); else to
     bottom of Mansion. Token: gain the weapon card, trash the token.
   - **Extra Explores**: with multiple Explores you may reveal multiple Infected before
     comparing; total Damage must cover ALL revealed Infected's combined Health or you take
     ALL their Damage; undefeated ones go to bottom of Mansion.
5. **Buy**: spend turn Gold on Resources, one at a time; multiple Buys pool Gold. Pile
   empty = can't buy more.

## Ammo vs Gold
- Ammo cards grant both: Ammo x10 = +10 Ammo +10 Gold (cost 0), x20 = +20/+20 (cost 30),
  x30 = +30/+30 (cost 60). Ammo powers weapons (Ammo Requirement); Gold buys cards.
- Ammo/Gold are per-turn resources (from played cards), not persistent.

## Death & revival (Story Mode)
- Character HP <= 0: flip face down; shuffle hand+discard into inventory; attached cards
  stay. On your next turn: flip up, max HP -20, draw 5, skip turn. Max HP <= 0 → dead,
  out of the game.

## Leveling up
- Characters have Level 1 + Level 2 abilities. Level 2 unlocks at a Decoration threshold
  printed on the card (e.g. Chris: L2 needs 4 Decorations). L2 keeps L1 abilities.

## Win condition (Story Mode)
- Game ends when **Uroboros Aheri** (the strongest Infected, 90 HP) is defeated.
- Most **Decorations** wins. Tie → most current Health; still tied → shared win.

## Weapons (Premier set; cost / ammoReq / damage / copies / effect)
- WE-001 Grenade: 50 / ? / ? ×5 — explosive; effect: Jill L2 trashes explosives (FAQ)
- WE-002 Longbow: ×5; WE-003 Submission: ×5
- WE-004 Combat Knife: cost 0 / ammoReq 0 / dmg 5 ×11 (basic)
- WE-005 Survival Knife: ×1
- WE-006 Six Shooter: 50 ammoReq? / 90 dmg (from card text "50 Ammo Requirement 50 Damage"? — VERIFY) ×5
- WE-007 Gatling Gun ×1; WE-008 Rocket Launcher ×1 (token-gained)
- WE-009 Handgun: cost 20 / ammoReq 20 / dmg 10 ×9
- WE-010 Burst-Fire Handgun: cost ? / ammoReq 30 / dmg 20, +20 dmg when attacking with >1 weapon ×1
- WE-011 Assault Machine Gun ×4; WE-012 Full-Bore Machine Gun: ammoReq 70 / dmg 40, +30 dmg if >100 ammo ×1
- WE-013 Pump-Action Shotgun: ammoReq 40 / dmg 25, +1 Explore ×4
- WE-014 Automatic Shotgun ×1
- WE-015 Bolt-Action Rifle ×4; WE-016 Semi-Automatic Rifle ×1
  (stat gaps marked ? — fill from per-card wiki pages in the data task research step)

## Infected (Mansion; MA-### name: copies / HP / Damage / Decorations / effect)
- MA-001 Majini ×3; MA-002 Zombie (Male) ×2: 20 HP / 20 dmg / 1 dec
- MA-003 Zombie (Female) ×2: 15 HP / 10 dmg / 1 dec; MA-004 Zombie Butcher ×3
- MA-005 Bui Kichwa ×3: 10 HP; MA-006 Licker ×3: 40 HP; MA-007 Nemesis (T-Type) ×1
- MA-008 Hunter ×2; MA-009 Mimicry Marcus ×2; MA-010 Uroboros Aheri ×1: 90 HP / 70 dmg /
  8 dec — if not defeated, shuffle back into Mansion
- MA-011 Dr. Salvador ×3; MA-014 Gatling Gun Majini ×3: +5 dmg per each 10 Ammo player has
- MA-015 Cerberus ×3; MA-016 El Gigante ×1; MA-017 Executioner ×1: 30 HP / 25 dmg / 3 dec,
  on defeat choose a player → skip their next turn
(gaps — fill from wiki per-card pages)

## Other cards
- Actions AC-001..AC-012 (counts: Mansion Foyer ×10, Deadly Aim ×5, Shattered Memories ×5,
  Escape ×10, Reload ×5, Merchant ×6, Umbrella ×5, Back to Back ×5, Item Management ×5,
  Ominous Battle ×5, Master of Unlocking ×3, Struggle for Survival ×5).
  Known: AC-002 Deadly Aim cost 50: all your weapons +10 dmg this turn; AC-005 Reload
  (cost 20?, +20 Ammo): move 1 Weapon from discard to hand; AC-006 Merchant cost 50: +1 Buy,
  +1 Card, +20 Gold; AC-007 Umbrella cost 50: move 1 card from hand to top of Inventory,
  +1 Action, +2 Cards; AC-010 Ominous Battle cost 60: trash 1 card from hand, +3 Cards,
  +10 Gold; AC-012 Struggle cost 30: +1 Action, +1 Explore, may discard from hand to set a
  <=40-cost weapon's damage to 0.
- Items: IT-001 Green Herb ×6 cost 20; IT-002 Yellow Herb ×3 (Mansion only, +max HP);
  IT-003 First Aid Spray ×5 cost 60 (heal to full).
- Ammo: AM-001 ×28, AM-002 ×15, AM-003 ×15.
- Tokens: MA-012 Rocket Launcher Case, MA-013 Gatling Gun Case ×2 total.

## Terminology (rulebook ch. VII)
- **Gain**: Resource/Mansion/outside-game → your Discard Pile.
- **Attach**: place card under your Character.
- **Obtain**: move to Inventory, Discard, or Hand.
- **Reveal**: show all players, return where it was.
- **Trash**: return card to its Resource Pile in the Resource Area.
- **Remove from the game**: out of game entirely.
- **Explore**: reveal top card of the Mansion.
- +X Card(s): draw X from Inventory (reshuffle discard if needed).
- +X Explore / Action(s) / Buy(s) / Gold / Ammo: per-turn grants (Buy pools into turn total).

## FAQ nuggets (rulebook ch. VIII)
- Jill L1 adds damage to Grenade's effect: yes.
- Rocket Launcher counts as explosive → Jill L2 sends it to discard instead of trash.
- Gatling Gun Majini: +5 dmg per full increment of 10 total Ammo (60 ammo → +30).

## Out of scope for v1
Mercenary Mode (combos, turns, teams), Versus Mode (PvP, no mansion), difficulty variants,
custom scenarios/inventories, expansions (Alliance, Outbreak, Nightmare, Mercenaries).
Engine must keep modes addable (setup config, win-condition strategy) but Story Mode only.
