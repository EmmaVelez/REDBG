import io

def nl_of(s):
    return '\r\n' if '\r\n' in s else '\n'

# ---------------- cards.ts ----------------
p = 'data/cards.ts'
src = io.open(p, encoding='utf-8', newline='').read()
nl = nl_of(src)

old_imp = "import { ALLIANCE_CARDS } from './alliance';"
assert src.count(old_imp) == 1, 'import anchor'
src = src.replace(old_imp, "import { ALLIANCE_CARDS } from './alliance';" + nl + "import { OUTBREAK_CARDS } from './outbreak';")

old_sid = "export type ScenarioId = 'firstTimer' | 'classicHorror' | 'spyGames' | 'whaddyaBuyin' | 'battleHardenedVeteran' | 'alliance' | 'partnersInEscape';"
assert src.count(old_sid) == 1, 'ScenarioId anchor'
src = src.replace(old_sid, "export type ScenarioId = 'firstTimer' | 'classicHorror' | 'spyGames' | 'whaddyaBuyin' | 'battleHardenedVeteran' | 'alliance' | 'partnersInEscape' | 'outbreak';")

# ScenarioDef: outbreak flag
old_sd = nl.join([
  "  readonly piles: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>;",
  "  readonly alliance?: boolean;",
])
assert src.count(old_sd) == 1, 'ScenarioDef anchor'
new_sd = nl.join([
  "  readonly piles: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }>;",
  "  readonly alliance?: boolean;",
  "  /** Outbreak mode: infection levels, Infection Deck, Infected Characters. */",
  "  readonly outbreak?: boolean;",
])
src = src.replace(old_sd, new_sd)

# Outbreak piles + mansion + scenario def, inserted before the ScenarioDef interface
anchor = "/** Scenario definition interface for type exports */"
assert src.count(anchor) == 1, 'scenario def anchor'
block = nl.join([
  "/**",
  " * \"Outbreak\" scenario (RE3 rulebook p.8, base set + Outbreak).",
  " * Resource piles: Basic Resources plus the Outbreak additions.",
  " */",
  "export const OUTBREAK_PILES: ReadonlyArray<{ pileId: string; cardIds: readonly string[] }> = [",
  "  // Basic Resources",
  "  { pileId: 'am10', cardIds: ['am-001'] },",
  "  { pileId: 'am20', cardIds: ['am-002'] },",
  "  { pileId: 'am30', cardIds: ['am-003'] },",
  "  { pileId: 'herb', cardIds: ['it-001'] },",
  "  { pileId: 'hg', cardIds: ['we-009', 'we-010'] },",
  "  { pileId: 'kn', cardIds: ['we-004', 'we-005'] },",
  "  // Outbreak additions",
  "  { pileId: 'weskers-secret', cardIds: ['ac-025'] },",
  "  { pileId: 'rf', cardIds: ['we-015', 'we-016'] },",
  "  { pileId: 'sh', cardIds: ['we-013', 'we-014'] },",
  "  { pileId: 'magnum', cardIds: ['we-030', 'we-029'] },",
  "  { pileId: 'stun-rod', cardIds: ['we-028'] },",
  "  { pileId: 'merc', cardIds: ['ac-006'] },",
  "  { pileId: 'injection', cardIds: ['ac-026'] },",
  "  { pileId: 'i-have-this', cardIds: ['ac-024'] },",
  "  { pileId: 'foyer', cardIds: ['ac-001'] },",
  "  { pileId: 'smt', cardIds: ['ac-003'] },",
  "  { pileId: 'escape', cardIds: ['ac-004'] },",
  "  { pileId: 'tvirus', cardIds: ['ac-023'] },",
  "];",
  "",
  "/** Outbreak mansion deck (MA-041..MA-057, counts per the rulebook card list). */",
  "export const OUTBREAK_MANSION: ReadonlyArray<{ cardId: string; count: number }> = [",
  "  { cardId: 'ma-041', count: 1 },",
  "  { cardId: 'ma-042', count: 2 },",
  "  { cardId: 'ma-043', count: 1 },",
  "  { cardId: 'ma-044', count: 3 },",
  "  { cardId: 'ma-045', count: 2 },",
  "  { cardId: 'ma-046', count: 2 },",
  "  { cardId: 'ma-047', count: 3 },",
  "  { cardId: 'ma-048', count: 2 },",
  "  { cardId: 'ma-049', count: 3 },",
  "  { cardId: 'ma-050', count: 2 },",
  "  { cardId: 'ma-051', count: 3 },",
  "  { cardId: 'ma-052', count: 2 },",
  "  { cardId: 'ma-053', count: 1 },",
  "  { cardId: 'ma-054', count: 1 },",
  "  { cardId: 'ma-055', count: 2 },",
  "  { cardId: 'ma-056', count: 1 },",
  "  { cardId: 'ma-057', count: 1 },",
  "];",
  "",
  "export const OUTBREAK_SCENARIO_DEF = {",
  "  id: 'outbreak' as ScenarioId,",
  "  name: 'Outbreak',",
  "  description: 'Outbreak mode (base set + Outbreak) — Infection levels, the Infection Deck and Infected Characters.',",
  "  piles: OUTBREAK_PILES,",
  "  mansionCards: OUTBREAK_MANSION,",
  "  outbreak: true,",
  "};",
  "",
]) + anchor
src = src.replace(anchor, block)

# register the scenario
old_reg = nl.join([
  "  ALLIANCE_SCENARIO_DEF,",
  "  PARTNERS_IN_ESCAPE_SCENARIO_DEF,",
  "];",
])
assert src.count(old_reg) == 1, 'scenario registration anchor'
new_reg = nl.join([
  "  ALLIANCE_SCENARIO_DEF,",
  "  PARTNERS_IN_ESCAPE_SCENARIO_DEF,",
  "  OUTBREAK_SCENARIO_DEF,",
  "];",
])
src = src.replace(old_reg, new_reg)

# ALL_CARDS includes Outbreak
old_all = "export const ALL_CARDS: ReadonlyArray<CardDef> = [...PREMIER_CARDS, ...ALLIANCE_CARDS];"
assert src.count(old_all) == 1, 'ALL_CARDS anchor'
src = src.replace(old_all, "export const ALL_CARDS: ReadonlyArray<CardDef> = [...PREMIER_CARDS, ...ALLIANCE_CARDS, ...OUTBREAK_CARDS];")

io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('cards.ts: Outbreak scenario + piles + mansion + ALL_CARDS')

# ---------------- outbreak.ts: baseDamage on the Zombie characters ----------------
p = 'data/outbreak.ts'
src = io.open(p, encoding='utf-8', newline='').read()
nl = nl_of(src)
for cid, dmg in [('ch-031', 0), ('ch-032', 5), ('ch-033', 10)]:
    old = "{ id: '" + cid + "', name: 'Zombie " + cid[-1] + "', type: 'character', set: 'outbreak', text: '', copies: 1, maxHp: "
    i = src.find(old)
    assert i >= 0, 'zombie anchor ' + cid
    # insert baseDamage right after maxHp value
    j = src.find(', level1At:', i)
    assert j > 0, 'zombie level anchor ' + cid
    src = src[:j] + ', baseDamage: ' + str(dmg) + src[j:]
io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('outbreak.ts: baseDamage added to the Zombie characters (0/5/10)')
