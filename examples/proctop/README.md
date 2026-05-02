# proctop

A small, top(1)-like process viewer.

`data.js` is the data layer (subscribes to procs, computes per-PID
CPU%); `index.js` renders. Add a column by appending to the `COLUMNS`
array in `index.js`.

## controls

- **Esc**          back to the picker
- **←/→**          prev / next banger
- **Space**        toggle this readme
- **Ctrl+C**       interrupt the script
