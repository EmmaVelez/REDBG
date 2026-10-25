import sys
path = '/c/Users/Manny/dev/re-deck-builder/client/src/ui/ActionBar.tsx'
with open(path, 'r') as f:
    original = f.read()

print(f"Original file lines: {len(original.split(chr(10)))}")

# Build correction in-memory then write back
old_explore_code = """        {explores.length > 0 && !prompt && ( 
          <button type="button" className="explore-button" onClick={() => { const best = Array.isArray(bestExplore?.weapons) ? bestExplore.weapons : []; onAction({ type: 'explore', seat, weapons: best, exploreCount: 1 }); }}>
            Explore ({explores.length} legal combo(s))
          </button>
        )}

        {bestExplore === undefined && explores.length > 0 && (
          <div className="explore-warning">No legal explore combos available for your weapon loadout.</div>
        )}"""

new_explore_code = """        {/* Simple Explore button - auto-selects fullest legal combo */}
        {explores.length > 0 && !prompt && ( 
          <button type="button" className="explore-button" onClick={() => { const best = Array.isArray(bestExplore?.weapons) ? bestExplore.weapons : [];\nonAction({ type: 'explore', seat, weapons: best, exploreCount: 1 }); }}>
            Explore ({explores.length} legal combo(s))
          </button>
        )}

        {bestExplore === undefined && explores.length > 0 && ("""

# Try replacement - might fail if text mismatched
if old_explore_code.replace('\n', '\r\n') not in original:
    print("Direct replace failed, trying alternative approach...")
    # Just fix line 3's missing quotes and keep the rest
else:
    new_content = original.replace(old_explore_code, new_explore_code)
    with open(path, 'w') as f:
        f.write(new_content)

# Read result to verify
success_lines = []
if len(open(path).read().split('\n')) < 150:
    success_lines.append("✅ File length OK (< 150 lines after cleanup)")

print(f"{len(success_lines)} checks passed")