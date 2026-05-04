**Flavor: forensic.** The wall isn't a dashboard — it's a detective's
wall, drilling into specific processes, threads, sockets, and fds.

Skip the generic "top processes" and "per-core CPU" panes. Every
demo should be about a *specific* PID (or TID, socket, fd) chosen by
an interesting heuristic: highest CPU over the last 10s, most
children, largest RSS growth, most-recently spawned, stuck in
D-state, has open network connections, named `yeet-worker-*`. Lean
hard on the **process deep-dives** section: process spotlights,
process biographies, fan-out trackers, thread breakdowns, named-
worker watchers, process activity feeds, process-compare panels,
threads-view drill-downs.

Each pane tells a story about one named entity. When the entity
exits or stops being interesting, the pane reassigns to a new one
(rewrite the published file, `C-c` the pane). The wall feels like
watching an investigation unfold, not staring at vital signs.
