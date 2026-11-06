import io

def nl_of(s):
    return '\r\n' if '\r\n' in s else '\n'

# ---- actions.ts: write the infection map back for EVERY seat ----
p = 'engine/actions.ts'
src = io.open(p, encoding='utf-8', newline='').read()
nl = nl_of(src)

# defeated branch return
old = nl.join([
  "          seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),",
  "          removed: removedAfter,",
  "          mansionDeck,",
  "          mansionBottom,",
  "          rngState: currentRng,",
  "          prompts: carlosPrompts,",
])
assert src.count(old) == 1, 'defeated seats anchor'
new = nl.join([
  "          seats: state.seats.map(s => (",
  "            s.seat === seat",
  "              ? newPlayer",
  "              : { ...s, infectionCards: infectionBySeat.get(s.seat) ?? s.infectionCards ?? [] }",
  "          )),",
  "          removed: removedAfter,",
  "          mansionDeck,",
  "          mansionBottom,",
  "          rngState: currentRng,",
  "          prompts: carlosPrompts,",
])
src = src.replace(old, new)

# notDefeated branch return
old = nl.join([
  "        seats: state.seats.map(s => (s.seat === seat ? newPlayer : s)),",
  "        removed: removedAfter,",
  "        mansionDeck,",
  "        mansionBottom,",
  "        rngState: currentRng,",
  "        ...(state.infectionDeck !== undefined ? { infectionDeck: outbreakDeck } : {}),",
])
assert src.count(old) == 1, 'notDefeated seats anchor'
new = nl.join([
  "        seats: state.seats.map(s => (",
  "          s.seat === seat",
  "            ? newPlayer",
  "            : { ...s, infectionCards: infectionBySeat.get(s.seat) ?? s.infectionCards ?? [] }",
  "        )),",
  "        removed: removedAfter,",
  "        mansionDeck,",
  "        mansionBottom,",
  "        rngState: currentRng,",
  "        ...(state.infectionDeck !== undefined ? { infectionDeck: outbreakDeck } : {}),",
])
src = src.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('actions.ts: infection map written back for every seat')

# ---- outbreak.test.ts: MA-053 needs the Lightning Hawk (we-029, 60 ammo / 60 dmg) ----
p = 'engine/outbreak.test.ts'
src = io.open(p, encoding='utf-8', newline='').read()
nl = nl_of(src)
old = "'we-030#1'"
assert src.count(old) == 1, 'test weapon anchor'
src = src.replace(old, "'we-029#1'")
io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('outbreak.test.ts: MA-053 test uses the Lightning Hawk')
