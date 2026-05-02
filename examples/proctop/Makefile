.PHONY: run start stop info help

run:
	@trap './activity.sh stop' EXIT INT TERM HUP; \
	 ./activity.sh start; \
	 yeet run ./index.js --interval 1500

start:
	@./activity.sh start

stop:
	@./activity.sh stop

info:
	@head -10 ./index.js | sed -n 's|^// \?||p'

help:
	@echo "  --interval N      poll cadence (ms, default 1500)"
	@echo "  --rows N          max process rows"
	@echo "  --sort cpu|mem|pid"
