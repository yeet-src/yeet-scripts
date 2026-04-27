---
name: yeet-scripts
description: Use when writing, editing, or debugging yeet scripts — JavaScript files run by the `yeet` daemon as real-time observability tools. Triggers include filenames under an `examples/<name>/{data,render,dump}.js` layout, any `.js` that calls `yeet.graph.query` / `yeet.graph.subscribe`, imports from `./data.js` with a `watch()` export, or invocations like `yeet run path/to/script.js`. Skip for ordinary Node/Deno/browser JS — the runtime is none of those.
---

# Writing yeet scripts

Yeet scripts are single JavaScript files run by the `yeet` daemon inside a V8 isolate. They subscribe to a GraphQL system graph (CPU, memory, processes, network, GPU, docker, hwmon) and render or act on it. The runtime is **not Node, not Deno, not a browser** — assume nothing standard works until you've checked.

**Always read the full API reference at `CLAUDE.md` in the repo root before writing non-trivial code.** This skill is the mental model and the gotchas; `CLAUDE.md` is the authoritative API surface.

---

## Mental model

- One `.js` file is the tool. No bundler, no `package.json`, no `node_modules`.
- ES modules only. `import` / `export` work; `require()` does not.
- Importing a `.gql` / `.graphql` file gives you a `(vars?) => { query, subscribe, unsubscribe }` factory.
- The host injects three globals: `yeet`, `console`, `tty`, `style`, plus standard timers (`setTimeout`, `setInterval`, `queueMicrotask`).
- Discover the graph from the shell, not from inside the script:
  ```sh
  yeet graph dump                       # full SDL
  yeet graph query '{ host { uptime { uptime } } }'
  ```

## What the runtime does NOT have

If you reach for one of these, stop and use the alternative:

| Missing | Use instead |
|---|---|
| `process`, `process.env`, `process.argv` | `yeet.args` (parsed minimist-style) |
| `require`, CommonJS | `import` |
| `fetch`, `XMLHttpRequest`, `WebSocket` | `yeet.graph.query` / `yeet.graph.subscribe` |
| `fs`, `path`, `os`, `child_process` | nothing — scripts have no FS or subprocess access |
| `Buffer` | `Uint8Array` / `ArrayBuffer` |
| `crypto`, `TextEncoder`, `TextDecoder`, `URL` | not present |
| `performance.now()` | `Date.now()` |
| `setImmediate` | `queueMicrotask(fn)` or `setTimeout(fn, 0)` |
| `Intl.*`, `String.prototype.localeCompare` | plain `<` / `>` comparisons; manual formatting (V8 built without ICU) |
| `requestAnimationFrame` | `setInterval` |

## High-frequency gotchas

These bite repeatedly. Internalize them.

- **`yeet.graph.query` returns the full GraphQL envelope.** Destructure: `const { data, errors } = await yeet.graph.query(...)`. Reading `result.foo` directly gives `undefined` and looks like a schema break.
- **`yeet.graph.subscribe` returns a *ticket string*, not an unsubscribe function.** Capture it; pass it to `yeet.graph.unsubscribe(ticket)` to stop.
- **`tty.*` throws without a PTY** (everything except `tty.size()`). Piping output (`yeet run x.js | tee log`) detaches the PTY. If a script needs to support both interactive and piped modes, probe at startup:
  ```js
  let hasTty = true;
  try { tty.write(""); } catch { hasTty = false; }
  ```
- **`style.fg(text, r, g, b)` is quantized to the 16-colour ANSI palette** despite the RGB-shaped signature. Smooth gradients collapse. Pick RGB values that land on the bright codes you want:
  - `(255, 50, 220)` → bright magenta
  - `(0, 240, 240)` → bright cyan
  - `(255, 220, 100)` → bright yellow
  - `(255, 40, 60)` → bright red
  - `(90, 90, 90)` → bright black (visible dark gray)
- **`yeet.args` values are strings or booleans, never numbers.** Coerce with `Number(yeet.args.interval) || 2000`.
- **Kebab-case flag names become snake_case keys**: `--multi-word-flag` → `yeet.args.multi_word_flag`.
- **The isolate exits when the top-level module finishes and no timers / pending promises remain.** Long-running scripts must keep an interval or subscription alive (or call `yeet.exit()` on cleanup).
- **No `printf`-style substitution in `console.log`** — args are space-joined. Format yourself.

---

## The convention every example follows

Each example in `examples/<name>/` is split into three files. Follow this layout when adding a new one — it's what makes the scripts easy to read, retarget, and modify.

