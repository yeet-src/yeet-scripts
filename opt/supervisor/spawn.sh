#!/usr/bin/env bash
# Boot every script in services.d/ as a detached, supervised service.
# Convention:
#   services.d/<name>.sh     — supervisor loop for a service
#   <name> matches the binary name pgrep should look for to confirm readiness.

set -u

SERVICES_DIR=/opt/supervisor/services.d

# Spawn anything not already running. Each script is launched as root in
# its own session so it survives the entry shell exiting.
for service in "$SERVICES_DIR"/*.sh; do
    [ -x "$service" ] || continue

    if pgrep -f "$service" >/dev/null 2>&1; then
        continue
    fi

    sudo setsid -f "$service" </dev/null >/dev/null 2>&1
done

# Wait until every service's bin shows up in the process table.
for service in "$SERVICES_DIR"/*.sh; do
    [ -x "$service" ] || continue
    name=$(basename "$service" .sh)
    until pgrep -x "$name" >/dev/null 2>&1; do
        sleep 0.1
    done
done
