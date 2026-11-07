# Shared helpers for bin/rickos-* (sourced, not executed).
# Starts the rickOS server in the background when it isn't running yet.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${RICKOS_PORT:-4318}"
URL="http://127.0.0.1:${PORT}"
LOG_DIR="${HOME}/Library/Logs/rickOS"
PID_FILE="${LOG_DIR}/server.pid"
mkdir -p "$LOG_DIR"

# Node from nvm/homebrew even when launched outside an interactive shell.
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

server_up() {
  curl -fsS --max-time 1 "${URL}/api/health" 2>/dev/null | grep -q '"channels"'
}

# Rebuild the web front + server when the build is missing or older than the sources.
needs_build() {
  local stamp="${ROOT}/dist-server/main.js"
  [ -f "$stamp" ] && [ -f "${ROOT}/dist/index.html" ] || return 0
  [ -n "$(find "${ROOT}/server" "${ROOT}/src" "${ROOT}/public" "${ROOT}/index.html" -newer "$stamp" -type f -print -quit 2>/dev/null)" ]
}

ensure_server() {
  if server_up; then
    echo "✓ servidor já rodando em ${URL}"
    return 0
  fi
  cd "$ROOT" || exit 1
  if needs_build; then
    echo "… compilando a versão web (log: ${LOG_DIR}/build.log)"
    if ! npm run build:web >"${LOG_DIR}/build.log" 2>&1; then
      echo "✗ falha no build — veja ${LOG_DIR}/build.log" >&2
      exit 1
    fi
  fi
  echo "… subindo o servidor (log: ${LOG_DIR}/server.log)"
  nohup node "${ROOT}/dist-server/main.js" >>"${LOG_DIR}/server.log" 2>&1 &
  echo $! >"$PID_FILE"
  for _ in $(seq 1 40); do
    server_up && break
    sleep 0.25
  done
  if ! server_up; then
    echo "✗ o servidor não respondeu — veja ${LOG_DIR}/server.log" >&2
    exit 1
  fi
  echo "✓ servidor rodando em ${URL}"
}
