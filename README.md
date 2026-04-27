# Yeet Script API Reference

Yeet scripts run inside a V8 isolate with a curated set of globals. The
runtime is intentionally minimal — it is not Node.js, not Deno, and not a
browser. This document covers every JavaScript-visible API available to a
yeet script, plus a section on what common APIs are **not** present.

---

## Module system

Scripts are evaluated as ES modules. `import` / `export` syntax works.

```js
import myQuery from './my-query.graphql';
import myProbe from './probe.bpf.o';
```

### Special import rules

| File extension | What you get |
|---|---|
| `.gql`, `.graphql` | A function `(vars?) => { query, subscribe, unsubscribe }` — see [GraphQL modules](#graphql-modules) |
| `.bpf.o` | A BPF blob proxy object — see [BPF modules](#bpf-modules) |
| Everything else | Normal ES module |

`require()` / CommonJS is **not** supported.

---

## `yeet` namespace

The `yeet` global object is the primary host-provided API surface. It is
installed by the daemon before script evaluation begins.

### `yeet.args`

A parsed, read-only object containing CLI arguments passed when the isolate
was spawned. Parsing follows minimist conventions:

| Input form | Result |
|---|---|
| `--foo bar` | `{ foo: "bar" }` |
| `--foo=bar` | `{ foo: "bar" }` |
| `--foo` | `{ foo: true }` |
| `--no-foo` | `{ foo: false }` |
| `-f bar` | `{ f: "bar" }` |
| `-abc` | `{ a: true, b: true, c: true }` |
| `bare-word` | appended to `_: [...]` |
| `--` (double dash) | halts flag parsing; remaining words go to `_` |
| Duplicate flags | coalesce into arrays |

```js
// yeet run script.js --verbose --tag alpha --count 3 file.txt
console.log(yeet.args);
// { verbose: true, tag: "alpha", count: "3", _: ["file.txt"] }
```

> **Note:** All values are strings or booleans. Numeric strings are not
> coerced to numbers automatically.

---

### `yeet.exit()`

Terminates the running isolate. Equivalent to the global `exit()` function.

```js
yeet.exit();
```

---

### `yeet.graph`

Interface to the yeet system graph (a structured data query layer). All
operations use GraphQL query strings.

#### `yeet.graph.query(gql: string): Promise<{ data?, errors? }>`

Executes a one-shot GraphQL query. Returns a promise that resolves to the
**full GraphQL envelope** — an object with `data` and (on partial failure)
`errors` — not the inner data directly. Rejects with `{ code, message }`
only on transport-level failures.

```js
const { data, errors } = await yeet.graph.query(
  `{ host { uptime { uptime } } }`,
);
if (errors) throw new Error(errors[0].message);
console.log(data.host.uptime.uptime);
```

> **Gotcha:** `data.foo` works; `result.foo` does not. Always destructure
> or read `result.data` — forgetting this produces
> `Cannot read properties of undefined` errors that look like the schema
> changed when it did not.

To discover what the graph exposes, run `yeet graph dump` for the SDL or
`yeet graph query '<gql>'` for ad-hoc queries from the shell.

#### `yeet.graph.subscribe(gql: string, ticket: string, callback: (data: any) => void): void`

Starts a live subscription to a GraphQL query. The callback is invoked each
time the result changes. `ticket` is a caller-supplied string used to
identify and cancel the subscription later — it must be unique within the
isolate.

```js
yeet.graph.subscribe(
  `{ network { interfaces { name rx_bytes tx_bytes } } }`,
  "net-sub",
  (data) => console.log(data),
);
```

> **Implementation note:** `subscribe` is a stream binding. The callback is
> the last positional argument and is registered as a stream handler on the
> bus. The ticket string is passed as the second argument.

#### `yeet.graph.unsubscribe(ticket: string): Promise<boolean>`

Cancels a running subscription. Returns `true` if the subscription was
found and removed, `false` otherwise.

```js
await yeet.graph.unsubscribe("net-sub");
```

---

## `console` namespace

Standard-ish console API. All output is forwarded to the daemon event stream
and, if the isolate has an attached PTY, written directly to it.

| Method | Behavior |
|---|---|
| `console.log(...args)` | INFO level |
| `console.info(...args)` | INFO level |
| `console.warn(...args)` | WARN level |
| `console.error(...args)` | ERROR level |
| `console.debug(...args)` | DEBUG level |
| `console.assert(cond, ...args)` | Logs at ERROR level if `cond` is falsy |
| `console.clear()` | Sends ANSI clear-screen sequence |
| `console.count([label])` | Increments and prints counter for `label` (default: `"default"`) |
| `console.countReset([label])` | Resets counter |
| `console.dir(obj)` | Pretty-prints an object |
| `console.group(...args)` | Logs args and increases indent for subsequent lines |
| `console.groupCollapsed(...args)` | Same as `group` (no visual collapsing) |
| `console.groupEnd()` | Decreases indent |
| `console.table(data)` | Formats array/object as ASCII table |
| `console.time([label])` | Starts a named timer |
| `console.timeLog([label], ...args)` | Logs elapsed time without stopping |
| `console.timeEnd([label])` | Logs elapsed time and stops timer |
| `console.trace(...args)` | Logs `"Trace: ..."` with optional args |

Arguments are space-joined before output. No `%s` / `%d` printf-style
substitution is performed.

---

## `tty` namespace

Low-level terminal control. Writes go directly to the attached PTY (if
present) and are also mirrored to the daemon event stream.

> **PTY required.** Every `tty.*` method other than `tty.size()` will
> throw `Terminal IO failed: No such device or address (os error 6)`
> when no PTY is attached — for example when stdout is piped
> (`yeet run script.js | tee log`) or when running under a CI runner
> that doesn't allocate a TTY. Scripts that use `tty.*` must either be
> run interactively or wrapped with a PTY allocator like
> `script -q -c 'yeet run script.js' /dev/null`. There is no
> `process.stdout.isTTY` in this runtime; scripts that want to support
> both modes should probe with a `try { tty.write('') } catch {}` at
> startup and fall back to plain `console.log` output if it throws.

### `tty.write(...args): void`

Writes raw data to the TTY. Arguments are joined with spaces.

```js
tty.write("hello world\n");
```

### `tty.size(): { rows: number, cols: number }`

Returns current terminal dimensions. Defaults to `{ rows: 24, cols: 80 }`
when no PTY is attached. **Safe to call without a PTY** — unlike the
other `tty.*` methods.

### Cursor and screen control

| Method | ANSI sequence sent |
|---|---|
| `tty.clear()` | `\x1b[2J\x1b[H` — clear screen, cursor to top-left |
| `tty.move(row, col)` | `\x1b[{row+1};{col+1}H` — move cursor (0-based) |
| `tty.hideCursor()` | `\x1b[?25l` |
| `tty.showCursor()` | `\x1b[?25h` |
| `tty.alt()` | `\x1b[?1049h` — switch to alternate screen buffer |
| `tty.main()` | `\x1b[?1049l` — switch back to main screen buffer |
| `tty.eraseLine()` | `\x1b[2K\r` — erase line and return cursor to start |
| `tty.title(str)` | `\x1b]0;{str}\x07` — set terminal window title (control chars stripped) |

---

## `style` namespace

Pure-string ANSI styling utilities. Every function takes a string and
returns the styled version. Functions can be chained by nesting.

```js
console.log(style.bold(style.green("success")));
```

### Foreground colors

`style.black`, `style.red`, `style.green`, `style.yellow`, `style.blue`,
`style.magenta`, `style.purple` (alias for magenta), `style.cyan`,
`style.white`

### Bright foreground colors

`style.brightBlack`, `style.brightRed`, `style.brightGreen`,
`style.brightYellow`, `style.brightBlue`, `style.brightMagenta`,
`style.brightPurple`, `style.brightCyan`, `style.brightWhite`

### Background colors

`style.bgBlack`, `style.bgRed`, `style.bgGreen`, `style.bgYellow`,
`style.bgBlue`, `style.bgMagenta`, `style.bgCyan`, `style.bgWhite`

### Bright background colors

`style.bgBrightBlack`, `style.bgBrightRed`, `style.bgBrightGreen`,
`style.bgBrightYellow`, `style.bgBrightBlue`, `style.bgBrightMagenta`,
`style.bgBrightCyan`, `style.bgBrightWhite`

### Text formatting

| Method | Effect |
|---|---|
| `style.bold(text)` | Bold |
| `style.dim(text)` | Dimmed |
| `style.italic(text)` | Italic |
| `style.underline(text)` | Underline |
| `style.blink(text)` | Blink (terminal support varies) |
| `style.reversed(text)` | Swap foreground/background |
| `style.hidden(text)` | Hidden (fg = bg) |
| `style.strikethrough(text)` | Strikethrough |
| `style.reset(text)` | Strip all styling |

### RGB colors

```js
style.fg(text, r, g, b)  // foreground; r/g/b are 0–255
style.bg(text, r, g, b)  // background
```

Non-numeric arguments default to `0`.

> **Quantized to 16-colour ANSI.** Despite the RGB-shaped signature,
> these helpers do **not** emit 24-bit truecolour escapes (`\x1b[38;2;
> r;g;b m`). The runtime quantizes each `(r,g,b)` triple to the closest
> ANSI 16-colour code (`\x1b[30m`–`\x1b[37m`, `\x1b[90m`–`\x1b[97m`).
> This means smooth gradients across many RGB values collapse to a
> handful of distinct on-screen colours. To get a specific bright
> colour reliably, choose RGB values that already land on it — for
> example `(255, 50, 220)` → bright magenta, `(0, 240, 240)` → bright
> cyan, `(255, 220, 100)` → bright yellow, `(90, 90, 90)` → bright
> black (visible dark gray). When in doubt, probe with
> `JSON.stringify(style.fg('x', r, g, b))` to see the actual escape.

---

## Timers

Global timer functions, behaving like their browser counterparts.

### `setTimeout(callback, delay, ...args): number`

Schedules `callback` to run once after `delay` milliseconds. Extra `args`
are passed to the callback. Returns a timer ID.

### `clearTimeout(id): void`

Cancels a pending timeout. Safe to call with an invalid or already-fired ID.

### `setInterval(callback, period, ...args): number`

Schedules `callback` to run repeatedly every `period` milliseconds. Returns
a timer ID.

### `clearInterval(id): void`

Cancels a repeating interval.

### `queueMicrotask(callback): void`

Queues `callback` as a microtask (runs before the next timer/IO callback).
The callback receives no arguments.

---

## `exit()` (global)

```js
exit();
```

Terminates the isolate immediately. Any registered exit handlers run first.
Identical to `yeet.exit()`.

---

## GraphQL modules

Importing a `.gql` or `.graphql` file produces a module that exports a
single default function:

```js
import getStatus from './status.graphql';

// One-shot query with variable interpolation:
const { query, subscribe, unsubscribe } = getStatus({ nodeId: 42 });

const result = await query();

// Streaming subscription:
subscribe((data) => {
  console.log(data);
});

// Cancel it later:
unsubscribe(ticket);
```

The default export is `(vars?: Record<string, any>) => { query, subscribe, unsubscribe }`.

Variables are interpolated into the query string: `$varName` tokens are
replaced with their values. Strings are quoted; numbers and booleans are
inserted as-is.

The `subscribe` / `unsubscribe` returned by the module call delegate to
`yeet.graph.subscribe` / `yeet.graph.unsubscribe`.

---

## BPF modules

Importing a `.bpf.o` file produces a proxy object for managing an eBPF
program blob.

```js
import probe from './tcp_probe.bpf.o';

// Declare map bindings before loading:
probe.bind("events", { kind: "ring_buf" });

// Attach programs to hooks:
probe.attach("tcp_connect", { type: "kprobe" });

// Load the blob (async):
const { blob_id } = await probe.start();

// Subscribe to a map by name:
probe.events.subscribe((event) => {
  console.log(event);
});

// Read a map entry by key:
const value = await probe.events.read(key);
```

### Proxy API

| Method/property | Description |
|---|---|
| `probe.loaded` | `boolean` — true once `.start()` has resolved |
| `probe.bind(name, opts)` | Declares a map binding; returns proxy for chaining |
| `probe.attach(progName, opts?)` | Declares a program attachment; returns proxy for chaining |
| `probe.start(bindings?)` | `Promise<{ blob_id: string }>` — loads the BPF object. Accepts an optional array of binding descriptors for backwards compat. Idempotent. |
| `probe.<mapName>.subscribe(cb)` | Streams ring_buf events for map `mapName` to `cb` |
| `probe.<mapName>.read(key)` | `Promise<any>` — reads a map entry by key |

> **Note:** `yeet.blob.*` (the underlying binding for `.start()`,
> `.subscribe()`, and `.map_read()`) is the host-provided primitive that
> BPF modules delegate to internally. Script authors should work through
> the `.bpf.o` import proxy rather than calling `yeet.blob` directly.

---

## V8 built-ins

Standard JavaScript built-ins available from V8 itself:

- All ECMAScript built-ins: `Array`, `Object`, `Map`, `Set`, `WeakMap`,
  `WeakSet`, `Promise`, `Proxy`, `Reflect`, `Symbol`, `BigInt`, `RegExp`,
  `Date`, `Error`, `JSON`, `Math`, `ArrayBuffer`, `TypedArray`,
  `DataView`, `WeakRef`, `FinalizationRegistry`
- `structuredClone`
- `globalThis`
- `eval` / `Function` constructor (present but use with care)

> **No ICU.** This V8 build is compiled without ICU, so the `Intl.*`
> namespace and any string method that delegates to it are unsafe to
> call. In particular `String.prototype.localeCompare` throws
> `RangeError: Internal error. Icu error.` Use plain `<` / `>`
> comparisons (`a < b ? -1 : a > b ? 1 : 0`) for sorting; format
> numbers and dates manually rather than via `Intl.NumberFormat` /
> `Intl.DateTimeFormat`. `String.prototype.toLowerCase` /
> `toUpperCase` work for ASCII; locale-aware case folding does not.

---

## What is NOT available

The following APIs are **absent** from the yeet runtime. Attempting to use
them will result in `ReferenceError` or `TypeError`.

### Node.js / Deno APIs

| Missing API | Notes |
|---|---|
| `process` | No `process.env`, `process.argv`, `process.exit()`, `process.cwd()`, signals, or streams. Use `yeet.args` for arguments. |
| `require()` / CommonJS | Use `import` / ES modules only. |
| `__dirname` / `__filename` | Not defined. |
| `Buffer` | Not available. Use `Uint8Array` / `ArrayBuffer`. |
| `fs` | No file system access from scripts. |
| `path` | No path utilities. |
| `os` | No OS info module. |
| `child_process` / `exec` | No subprocess spawning. |
| `net` / `http` / `https` | No raw socket or HTTP server/client APIs. |
| `setImmediate` / `clearImmediate` | Not present. Use `queueMicrotask()` or `setTimeout(fn, 0)`. |
| `performance` | No `performance.now()` or `PerformanceObserver`. |

### Web/Browser APIs

| Missing API | Notes |
|---|---|
| `fetch` | No HTTP client. Data comes through `yeet.graph` or custom host bindings. |
| `WebSocket` | Not available. |
| `crypto` / `SubtleCrypto` | No Web Crypto API. |
| `TextEncoder` / `TextDecoder` | Not present. |
| `URL` / `URLSearchParams` | Not present. |
| `AbortController` / `AbortSignal` | Not present. |
| `Event` / `EventTarget` / `CustomEvent` | No DOM event system. |
| `Worker` / `SharedArrayBuffer` / `Atomics` | No threading. Each isolate is single-threaded. |
| `localStorage` / `sessionStorage` | No storage APIs. |
| `navigator` | Not defined. |
| `location` | Not defined. |
| `document` / DOM | No DOM. |
| `requestAnimationFrame` | Not present. Use `setInterval`. |
| `XMLHttpRequest` | Not present. |
| `FormData` / `Blob` (web) | Not present. |
| `ReadableStream` / `WritableStream` | No WHATWG streams. |

---

## Execution model

- Scripts run as ES modules inside a V8 isolate.
- Async/await and promises work — the event loop runs timers and resolves
  pending promises between turns.
- There is no parallelism within a single isolate. All JavaScript executes
  on one thread.
- The isolate terminates when the top-level module finishes and no pending
  timers or unresolved promises remain, or when `exit()` / `yeet.exit()` is
  called.
- Uncaught exceptions and unhandled promise rejections are reported to the
  daemon as diagnostic events (with message, stack trace, and source
  context) and terminate the isolate.
