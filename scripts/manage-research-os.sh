#!/usr/bin/env bash
# macOS/Linux counterpart of scripts/manage-research-os.ps1.
#
# Usage: scripts/manage-research-os.sh start|stop|status
#
# Prefers the com.researchos.quartz LaunchAgent (installed from the core
# repo with scripts/manage-launchd.sh install quartz). Without it (and on
# Linux), start runs scripts/start-research-os.sh as a background process for
# this session. `status` prints `Listening : True|False`, which
# mcp-server/quartz-maintenance.mjs parses before a maintenance window.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
START_SCRIPT="$SCRIPT_DIR/start-research-os.sh"
if [ "$(uname -s)" = "Darwin" ]; then
  LOCAL_ROOT="${LLM_WIKI_LOCAL_ROOT:-$HOME/Library/Application Support/PersonalLLMWiki}"
  LOG_DIR="${RESEARCHOS_LOG_DIR:-$HOME/Library/Logs/ResearchOS}"
else
  LOCAL_ROOT="${LLM_WIKI_LOCAL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/PersonalLLMWiki}"
  LOG_DIR="${RESEARCHOS_LOG_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/ResearchOS/logs}"
fi
PID_FILE="$LOCAL_ROOT/quartz/quartz.pid"
MANUAL_LOG="$LOG_DIR/quartz.manual.log"
LABEL="com.researchos.quartz"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT=8080

is_darwin() { [ "$(uname -s)" = "Darwin" ]; }
agent_installed() { [ -f "$PLIST" ]; }
agent_loaded() { launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; }
agent_pid() { launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | sed -n 's/^[[:space:]]*pid = \([0-9][0-9]*\).*/\1/p' | head -n 1; }

is_research_os_process() {
  local command
  command="$(ps -o command= -p "$1" 2>/dev/null || true)"
  case "$command" in
    *"bootstrap-cli.mjs build --serve"*|*start-research-os.sh*|*"ResearchOS/repos/quartz"*) return 0 ;;
    *) return 1 ;;
  esac
}

port_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
  elif command -v ss >/dev/null 2>&1; then
    ss -Hltnp "sport = :$PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u || true
  fi
}

research_os_pids() {
  local pid
  for pid in $(port_pids); do
    if is_research_os_process "$pid"; then
      printf '%s\n' "$pid"
    fi
  done
}

agent_state() {
  if ! is_darwin; then
    printf 'n/a'
  elif ! agent_installed; then
    printf 'Not installed'
  elif ! agent_loaded; then
    printf 'Installed, not loaded'
  elif [ -n "$(agent_pid)" ]; then
    printf 'Running (pid %s)' "$(agent_pid)"
  else
    printf 'Loaded, not running'
  fi
}

start_research_os() {
  local pids pid
  pids="$(research_os_pids)"
  if [ -n "$pids" ]; then
    printf 'Research OS is already running (PID: %s).\n' "$(printf '%s' "$pids" | tr '\n' ' ')"
    return 0
  fi
  if is_darwin && agent_installed; then
    if agent_loaded; then
      launchctl kickstart "gui/$(id -u)/$LABEL"
    else
      launchctl bootstrap "gui/$(id -u)" "$PLIST"
    fi
    printf 'Started LaunchAgent: %s\n' "$LABEL"
    return 0
  fi
  mkdir -p "$(dirname "$PID_FILE")" "$LOG_DIR"
  nohup /bin/bash "$START_SCRIPT" >>"$MANUAL_LOG" 2>&1 &
  pid=$!
  printf '%s\n' "$pid" >"$PID_FILE"
  printf 'Started Research OS in the background (PID: %s, log: %s).\n' "$pid" "$MANUAL_LOG"
}

stop_research_os() {
  local pids pid stopped=""
  if is_darwin && agent_installed && agent_loaded; then
    launchctl bootout "gui/$(id -u)/$LABEL"
    stopped="agent"
  fi
  pids="$(research_os_pids)"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
    stopped="$stopped $pid"
  done
  rm -f "$PID_FILE"
  if [ -n "$stopped" ]; then
    printf 'Stopped Research OS (%s).\n' "$(printf '%s' "$stopped" | sed 's/^ *//')"
  else
    printf 'Research OS is not running.\n'
  fi
}

status_research_os() {
  local pids listening="False" http="Not listening" latest
  pids="$(research_os_pids | tr '\n' ',' | sed 's/,$//')"
  if [ -n "$pids" ]; then
    listening="True"
    if code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$PORT/")"; then
      http="HTTP $code"
    else
      http="HTTP check failed"
    fi
  fi
  latest="$LOG_DIR/quartz.log"
  [ -f "$latest" ] || latest="$MANUAL_LOG"
  printf 'Listening     : %s\n' "$listening"
  printf 'ProcessId     : %s\n' "${pids:-}"
  printf 'HttpStatus    : %s\n' "$http"
  printf 'LaunchAgent   : %s\n' "$(agent_state)"
  printf 'LatestLog     : %s\n' "$latest"
}

case "${1:-}" in
  start|Start) start_research_os ;;
  stop|Stop) stop_research_os ;;
  status|Status) status_research_os ;;
  *) printf 'Usage: %s start|stop|status\n' "$0" >&2; exit 1 ;;
esac
