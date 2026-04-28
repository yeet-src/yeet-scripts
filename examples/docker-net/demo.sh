#!/usr/bin/env bash
# demo.sh — spin up / tear down a small docker stack for exercising
# docker-net. Idempotent: running `up` twice is fine; `down` is
# always safe.
#
# Usage:
#   ./demo.sh up        create networks + containers
#   ./demo.sh down      remove them
#   ./demo.sh status    list what the script manages

set -euo pipefail

NETWORKS=(frontend backend)
# name | network | extra docker run args
CONTAINERS=(
  "web|frontend|-p 8080:80 -p 127.0.0.1:9090:9090 -l com.docker.compose.project=demo -l com.docker.compose.service=web nginx:alpine"
  "api|frontend|-l com.docker.compose.project=demo -l com.docker.compose.service=api busybox sh -c 'sleep 9999'"
  "db|backend|-l com.docker.compose.project=demo -l com.docker.compose.service=db busybox sh -c 'sleep 9999'"
  "standalone|bridge|busybox sh -c 'sleep 9999'"
  "hostmode|host|busybox sh -c 'sleep 9999'"
  "lonely|none|busybox sh -c 'sleep 9999'"
)
# Containers that need to be attached to a second network after creation:
#   name | extra-network
EXTRA_ATTACHMENTS=(
  "api|backend"
)

managed_names() {
  for entry in "${CONTAINERS[@]}"; do
    echo "${entry%%|*}"
  done
}

up() {
  for net in "${NETWORKS[@]}"; do
    if ! docker network inspect "$net" >/dev/null 2>&1; then
      docker network create "$net" >/dev/null
      echo "created network $net"
    fi
  done

  for entry in "${CONTAINERS[@]}"; do
    name="${entry%%|*}"
    rest="${entry#*|}"
    network="${rest%%|*}"
    args="${rest#*|}"

    if docker inspect "$name" >/dev/null 2>&1; then
      echo "skip $name (already exists)"
      continue
    fi

    eval "docker run -d --name '$name' --network '$network' $args" >/dev/null
    echo "started $name (network=$network)"
  done

  for entry in "${EXTRA_ATTACHMENTS[@]}"; do
    name="${entry%%|*}"
    extra="${entry#*|}"
    if ! docker inspect "$name" >/dev/null 2>&1; then continue; fi
    if docker inspect "$name" --format '{{json .NetworkSettings.Networks}}' \
        | grep -q "\"$extra\""; then
      continue
    fi
    docker network connect "$extra" "$name"
    echo "attached $name to $extra"
  done

  echo
  status
}

down() {
  for name in $(managed_names); do
    if docker inspect "$name" >/dev/null 2>&1; then
      docker rm -f "$name" >/dev/null
      echo "removed $name"
    fi
  done
  for net in "${NETWORKS[@]}"; do
    if docker network inspect "$net" >/dev/null 2>&1; then
      docker network rm "$net" >/dev/null
      echo "removed network $net"
    fi
  done
}

status() {
  echo "== managed containers =="
  docker ps -a --filter "name=^/(web|api|db|standalone|hostmode|lonely)$" \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}\t{{.Ports}}' || true
  echo
  echo "== managed networks =="
  for net in "${NETWORKS[@]}"; do
    if docker network inspect "$net" >/dev/null 2>&1; then
      echo "  $net (present)"
    else
      echo "  $net (absent)"
    fi
  done
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  *)
    echo "usage: $0 {up|down|status}" >&2
    exit 2
    ;;
esac