```
examples/<name>/
  data.js     # pure data layer: queries the graph, normalizes, emits events
  render.js   # presentation: takes events from data.js and draws to the TTY
  dump.js     # one-line debugger: pipes data.js events as JSON to stdout
```

### `data.js` — the data layer

Exports a single `watch(opts, emit)` function (and often a one-shot `snapshot()`). It owns all `yeet.graph.*` calls and emits a stream of small, tagged event objects. **It must not touch `tty` or `style`** — that's `render.js`'s job. Keeping it pure means the same data layer works for `render.js`, `dump.js`, alerting scripts, and tests.

Event shape is `{ kind, t, ...payload }`. Document the kinds in the file header. Standard kinds you'll see across the repo:

- `config` — emitted once at startup with parameters the renderer needs (intervals, units, etc.)
- `snapshot` / `tick` — the recurring data event
- `progress` — for finite-duration scripts (e.g. `leak-hunt`)
- `report` — terminal output of a finite run
- `error` — caught errors, with `error: String(...)`

Skeleton:

```js
export function watch(opts, emit) {
  const intervalMs = opts.intervalMs ?? 2000;
  let stopped = false;
  let ticket = null;

  // For polling: setInterval + an immediate first tick.
  // For streaming: yeet.graph.subscribe(...) and store the ticket.

  return {
    stop() {
      stopped = true;
      if (ticket) yeet.graph.unsubscribe(ticket);
    },
  };
}
```

### `render.js` — the presentation layer

Imports `watch` from `./data.js`. Owns `tty.*`, `style.*`, and any layout / ANSI logic. Two modes are conventional:

- `--once` — one snapshot to stdout, exit. Pipe-safe (no `tty.alt()`, no cursor games, must work without a PTY).
- live (default) — `tty.alt()` + `tty.hideCursor()`, redraw on each event, restore on exit.

Read CLI args with `yeet.args`. Coerce explicitly (`Number(...) || default`). Honor `--interval`, `--width`, etc. consistently with sibling scripts.

### `dump.js` — the debugger

Six lines. Imports `watch`, runs it, `console.log(JSON.stringify(ev))` per event. Lets you `yeet run examples/x/dump.js | jq .` to verify the data layer in isolation. Always include one — it's the fastest way to debug.

```js
import { watch } from "./data.js";
const intervalMs = Number(yeet.args.interval) || 2000;
watch({ intervalMs }, (ev) => console.log(JSON.stringify(ev)));
```

---

## Patterns worth copying

- **Header docblock listing event kinds and their payload shapes.** Every `data.js` in `examples/` does this. It's the contract between data and render.
- **`unwrap = (resp) => resp.data ?? resp`** as a small helper when bouncing between `query` (envelope) and `subscribe` callbacks (often already-unwrapped data).
- **Per-key prev-state `Map` for rate calculation** (bytes/sec, CPU%): keep last sample's totals + timestamp, compute delta on each tick, prune entries for keys that disappeared.
- **Inline GraphQL variables only after sanitizing.** The runtime supports `$var` interpolation in `.graphql` modules; for ad-hoc inline queries, validate / strip the input (`String(name).replace(/[^a-zA-Z0-9_.-]/g, "")`) before string-concatenating it.
- **Shared rendering primitives go in `examples/lib/`.** See `examples/lib/vice.js` for double-buffered Screen, Braille Canvas, palette constants — copy from there rather than reinventing flicker-free redraws.

## Reference implementations

When in doubt, read these in order:

1. **`examples/docker-net/`** — cleanest demonstration of the data/render/dump split with a polling data source. Start here.
2. **`examples/process-galaxy/`** — same layout but with a `yeet.graph.subscribe` streaming source instead of polling.
3. **`examples/leak-hunt/`** — finite-duration script (windowed sample → `report` event → exit).
4. **`examples/lib/vice.js`** + `examples/vice-city-*.js` — flicker-free double-buffered rendering, Braille sub-cell graphics, gauges. Crib from here for anything visually ambitious.
5. **`CLAUDE.md`** — full API reference for every `yeet.*`, `tty.*`, `style.*`, and timer global. Consult before writing any non-trivial usage.

## Testing a script

```sh
yeet run path/to/script.js                    # interactive
yeet run path/to/script.js --once             # one-shot, pipe-safe
yeet run path/to/dump.js | jq .               # verify the data layer
yeet graph query '<gql>'                      # probe the graph from the shell
yeet graph dump                               # full SDL
```

If `tty.*` throws "No such device or address (os error 6)", the script lost its PTY — either run it interactively or wrap with `script -q -c 'yeet run x.js' /dev/null`.
