.PHONY: run start stop info

run:
	@trap './activity.sh stop' EXIT INT TERM HUP; \
	 ./activity.sh start; \
	 yeet run ./index.js

start:
	@./activity.sh start

stop:
	@./activity.sh stop

info:
	@head -10 ./index.js | sed -n 's|^// \?||p'
