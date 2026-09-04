#!/usr/bin/env bash
# macOS/Linux counterpart of scripts/start-research-os.ps1: serves the
# ResearchOS production Vault through Quartz on 127.0.0.1:8080. Used directly
# by the com.researchos.quartz LaunchAgent (core repo: scripts/manage-launchd.sh)
# and by scripts/manage-research-os.sh. (The core repository's
# scripts/start-research-os.sh is the whole-system launcher; this one is the
# Quartz process itself.)
#
# Environment: RESEARCHOS_ROOT (alias RESEARCH_OS_ROOT; default: the
# <ROOT>/repos/quartz layout around this checkout, else ~/ResearchOS),
# RESEARCH_OS_CODE_ROOT (default <RESEARCHOS_ROOT>/repos/core),
# RESEARCHOS_NODE, LLM_WIKI_LOCAL_ROOT, RESEARCHOS_LOG_DIR. RESEARCH_OS_* keys
# found in the HTTP MCP config.json are imported first, exactly like the
# PowerShell launcher.
set -euo pipefail

QUARTZ_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [ "$(uname -s)" = "Darwin" ]; then
  LOCAL_ROOT="${LLM_WIKI_LOCAL_ROOT:-$HOME/Library/Application Support/PersonalLLMWiki}"
  LOG_DIR="${RESEARCHOS_LOG_DIR:-$HOME/Library/Logs/ResearchOS}"
else
  LOCAL_ROOT="${LLM_WIKI_LOCAL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/PersonalLLMWiki}"
  LOG_DIR="${RESEARCHOS_LOG_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/ResearchOS/logs}"
fi
EVENT_LOG="$LOG_DIR/quartz-events.log"
HTTP_MCP_CONFIG="${LLM_WIKI_HTTP_MCP_CONFIG_DIR:-$LOCAL_ROOT/http-mcp}/config.json"
HOST_ADDRESS="127.0.0.1"
PORT=8080

mkdir -p "$LOG_DIR"

log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') [${2:-INFO}] $1"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$EVENT_LOG"
}
die() { log "$1" ERROR >&2; exit 1; }

# Node.js discovery (same order as the core repo's lib/researchos-macos.sh):
# RESEARCHOS_NODE, PATH, Homebrew node@22/node, volta, fnm, nvm, distro node.
node_ok() { [ -x "$1" ] && "$1" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 5) ? 0 : 1)' >/dev/null 2>&1; }
find_node() {
  local candidate
  if [ -n "${RESEARCHOS_NODE:-}" ] && node_ok "$RESEARCHOS_NODE"; then printf '%s' "$RESEARCHOS_NODE"; return 0; fi
  if candidate="$(command -v node 2>/dev/null)" && node_ok "$candidate"; then printf '%s' "$candidate"; return 0; fi
  for candidate in /opt/homebrew/opt/node@22/bin/node /opt/homebrew/bin/node /usr/local/opt/node@22/bin/node /usr/local/bin/node \
      "$HOME/.volta/bin/node" "$HOME/.local/share/fnm/aliases/default/bin/node" "$HOME/.fnm/aliases/default/bin/node" \
      "${NVM_DIR:-$HOME/.nvm}"/versions/node/v22.*/bin/node "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node /usr/bin/node /snap/bin/node; do
    if node_ok "$candidate"; then printf '%s' "$candidate"; return 0; fi
  done
  return 1
}
NODE_BIN="$(find_node)" || die "Node.js 22.5 or newer was not found (RESEARCHOS_NODE, PATH, Homebrew, volta, fnm, nvm); run repos/core/scripts/bootstrap.sh"
case ":$PATH:" in *":$(dirname "$NODE_BIN"):"*) ;; *) export PATH="$(dirname "$NODE_BIN"):$PATH" ;; esac

json_field() {
  node -e '
    const fs = require("node:fs");
    const [file, key] = process.argv.slice(1);
    const json = JSON.parse(fs.readFileSync(file === "-" ? 0 : file, "utf8"));
    const value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), json);
    if (value === undefined || value === null || value === "") process.exit(3);
    process.stdout.write(String(value));
  ' "$1" "$2"
}

