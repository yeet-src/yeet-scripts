// proctop / dump.js
//
// One JSON line per data.js event. Use to verify the data layer:
//   yeet run examples/proctop/dump.js | jq .

import { watch } from "./data.js";

const intervalMs = Number(yeet.args.interval) || 1500;

watch({ intervalMs }, (ev) => console.log(JSON.stringify(ev)));
