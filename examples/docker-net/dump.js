// docker-net / dump.js
//
// Raw event dumper. One JSON line per event from data.js.
//
//   yeet run examples/docker-net/dump.js | jq .

import { watch } from "./data.js";

const intervalMs = Number(yeet.args.interval) || 2000;

watch({ intervalMs }, (ev) => {
  console.log(JSON.stringify(ev));
});
