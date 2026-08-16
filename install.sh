#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE_MAJOR=22
SERVER_NAME="${DOMAIN:-_}"

if [[ ! "$SERVER_NAME" =~ ^([A-Za-z0-9.-]+|_)$ ]]; then
  echo "Error: DOMAIN must be a hostname or IPv4 address." >&2
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

echo "Registering PM2 for automatic startup after reboot..."
pm2_user="${SUDO_USER:-$(id -un)}"
pm2_home="$(getent passwd "$pm2_user" | cut -d: -f6)"
if [[ -z "$pm2_home" ]]; then
  echo "Error: could not determine the home directory for PM2 user $pm2_user." >&2
  exit 1
fi
"${SUDO[@]}" env PATH="$PATH" "$PROJECT_ROOT/node_modules/.bin/pm2" startup systemd -u "$pm2_user" --hp "$pm2_home"
"$PROJECT_ROOT/node_modules/.bin/pm2" save

echo "Configuring Nginx..."
nginx_config="$(mktemp)"
trap 'rm -f -- "${nginx_config:-}"' EXIT
sed "s/dadras\.example\.com/$SERVER_NAME/" \
  "$PROJECT_ROOT/deploy/dadras.nginx.conf" > "$nginx_config"

if [[ "$SERVER_NAME" == "_" ]]; then
  sed -i \
    -e 's/listen 80;/listen 80 default_server;/' \
    -e 's/listen \[::\]:80;/listen [::]:80 default_server;/' \
    "$nginx_config"
  "${SUDO[@]}" rm -f -- /etc/nginx/sites-enabled/default
fi

"${SUDO[@]}" install -m 0644 "$nginx_config" /etc/nginx/sites-available/dadras
"${SUDO[@]}" ln -sfn /etc/nginx/sites-available/dadras /etc/nginx/sites-enabled/dadras
"${SUDO[@]}" nginx -t
"${SUDO[@]}" systemctl enable --now nginx
"${SUDO[@]}" systemctl reload nginx
rm -f -- "$nginx_config"
trap - EXIT

if command -v ufw >/dev/null 2>&1 && "${SUDO[@]}" ufw status | grep -q '^Status: active'; then
  "${SUDO[@]}" ufw allow 'Nginx Full'
fi

echo
echo "First-time installation completed."
if [[ "$SERVER_NAME" == "_" ]]; then
  echo "Open http://YOUR_VPS_IP in your browser."
  echo "For a domain, rerun with: DOMAIN=dadras.example.com ./install.sh"
else
  echo "Open http://$SERVER_NAME in your browser."
  echo "Point the domain's DNS record to this VPS if it is not already configured."
fi
