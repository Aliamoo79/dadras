#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE_MAJOR=22
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8012}"

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "Error: PORT must be a number from 1 to 65535." >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Error: this installer supports Ubuntu and Debian VPS hosts." >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ;;
  *)
    echo "Error: this installer supports Ubuntu and Debian, not ${ID:-unknown}." >&2
    exit 1
    ;;
esac

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=()
elif command -v sudo >/dev/null 2>&1; then
  SUDO=(sudo)
else
  echo "Error: run this script as root or install sudo first." >&2
  exit 1
fi

echo "Installing system prerequisites..."
"${SUDO[@]}" apt-get update
"${SUDO[@]}" apt-get install -y ca-certificates curl git

node_is_compatible=false
if command -v node >/dev/null 2>&1; then
  node_version="$(node -p 'process.versions.node')"
  node_major="${node_version%%.*}"
  node_remainder="${node_version#*.}"
  node_minor="${node_remainder%%.*}"
  if { [[ "$node_major" -eq 20 && "$node_minor" -ge 19 ]] || [[ "$node_major" -eq 22 && "$node_minor" -ge 12 ]] || [[ "$node_major" -gt 22 ]]; }; then
    node_is_compatible=true
  fi
fi

if [[ "$node_is_compatible" != true ]]; then
  echo "Installing Node.js ${NODE_MAJOR}.x..."
  nodesource_setup="$(mktemp)"
  trap 'rm -f -- "${nodesource_setup:-}"' EXIT
  curl --fail --silent --show-error --location \
    "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" --output "$nodesource_setup"
  "${SUDO[@]}" bash "$nodesource_setup"
  "${SUDO[@]}" apt-get install -y nodejs
  rm -f -- "$nodesource_setup"
  trap - EXIT
fi

hash -r
echo "Using Node.js $(node --version) and npm $(npm --version)."

chmod +x "$PROJECT_ROOT/restart.sh"
HOST="$HOST" PORT="$PORT" "$PROJECT_ROOT/restart.sh"

echo "Registering PM2 for automatic startup after reboot..."
pm2_user="${SUDO_USER:-$(id -un)}"
pm2_home="$(getent passwd "$pm2_user" | cut -d: -f6)"
if [[ -z "$pm2_home" ]]; then
  echo "Error: could not determine the home directory for PM2 user $pm2_user." >&2
  exit 1
fi
"${SUDO[@]}" env PATH="$PATH" "$PROJECT_ROOT/node_modules/.bin/pm2" startup systemd -u "$pm2_user" --hp "$pm2_home"
"$PROJECT_ROOT/node_modules/.bin/pm2" save

if command -v ufw >/dev/null 2>&1 && "${SUDO[@]}" ufw status | grep -q '^Status: active'; then
  "${SUDO[@]}" ufw allow "$PORT/tcp"
fi

echo
echo "First-time installation completed."
echo "Open http://YOUR_VPS_IP:$PORT in your browser."
echo "Dadras is managed by PM2 and does not require Nginx."
