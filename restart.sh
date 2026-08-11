#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$PROJECT_ROOT/.dadras.pid"
LOG_FILE="$PROJECT_ROOT/dadras.log"
PORT="${PORT:-8787}"

cd "$PROJECT_ROOT"

for required_command in node npm; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Error: $required_command is not installed or is not in PATH." >&2
    exit 1
  fi
done

echo "Installing locked dependencies..."
npm ci

echo "Building the production frontend..."
npm run build

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

echo "Starting Dadras on 127.0.0.1:$PORT..."
nohup env NODE_ENV=production PORT="$PORT" node server/index.mjs >>"$LOG_FILE" 2>&1 &
dadras_pid=$!
printf '%s' "$dadras_pid" > "$PID_FILE"

sleep 2
if ! kill -0 "$dadras_pid" 2>/dev/null; then
  echo "Dadras failed to start. Recent log output:" >&2
  tail -n 40 "$LOG_FILE" >&2 || true
  rm -f -- "$PID_FILE"
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/health" >/dev/null
fi

echo "Dadras restarted successfully (PID $dadras_pid)."
echo "Local service: http://127.0.0.1:$PORT"
echo "Log file: $LOG_FILE"
echo "Expose it publicly through Nginx; do not expose the Ollama port."
