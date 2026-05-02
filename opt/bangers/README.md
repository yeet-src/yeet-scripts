# bangers/

The picker (`/opt/scripts/banger/pick.sh`) treats every entry in this
directory as a banger. Each one is a **symlink to a directory** under
`~/examples/` that follows the banger Makefile protocol.

## directory listing

```
opt/bangers/
├── 001-metropolis  →  /home/you/examples/metropolis/
├── 002-matrix      →  /home/you/examples/matrix/
├── 003-starfield   →  /home/you/examples/starfield/
├── ...
└── README.md       (this file — ignored by the picker)
```

## naming

Symlinks follow `NNN-name` where `NNN` is a zero-padded ordinal:

- The numeric prefix orders the picker (alphabetic sort = numeric order).
- The prefix is stripped from menu display and the tmux status bar.
- Renumbering is automatic — `make banger` keeps the prefix tight after
  add / remove / reorder.

## the banger Makefile protocol

A banger directory must contain at minimum:

```
<banger>/
├── Makefile      ← `run` target (required)
└── README.md     ← shown by frogmouth on Space (required)
```

Plus whatever source files the banger needs — the script(s), data
modules, fixtures, anything.

### required target

| target  | what it does                                          |
|---------|-------------------------------------------------------|
| `run`   | starts the banger; the picker invokes `make -C <dir> run`. anything goes inside: env vars, args, multi-step setup. |

### conventional optional targets

| target  | what it does                                          |
|---------|-------------------------------------------------------|
| `info`  | prints a one-line description (or the leading comment block from the entry script). |
| `help`  | prints available flags / options.                     |
| `start` | spawn synthetic activity for this banger to react to. |
| `stop`  | kill anything `start` spawned.                        |
| `clean` | wipes any state the banger created.                   |
| `dev`   | alternate run for development (e.g. with `--once`).   |

The picker only depends on `run`. The rest are conveniences for humans
poking around at the shell.

### start / stop convention

For bangers that visualize live system data (proctop, metropolis), a
quiet host is boring. Drop an `activity.sh` next to `index.js` and have
your `Makefile` chain it through `start` / `stop`:

```makefile
run:
	@trap '$(MAKE) -s stop' EXIT INT TERM; \
	 $(MAKE) -s start; \
	 yeet run ./index.js

start: ; @./activity.sh start
stop:  ; @./activity.sh stop
```

The `trap` ensures `stop` fires even when the banger is interrupted
with Ctrl+C. Each banger's `activity.sh` is **its own** — proctop
spawns CPU workers with realistic-sounding names; metropolis spawns
processes in mixed states (R/S/T) so the boulevard has citizens of
each kind. Self-contained visualizations (matrix, fire, plasma, …)
don't need any of this.

### example

```makefile
# examples/proctop/Makefile
.PHONY: run info help

run:
	yeet run ./index.js --interval 1500

info:
	@head -10 ./index.js | sed -n 's|^// \?||p'

help:
	@echo "  --interval N   poll cadence (ms, default 1500)"
	@echo "  --rows N       max process rows"
	@echo "  --sort cpu|mem|pid"
```

## adding / removing / reordering

Don't edit symlinks by hand — use the management TUI:

```bash
make banger
```

It scaffolds new banger directories with the right files, renumbers
symlinks after every change, and never leaves gaps in the ordering.
