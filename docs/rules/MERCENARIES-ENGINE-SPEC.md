# Mercenaries Expansion — Engine Spec & Rulings

Status: **in progress** (2026-11-06). Scope confirmed with Manny:
**Skill System + full Mercenaries card data** (8 characters, 8 weapons, 10 actions,
26 infected, 3 ammo, 1 item, 30 skill cards). Mercenary Mode (teams/combos/timer)
is OUT of scope.

## Sources (authority order)

1. `docs/rules/mercenaries/RE5_Rulebook.pdf` — the official Bandai manual
   (fetched via Wayback `id_` from the URL cited on every wiki card page).
   Extracted with `pdftotext -layout` / `-raw`.
2. Card scans (wiki File: pages, 490×695) — verbatim effect text. The wiki
   PROSE is unreliable (it gives Melee the number MA-046; the card is AC-046).
3. Wiki category pages — exact ids/names/counts (cross-checked against the
   manual's Card List & Organization table, `pdftotext -raw` page 21).

## Skill System rules (manual ch. VI, "[Game Modification] Skill System")

- **New card type**: Skill Card (`SK-001..SK-030`, one copy each).
- **Draft (Step 3)**: after each player has a Character, deal 5 Skill cards to
  each player; set the rest aside. Each player picks 1, passes the remaining 4
  to the player on their left; repeat until no cards remain to pass (5 rounds).
  Then each player keeps 3 of their 5 chosen cards and removes the other 2 from
  the game. Kept cards go face-up to the **Skill Area** above the Character.
- **XP**: when a Character Explores, place 1 XP on that Character (explore step 6).
- **Moving XP (RULING — Manny 2026-11-06)**: a player may move any amount of XP
  from their Character to their Skills **at any time during their turn while the
  Character is NOT Exploring**. It is a **free action** (costs no Action), per
  the manual. Once XP is on a Skill it cannot move again except by an effect.
  (A player blog claims it costs an Action and moves all XP at once; the manual
  is authoritative and Manny ruled "free, any amount".)
- **Activation**: a Skill is not usable until XP on it ≥ its printed XP
  requirement. Effects with "Remove all XP on this Skill from the Game" deactivate
  it (XP is removed; it must be re-filled).
- **Once per turn**: a Skill effect with the word "can" may only be used once per
  turn.
- **Downed characters keep XP** (manual (D): "that Character keeps all XP
  currently on them, as well as all XP on their Skills").
- **Partner modification**: with a partner, each Character may have only 1 Skill
  and the draft keeps 2 instead of 3. (Implemented as a config note; partner
  mode + skill system combined is an edge case.)

## Skill card data (verbatim from scans)

| ID | Name | XP | Effect |
|----|------|----|--------|
| SK-001 | Extension LV.1 | 1 | At the beginning of your turn, if there are 5 or more Infected attached to all Characters in total or your Team has 10 or more Decorations, you get +20 Ammo during this turn. |
| SK-002 | Extension LV.2 | 4 | At the beginning of your turn, if there are 10 or more Infected attached to all Characters in total or your Team has 20 or more Decorations, your Character deals an additional 10 Damage during this turn. Then, Heal your Character's Health by 20. |
| SK-003 | Extension LV.3 | 5 | At the beginning of your turn, if there are 15 or more Infected attached to all Characters in total or your Team has 30 or more Decorations, you get +1 Explore during this turn. |
| SK-004 | Medic LV.1 | 1 | When you would Heal your Character, you can Heal that amount, plus 10 instead. |
| SK-005 | Medic LV.2 | 2 | When you Heal your Character, you can Trash 1 card from your Discard Pile. |
| SK-006 | Medic LV.3 | 5 | At the beginning of your turn, Heal your Character's Health by 20. If your Character is at Maximum Health, you can get +1 Explore during this turn instead. |
| SK-007 | Luck LV.1 | 1 | While your Character is at 20 or more Health, if they would have their Health reduced to 0 or less, they take 10 Damage instead. |
| SK-008 | Luck LV.2 | 3 | When your Character would receive Damage, you can negate that Damage. In that case, Remove all XP on this Skill from the Game. |
| SK-009 | Luck LV.3 | 5 | This Skill is considered to have the same effect(s) as your other activated Skills. If you are playing Mercenaries Mode, your Teammate gets your other activated Skill effect(s) instead. |
| SK-010 | Toughness LV.1 | 2 | When you or your Character would be affected by an Infected's effect, you can Remove all XP on this Skill from the Game. In that case, you are not affected by that effect. |
| SK-011 | Toughness LV.2 | 3 | Reduce all damage your Character takes by 10. |
| SK-012 | Toughness LV.3 | 4 | When you or your Character would be affected by an Infected's effect, you can Remove all XP on this Skill from the Game and choose another Player or Character (respectively) to be affected instead. |
| SK-013 | Reversal LV.1 | 2 | During your turn, you can give your Character 10 Damage. In that case, remove all XP on this Skill from the Game, then you get +3 cards and +1 Action during this turn. |
| SK-014 | Reversal LV.2 | 3 | During your turn, you can give your Character 20 Damage. In that case, Trash up to 2 cards in your Discard Pile. |
| SK-015 | Reversal LV.3 | 4 | When your Character Explores, you can Remove all XP on this Skill from the Game. In that case, your Character deals an additional X Damage during this turn, where X = the amount of Damage on that Character. |
| SK-016 | Smart Reload LV.1 | 3 | During your turn, you can Trash an Ammunition with a cost of 0 from your Hand. In that case, Gain an Ammunition with a cost of 30 or less. |
| SK-017 | Smart Reload LV.2 | 4 | At the beginning of your turn, you get +10 Gold and +10 Ammo during this turn. |
| SK-018 | Smart Reload LV.3 | 5 | During your turn, while your Character is not Exploring, you can move a weapon from your Play Area to the top of your Inventory. |
| SK-019 | Weapon Master LV.1 | 3 | During your turn, you can name a weapon type. In that case, all of your Weapons of that type get -10 Ammo Requirement during this turn. |
| SK-020 | Weapon Master LV.2 | 5 | When your Character Explores, all Weapons that Character is using get +5 Damage during this turn. |
| SK-021 | Weapon Master LV.3 | 6 | When your Character Explores, you can apply the effect of 1 Weapon your Character is using twice. |
| SK-022 | Giant Killing LV.1 | 2 | While your Character is Exploring, if an Infected with 40 or more Health is Revealed, reduce that Infected's Damage to 0 during this turn. |
| SK-023 | Giant Killing LV.2 | 4 | While your Character is Exploring, if an Infected with 40 or more Health is Revealed, you can have your Character deal an additional 20 Damage during this turn. |
| SK-024 | Giant Killing LV.3 | 6 | While your Character is Exploring, if an Infected with 40 or more Health is Revealed, you can have all of the Weapons your Character is using get +10 Damage during this turn. |
| SK-025 | Maximizer LV.1 | 2 | When your Character Defeats an Infected worth 2 or more Decorations, you get 1 XP. |
| SK-026 | Maximizer LV.2 | 3 | During your turn, you can Remove 1 XP on your Character from the Game. In that case, Trash 1 card in your Hand. |
| SK-027 | Maximizer LV.3 | 4 | When your Character Explores, you can Remove any amount of XP on your Character from the Game. In that case, 1 Weapon that Character is using gets +10 Damage during this turn for each XP removed. |
| SK-028 | Handgun Technique LV.1 | 4 | All of your "Pistol" weapons get -10 Ammo Requirement. |
| SK-029 | Handgun Technique LV.2 | 5 | At the beginning of your turn, you can Reveal 2 "Pistol" Weapons from your Hand. In that case, you get +1 Explore during this turn. |
| SK-030 | Handgun Technique LV.3 | 6 | When your Character Explores, every "Pistol" Weapon that Character is using gets +10 Damage during this turn. |

## Mercenaries set inventory (manual Card List, `pdftotext -raw` p.21)

- **Characters**: CH-044 Jack Krauser, CH-045 HUNK, CH-046 Claire Redfield,
  CH-047 Chris Redfield, CH-048 Jill Valentine, CH-049 Albert Wesker,
  CH-050 Rebecca Chambers, CH-051 Barry Burton (1 each).
- **Weapons**: WE-043 Ibex Standard, WE-044 Custom Pump-Action Shotgun,
  WE-045 Custom Full-Bore Machine Gun, WE-046 Custom Lightning Hawk,
  WE-047 Custom Bolt-Action Rifle, WE-048 Hunting Bow, WE-049 Custom Standard
  Sidearm (10), WE-050 Reliable Blade (10).
- **Actions**: AC-042 Fight or Flight, AC-043 The Mercenaries, AC-044 Boundless
  Battlefield (8), AC-045 Coup de Grâce, AC-046 Melee, AC-047 Anticipation,
  AC-048 Backstab, AC-049 Battle Hardened, AC-050 Resuscitate, AC-051 Tear Gas.
- **Infected**: MA-073..MA-098 (26 cards; counts on the data sheet).
- **Ammo**: AM-005 Ammo x10 (28), AM-006 Ammo x20 (15), AM-007 Ammo x30 (15).
- **Item**: IT-005 First Aid Spray (5).

## Engine design

### New types (`game-core/src/types.ts`)

- `CardType` += `"skill"`; `CardDef['set']` += `'mercenaries'`.
- `CardDef`: `skillXp?`, `skillFamily?`, `skillLevel?`, `skillEffects?`.
- `SkillEffect` union (30 kinds) — one per card; passive vs manual flagged by
  the effect kind (manual = the card text has "can").
- `CardInstance.xp?` — XP sitting on a Skill card.
- `PlayerState`: `xp?` (XP on the Character), `skills?` (Skill Area instance ids).
- `GameState`: `skillSystem?`, `skillDeck?`, `skillDraft?`.
- `Phase` += `'skillDraft'`.
- `Action` += `moveXp`, `useSkill`.
- `GameSetup` += `skillSystem?`.

### Draft model

`setup()` with `skillSystem` builds the 30-card skill deck, deals 5 to each
seat, and returns `phase: 'skillDraft'` with `skillDraft` state
(`deck`, `hands`, `kept`, `pendingPass`, `round`, `pickSeat`, `step`,
`keepSeat`, `keepPicks`). Each pick is a `chooseOption` prompt; the reducer
advances the draft and creates the next prompt. After the keep-3 step the
drafted Skills move to `PlayerState.skills`, the 2 dropped cards go to
`removed`, `phase` becomes `'main'`, and the first turn begins.

### XP & activation

- `explore` apply path: `player.xp += 1` (SK-025 adds +1 more on a ≥2-decoration
  defeat).
- `moveXp` action (free): move N XP Character → Skill. Validated: own turn,
  phase main, skill in `player.skills`, `0 < N <= player.xp`.
- A skill is **active** when `(state.cards[skillInstanceId].xp ?? 0) >= def.skillXp`.
- Manual skills use a `useSkill` action (free, once per turn, only when active).

### Skill effects

Passive/triggered effects hook the existing seams:
- turn-start (SK-001/002/003/006/017/029) — `startTurn` + `abilities.ts` helpers;
- explore (SK-020/021/022/023/024/027/030/015) — `computeDamage`/`resolveExplore`
  + a per-turn flag on `PlayerState`;
- heal (SK-004/005) — the heal helper;
- damage (SK-007/008/010/011/012) — `applyHpLoss` and the infected-effect path;
- on-defeat (SK-025) — the explore defeat branch;
- manual (SK-008/010/012/013/014/016/018/019/026/027) — `useSkill` + prompts.

### Client

- Lobby toggle `skillSystem` (alongside `partnerMode`).
- Draft screen (phase `skillDraft`): shows the seat's current hand, click to
  pick; then the keep-3 step.
- Skill Area panel: 3 skill cards with XP pips, requirement, active state, and
  a "move XP" control; manual skills get a "Use" button.

### Server

- `protocol.ts`: `skillSystem` on `createRoom`/`RoomSnapshot`, `setSkillSystem`
  host control; validate whitelists.
- `host.ts`: pass `skillSystem` into `setup`.
- `view.ts`: hide other seats' draft hands (skill draft is private).

## Rulings log

| # | Ruling | Source |
|---|--------|--------|
| 1 | XP movement is a free action, any amount, during your turn while not Exploring. | Manny 2026-11-06 (manual) |
| 2 | Faithful pass-left draft (5 rounds, then keep 3 of 5). | Manny 2026-11-06 (manual) |
| 3 | Skill System available as a lobby toggle on any scenario. | Manny 2026-11-06 |
| 4 | Scope = Skill System + Mercenaries card data (no Mercenary Mode). | Manny 2026-11-06 |
