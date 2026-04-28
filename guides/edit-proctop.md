# Adding a column to proctop

`proctop` is split into two ES modules:

- **`data.js`** — subscribes to the system graph, computes CPU deltas, and emits tick events. No terminal code.
- **`render.js`** — imports `watch` from `data.js` and owns everything visual: the `COLUMNS` array, padding, colors, and the render loop.

Adding a column means touching both files: fetch the field in `data.js`, display it in `render.js`. This guide walks through adding a **STATE** column that shows each process's kernel state — `R` (running), `S` (sleeping), `D` (uninterruptible), `Z` (zombie), `T` (stopped).

---

## Step 1 — fetch `state` in data.js

Open `examples/proctop/data.js`. Find the subscription query inside `watch()`:

```js
ticket = yeet.graph.subscribe(
  `subscription {
     procs(interval_ms: ${intervalMs}) {
       pid
       cmdline
       stat { comm utime stime rss_bytes }
     }
   }`,
```

Add `state` to the `stat` fields:

```js
      stat { comm utime stime rss_bytes state }
```

Then find where each process is pushed into `pids`:

```js
pids.push({
  pid: p.pid,
  comm: p.stat?.comm ?? "?",
  cmdline: Array.isArray(p.cmdline) ? p.cmdline : [],
  cpuPct,
  rssBytes: p.stat?.rss_bytes ?? 0,
});
```

Add the new field:

```js
pids.push({
  pid: p.pid,
  comm: p.stat?.comm ?? "?",
  cmdline: Array.isArray(p.cmdline) ? p.cmdline : [],
  cpuPct,
  rssBytes: p.stat?.rss_bytes ?? 0,
  state: p.stat?.state ?? "?",
});
```

`data.js` is done. It doesn't know or care what the renderer does with `state`.

---

## Step 2 — add the column in render.js

Open `examples/proctop/render.js`. The entire layout is driven by the `COLUMNS` array near the top of the file. Each entry has:

| key | purpose |
|---|---|
| `header` | text shown in the header row |
| `width` | visible character width (`0` = takes remaining space) |
| `align` | `'left'` or `'right'` |
| `get(p)` | returns the cell string for process `p` |
| `color(p, str)` | optional — wraps the already-padded cell string in a style |

Add a `STATE` column. One character wide, right after `PID`:

```js
const COLUMNS = [
  {
    header: "PID",
    width: 7,
    align: "right",
    get: (p) => String(p.pid),
    color: (_, s) => style.dim(s),
  },
  // --- add this ---
  {
    header: "S",
    width: 1,
    align: "left",
    get: (p) => p.state ?? "?",
    color: (p, s) =>
      p.state === "Z" || p.state === "D" ? style.red(s) :
      p.state === "R" ? style.green(s) : s,
  },
  // ----------------
  {
    header: "%CPU",
    ...
```

That's it. No other changes needed.

---

## Try it

```sh
yeet run examples/proctop/render.js
```

You'll see a narrow `S` column between `PID` and `%CPU`. Running processes show green `R`; zombies and uninterruptible sleepers show red `D` / `Z`; everything else is unstyled `S`.

---

## Going further

The same two-step pattern applies to any field the system graph exposes. A few ideas:

- **Nice value** — `stat { nice }` → a `NI` column
- **Thread count** — `status { threads }` → a `THR` column
- **Disk I/O** — `io { read_bytes write_bytes }` → `RBPS` / `WBPS` columns (requires delta math like `cpuPct`)
- **Scheduler run delay** — `schedstat { run_delay }` → how long the process waited to get on a CPU

Run `yeet graph dump` to browse everything the graph exposes, or `yeet graph query '{ proc(pid: 1) { stat { state nice } } }'` to probe a specific field before writing code.
