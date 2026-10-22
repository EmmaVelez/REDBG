# Alliance Expansion - Implementation Summary

## ✅ Completed Tasks

### 1. Alliance Card Data Created (`game-core/src/data/cards.ts`)

- **4 Character cards** (ch-011 to ch-014)
  - Carlos Oliveira (+ partner mode mechanics, attach 2 extra cards)
  - Josh Stone (knife+action start only, low HP 75)
  - Steve Burnside (explosive start, +20 damage on magnums)
  - Wesker Alliance variant (+20 gold, same as premier)

- **9 Weapon cards** (we-017 to we-024)
  - Grenade Launcher (60 dmg explosive, cost 35)
  - Pistol (12 dmg, cost 15)
  - Combat Knife Alliance (free knife variant)
  - Sawed-Off Shotgun (65 dmg instant kill ≤55 HP)
  - Full Auto Rifle (+8/action played effect)
  - Heavy Machine Gun (+4 damage if ammo ≥90)
  - Super Shotgun (70 dmg, +1 explore)
  - Riot Shotgun (60 dmg, instant kill ≤35 HP)

- **Ammunition & Actions**
  - Ammo x5 (free +5/+5 gold action replacement)
  - Longbow (+2 cards via mansion check)  
  - Grenade Action (+5 actions / +20 gold)
  - Back to Back (recover weapon from discard pile)
  - Reload Action (+2 buys)

- **Alliance Infected**
  - Majini Heavy (35 HP, 15 attack, 2 decorations)
  - Licker Gang (65 HP, 40 attack, 3 decorations)

### 2. Type System Updates (`game-core/src/types.ts`)
  
- Extended `CardDef.set` union to include `'alliance'` variant

### 3. Alliance Scenario Piles (`game-core/src/data/cards.ts`)
  
Alliance scenario has its own pile configuration with:
- Basic resource piles (am10, am20, am30)
- Ammo x5 pile for the expansion
- All weapon/action/armory piles properly defined
- Instant kill shotguns for faster combat

### 4. Stand-alone Alliance Scenario (`alliance.ts` - pending cleanup)

Created a separate file containing alliance cards data (will be merged).

## 📊 What's Missing / To Be Done

1. **Clean up temp files** - Remove `game-core/src/data/alliance.ts` 
2. **Test typecheck** - Verify no TypeScript errors
3. **Run tests** - Confirm all test suites pass
4. **Build UI components** - Add Alliance cards to card view/selection UI  
5. **Update scenario selector** - Add "Alliance" as selectable option in Lobby

## 🚀 Next Steps

### Immediate: Cleanup & Validation

```bash
cd C:/Users/Manny/dev/re-deck-builder

# Remove duplicate file
rm game-core/src/data/alliance.ts

# Run typecheck
npm run typecheck || npx tsc --noEmit -p game-core/tsconfig.json

# Verify build
npm run build 2>&1 | head -50
```

### Feature Integration

1. **Lobby UI** - Add "Alliance" to scenario dropdown (pass-and-play and online)
2. **Card View** - Show alliance card set indicator in card UI (distinct color/frame)
3. **Game Setup** - Ensure setup loads only Premier + Alliance cards for this scenario
4. **README update** - Document the new expansion content

### Quality Gates

- [ ] `npx vitest run game-core/src/data/cards.test.ts` passes with alliance cards present
- [ ] Typecheck shows 0 errors/warnings in monorepo
- [ ] Git repo clean, no untracked files (alliance.ts removed)

## 📄 Documentation Needed

1. README.md section for Alliance expansion card list  
2. Scenario comparison table (Premier vs Alliance vs Spy Games etc.)
3. Wiki-style guide: "Alliance Mode — Partner Mechanics" explanation

---

*Date: 2026-10-22*  
*Status: Implementation phase 1 complete; type validation pending cleanup*
