// docker-net / data.js
//
// Pure data layer. One-shot fetches docker.list_containers, normalizes,
// groups by network, surfaces compose project/service labels, and flags
// multi-network containers.
//
// Events:
//   { kind: 'snapshot', t, model }
//   { kind: 'error',    t, error }
//
// model:
//   {
//     containers: [Container],
//     byNetwork: { <name>: { containers: [Container] } },
//     projects:  { <name>: { services: [string] } } | null
//   }
//
// Container:
//   { id, name, image, state, networks:[name], multiNet:bool,
//     project, service,
//     ports: [{ ip, privatePort, publicPort, proto, exposed:bool }] }
//
// (`exposed` is true when ip is 0.0.0.0 / ::, i.e. publicly bound.)

const QUERY = `{
  docker {
    list_containers(opts: { all: true }) {
      id
      names
      name
      image
      state
      labels
      ports { ip private_port public_port typ }
      network_settings {
        networks { name network_id aliases }
      }
    }
  }
}`;

function statsQuery(name) {
  /* Docker container names are constrained to [a-zA-Z0-9][a-zA-Z0-9_.-]+
   * — safe to inline. We strip anything else defensively. */
  const safe = String(name).replace(/[^a-zA-Z0-9_.-]/g, "");
  return `{
    docker {
      stats(container_name: "${safe}") {
        cpu_stats {
          cpu_usage { total_usage }
          system_cpu_usage
          online_cpus
        }
        precpu_stats {
          cpu_usage { total_usage }
          system_cpu_usage
        }
        memory_stats { usage limit }
        networks { interface_name rx_bytes tx_bytes }
      }
    }
  }`;
}

function cpuPct(s) {
  const cur = s?.cpu_stats;
  const prev = s?.precpu_stats;
  const cpuD =
    (cur?.cpu_usage?.total_usage ?? 0) - (prev?.cpu_usage?.total_usage ?? 0);
  const sysD =
    (cur?.system_cpu_usage ?? 0) - (prev?.system_cpu_usage ?? 0);
  const cores = cur?.online_cpus ?? 0;
  if (cpuD <= 0 || sysD <= 0 || cores <= 0) return 0;
  return (cpuD / sysD) * cores * 100;
}

function netTotals(s) {
  let rx = 0;
  let tx = 0;
  for (const n of s?.networks ?? []) {
    rx += n.rx_bytes ?? 0;
    tx += n.tx_bytes ?? 0;
  }
  return { rx, tx };
}

const shortId = (id) => (id ? id.slice(0, 12) : "<no-id>");

function nameOf(c) {
  const n = (c.names && c.names[0]) || c.name;
  return n ? n.replace(/^\//, "") : shortId(c.id);
}

function normalizePort(p) {
  const ip = p.ip ?? null;
  const exposed = ip === "0.0.0.0" || ip === "::";
  return {
    ip,
    privatePort: p.private_port,
    publicPort: p.public_port ?? null,
    proto: p.typ ?? "TCP",
    exposed,
  };
}

function normalize(raw) {
  const networks = (raw.network_settings?.networks ?? [])
    .map((n) => n.name)
    .filter(Boolean);
  const labels = raw.labels ?? {};
  return {
    id: raw.id,
    name: nameOf(raw),
    image: raw.image,
    state: raw.state,
    networks,
    multiNet: networks.length > 1,
    project: labels["com.docker.compose.project"] ?? null,
    service: labels["com.docker.compose.service"] ?? null,
    ports: (raw.ports ?? []).map(normalizePort),
  };
}

function buildModel(rawList) {
  const containers = rawList.map(normalize);

  /* Network → containers (a container with N networks appears in N
   * sections; that's intentional — multi-net containers are bridges
   * between networks and need to be visible in each). */
  const byNetwork = {};
  for (const c of containers) {
    const nets = c.networks.length > 0 ? c.networks : ["(no network)"];
    for (const n of nets) {
      if (!byNetwork[n]) byNetwork[n] = { containers: [] };
      byNetwork[n].containers.push(c);
    }
  }

  /* Compose project → services (deduped). */
  let projects = null;
  for (const c of containers) {
    if (!c.project) continue;
    if (!projects) projects = {};
    if (!projects[c.project]) projects[c.project] = { services: [] };
    if (c.service && !projects[c.project].services.includes(c.service)) {
      projects[c.project].services.push(c.service);
    }
  }
  if (projects) {
    for (const p of Object.values(projects)) p.services.sort();
  }

  return { containers, byNetwork, projects };
}

async function fetchStats(container, prevByName) {
  if (container.state !== "RUNNING") return null;

  let resp;
  try {
    resp = await yeet.graph.query(statsQuery(container.name));
  } catch {
    return null;
  }
  if (resp.errors) return null;
  const s = resp.data?.docker?.stats;
  if (!s) return null;

  const now = Date.now();
  const totals = netTotals(s);
  const prev = prevByName.get(container.name);

  let rxBps = null;
  let txBps = null;
  if (prev && now > prev.t) {
    const dt = (now - prev.t) / 1000;
    rxBps = Math.max(0, (totals.rx - prev.rx) / dt);
    txBps = Math.max(0, (totals.tx - prev.tx) / dt);
  }
  prevByName.set(container.name, { t: now, rx: totals.rx, tx: totals.tx });

  return {
    cpuPct: cpuPct(s),
    memBytes: s.memory_stats?.usage ?? null,
    memLimit: s.memory_stats?.limit ?? null,
    rxBps,
    txBps,
    rxTotal: totals.rx,
    txTotal: totals.tx,
  };
}

async function snapshotWith(prevByName) {
  const resp = await yeet.graph.query(QUERY);
  if (resp.errors) throw new Error(resp.errors[0].message);
  const model = buildModel(resp.data?.docker?.list_containers ?? []);

  /* Fan out stats queries for running containers in parallel. */
  const targets = model.containers.filter((c) => c.state === "RUNNING");
  const results = await Promise.all(
    targets.map((c) => fetchStats(c, prevByName)),
  );
  for (let i = 0; i < targets.length; i++) {
    targets[i].stats = results[i];
  }
  /* Drop cache entries for containers that disappeared. */
  const live = new Set(targets.map((c) => c.name));
  for (const k of [...prevByName.keys()]) {
    if (!live.has(k)) prevByName.delete(k);
  }

  return model;
}

export async function snapshot() {
  return snapshotWith(new Map());
}

export function watch(opts, emit) {
  const intervalMs = opts.intervalMs ?? 2000;
  /* Per-container previous network totals, keyed by name. Persists
   * across ticks so we can compute rx/tx rates from deltas. */
  const prevByName = new Map();

  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      const model = await snapshotWith(prevByName);
      emit({ kind: "snapshot", t: Date.now(), model });
    } catch (e) {
      emit({
        kind: "error",
        t: Date.now(),
        error: String(e?.message ?? e),
      });
    }
  }

  timer = setInterval(tick, intervalMs);
  tick();

  return {
    stop() {
      stopped = true;
      if (timer !== null) clearInterval(timer);
    },
  };
}
