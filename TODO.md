# TODO
last_updated: 2026-09-26

## Current — what's happening now

### Bugs to fix
- [ ] Coach tab layout: header dead-pinned at top edge on every tab (no safe-area gap, no header drift); chatbox static; only conversation box scrolls inside coach tab. Outer tab should not scroll. Desired: more like Slack. Currently broken — header scrolls out of sight, chatbox scrolls, conversation box also scrolls.
- [ ] Rest timer lost when navigating away from live workout and back (not persisted)
- [ ] Set 4 actual weight + coach reverted to session target on nav away/back — treated like set 1 on return
- [ ] Elapsed workout time reset to 0 on nav away/back
- [ ] Missing coach notes on second-half exercises (assisted chest dips, DB seated tricep extension, tricep cable pushdown) despite correct actual weights from linear progression
- [ ] Session target wrong on set 1 (set target works correctly on set 2+)
- [ ] "Set target" UI still showing after last set — unnecessary prompt after workout is done