if [ -f "$HTTP_MCP_CONFIG" ]; then
  for name in RESEARCH_OS_MODE RESEARCHOS_ROOT RESEARCH_OS_ROOT RESEARCH_OS_VAULT_ROOT RESEARCH_OS_RUNTIME_ROOT RESEARCH_OS_DATA_ROOT RESEARCH_OS_HOME RESEARCH_OS_CODE_ROOT; do
    if value="$(json_field "$HTTP_MCP_CONFIG" "$name" 2>/dev/null)"; then
      export "$name=$value"
    fi
  done
fi
if [ "${RESEARCH_OS_MODE:-}" = "greenfield" ]; then
  unset LLM_WIKI_ROOT LLM_WIKI_DB_PATH RESEARCH_DB_PATH RESEARCH_OS_ALLOW_CREATE_DATABASE
fi

# Root precedence: RESEARCHOS_ROOT > RESEARCH_OS_ROOT > RESEARCH_OS_HOME >
# <ROOT>/repos/quartz layout > ~/ResearchOS (no fixed absolute path).
RESEARCHOS_ROOT="${RESEARCHOS_ROOT:-${RESEARCH_OS_ROOT:-${RESEARCH_OS_HOME:-}}}"
if [ -z "$RESEARCHOS_ROOT" ]; then
  if [ "$(basename "$(dirname "$QUARTZ_ROOT")")" = "repos" ]; then
    RESEARCHOS_ROOT="$(cd "$(dirname "$QUARTZ_ROOT")/.." && pwd -P)"
  else
    RESEARCHOS_ROOT="$HOME/ResearchOS"
  fi
fi
export RESEARCHOS_ROOT
export RESEARCH_OS_MODE="${RESEARCH_OS_MODE:-greenfield}"
CODE_ROOT="${RESEARCH_OS_CODE_ROOT:-$RESEARCHOS_ROOT/repos/core}"
RESOLVER="$CODE_ROOT/scripts/resolve-research-os-paths.mjs"
[ -f "$RESOLVER" ] || die "ResearchOS path resolver not found: $RESOLVER"

RESOLVED="$(node "$RESOLVER" --require-vault)" || die "ResearchOS path resolution failed"
WIKI_PATH="$(printf '%s' "$RESOLVED" | json_field - quartzContentRoot 2>/dev/null || true)"
if [ -z "$WIKI_PATH" ]; then
  WIKI_PATH="$(printf '%s' "$RESOLVED" | json_field - vaultRoot 2>/dev/null || true)"
fi
[ -n "$WIKI_PATH" ] && [ -d "$WIKI_PATH" ] || die "Resolved Quartz content root is missing: $WIKI_PATH"
MODE="$(printf '%s' "$RESOLVED" | json_field - mode 2>/dev/null || printf unknown)"

is_research_os_process() {
  local command
  command="$(ps -o command= -p "$1" 2>/dev/null || true)"
  case "$command" in
    *"bootstrap-cli.mjs build --serve"*|*start-research-os.sh*) return 0 ;;
    *) return 1 ;;
  esac
}

LISTENERS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u || true)"
if [ -n "$LISTENERS" ]; then
  ALL_OURS=1
  for pid in $LISTENERS; do
    is_research_os_process "$pid" || ALL_OURS=0
  done
  if [ "$ALL_OURS" -eq 1 ]; then
    log "Research OS already running on port $PORT (PID: $(printf '%s' "$LISTENERS" | tr '\n' ' '))."
    exit 0
  fi
  die "Port $PORT is already in use by PID(s): $(printf '%s' "$LISTENERS" | tr '\n' ' '). Start aborted."
fi

QUARTZ_CLI="$QUARTZ_ROOT/quartz/bootstrap-cli.mjs"
[ -f "$QUARTZ_CLI" ] || die "Quartz CLI not found: $QUARTZ_CLI"

log "Starting Research OS on http://$HOST_ADDRESS:$PORT mode=$MODE vault=$WIKI_PATH"
cd "$QUARTZ_ROOT"
exec node "$QUARTZ_CLI" build --serve -d "$WIKI_PATH" --host "$HOST_ADDRESS" --port "$PORT"
