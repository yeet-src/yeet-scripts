// proctop / data.js
//
// Subscribes to procs(), computes per-PID CPU% from utime+stime deltas,
// and emits a stream of ticks. Pure data layer — no tty, no style.
//
// Events:
//   { kind: 'config', t, ticksPerSec, intervalMs }
//   { kind: 'tick',   t, pids: [{ pid, comm, cmdline, cpuPct, rssBytes }] }
//   { kind: 'error',  t, error }
//
// To expose a new field to the renderer, fetch it in the subscription
// query below and add it to the per-pid object pushed into `pids`.

const unwrap = (resp) => resp.data ?? resp;

export function watch(opts, emit) {
  const intervalMs = opts.intervalMs ?? 1500;
  let stopped = false;
  let ticket = null;

  /* pid → { ticks, t } from the previous sample, for CPU% deltas. */
  const prev = new Map();
  let ticksPerSec = 100;

  yeet.graph
    .query("{ host { ticks_per_second } }")
    .then((resp) => {
      const v = resp.data?.host?.ticks_per_second;
      if (typeof v === "number" && v > 0) ticksPerSec = v;
      emit({ kind: "config", t: Date.now(), ticksPerSec, intervalMs });

      ticket = yeet.graph.subscribe(
        `subscription {
           procs(interval_ms: ${intervalMs}) {
             pid
             cmdline
             stat { comm utime stime rss_bytes }
           }
         }`,
        (resp) => {
          if (stopped) return;
          const list = unwrap(resp)?.procs;
          if (!Array.isArray(list)) return;

          const now = Date.now();
          const pids = [];
          const seen = new Set();

          for (const p of list) {
            const ticks = (p.stat?.utime ?? 0) + (p.stat?.stime ?? 0);
            seen.add(p.pid);

            const last = prev.get(p.pid);
            let cpuPct = 0;
            if (last) {
              const dTicks = ticks - last.ticks;
              const dt = (now - last.t) / 1000;
              if (dt > 0 && dTicks > 0) {
                cpuPct = (dTicks / ticksPerSec / dt) * 100;
              }
            }
            prev.set(p.pid, { ticks, t: now });

            pids.push({
              pid: p.pid,
              comm: p.stat?.comm ?? "?",
              cmdline: Array.isArray(p.cmdline) ? p.cmdline : [],
              cpuPct,
              rssBytes: p.stat?.rss_bytes ?? 0,
            });
          }

          for (const k of [...prev.keys()]) {
            if (!seen.has(k)) prev.delete(k);
          }

          emit({ kind: "tick", t: now, pids });
        },
      );
    })
    .catch((e) => {
      emit({ kind: "error", t: Date.now(), error: String(e?.message ?? e) });
    });

  return {
    stop() {
      stopped = true;
      if (ticket !== null) yeet.graph.unsubscribe(ticket).catch(() => {});
    },
  };
}
