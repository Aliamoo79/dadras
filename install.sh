#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE_MAJOR=22

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
"${SUDO[@]}" apt-get install -y ca-certificates curl git nginx

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
"$PROJECT_ROOT/restart.sh"

echo
echo "First-time installation completed."
echo "Next: configure Nginx using deploy/dadras.nginx.conf (see README.md)."
