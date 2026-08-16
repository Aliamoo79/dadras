#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$PROJECT_ROOT/.dadras.pid"
PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"

cd "$PROJECT_ROOT"

for required_command in node npm; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Error: $required_command is not installed or is not in PATH." >&2
    exit 1
  fi
done

node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"
node_remainder="${node_version#*.}"
node_minor="${node_remainder%%.*}"

if ! { [[ "$node_major" -eq 20 && "$node_minor" -ge 19 ]] || [[ "$node_major" -eq 22 && "$node_minor" -ge 12 ]] || [[ "$node_major" -gt 22 ]]; }; then
  echo "Error: Dadras requires Node.js 20.19+ or 22.12+. Found Node.js $node_version." >&2
  echo "Upgrade Node.js on the VPS, then run ./restart.sh again." >&2
  exit 1
fi

echo "Installing locked dependencies..."
npm ci

echo "Building the production frontend..."
npm run build

PM2_BIN="$PROJECT_ROOT/node_modules/.bin/pm2"
if [[ ! -x "$PM2_BIN" ]]; then
  echo "Error: project-local PM2 was not installed by npm ci." >&2
  exit 1
fi

# Remove only the legacy nohup process created by older versions of restart.sh.
if [[ -f "$PID_FILE" ]]; then
  previous_pid="$(tr -dc '0-9' < "$PID_FILE")"
  if [[ -n "$previous_pid" ]] && kill -0 "$previous_pid" 2>/dev/null; then
    process_cwd="$(readlink -f "/proc/$previous_pid/cwd" 2>/dev/null || true)"
    process_command="$(tr '\0' ' ' < "/proc/$previous_pid/cmdline" 2>/dev/null || true)"

    if [[ "$process_cwd" == "$PROJECT_ROOT" && "$process_command" == *"server/index.mjs"* ]]; then
      echo "Stopping the previous Dadras server (PID $previous_pid)..."
      kill -TERM "$previous_pid"
      for _ in {1..20}; do
        kill -0 "$previous_pid" 2>/dev/null || break
        sleep 0.5
      done
      if kill -0 "$previous_pid" 2>/dev/null; then
        echo "The old server did not stop in time; forcing only verified PID $previous_pid to exit."
        kill -KILL "$previous_pid"
      fi
    else
      echo "Refusing to stop PID $previous_pid because it is not the Dadras server." >&2
      rm -f -- "$PID_FILE"
      exit 1
    fi
  fi
  rm -f -- "$PID_FILE"
fi

echo "Starting or reloading Dadras with PM2 on $HOST:$PORT..."
HOST="$HOST" PORT="$PORT" "$PM2_BIN" startOrReload ecosystem.config.cjs --update-env
"$PM2_BIN" save

if command -v curl >/dev/null 2>&1; then
  for _ in {1..10}; do
    if curl --fail --silent "http://127.0.0.1:$PORT/api/health" >/dev/null; then
      break
    fi
    sleep 1
  done
  if ! curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    echo "Dadras failed its health check. Recent PM2 logs:" >&2
    "$PM2_BIN" logs dadras --lines 40 --nostream >&2 || true
    exit 1
  fi
fi

echo "Dadras is online under PM2."
echo "Listening address: http://$HOST:$PORT"
echo "Logs: $PM2_BIN logs dadras"
if [[ "$HOST" == "0.0.0.0" || "$HOST" == "::" ]]; then
  echo "Public access enabled. Open only TCP port $PORT in the firewall; do not expose the Ollama port."
else
  echo "Loopback access only. Set HOST=0.0.0.0 for direct IP-and-port access."
fi
