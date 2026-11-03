# Proposed specs for 5 missing InfectedEffect kinds (Alliance)

1. `onKillGainAmmoX10ToMostDecorated` (MA-025 Duvalia): On defeat, the player with the most decorations gains `count` Ammo x10 cards (am-001) to their discard pile. Tie → player first in turn order.

2. `buffOtherRevealedInfected` (MA-029 Albert Wesker): While revealed (not defeated), all other revealed infected in the same multi-explore gain +hp HP and +damage damage for this turn. Does not include itself.

3. `mustExploreNextTurnOnDefeat` (MA-030 Cephalo): On defeat, choose a player; they must explore at least once next turn — block ending turn until one explore done.

4. `plusHpAndDamagePerAttachedInfected` (MA-035 Los Illuminados Monk): +amount HP and +amount damage per infected attached to the exploring main character's attached cards. Partners cannot have infected attached.

5. `trashHighestCostAttachedOnPartnerIfNotExactDefeat` (MA-036 Reaper): If defeated with damage !== exact HP, trash the highest-cost card among the partner's attached cards (cost undefined treated as 0). Exact defeat = damage === hp.
