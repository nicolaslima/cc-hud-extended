#!/usr/bin/env bash
#
# cc-hud-extended — Interactive install script
# https://github.com/nicolaslima/cc-hud-extended
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nicolaslima/cc-hud-extended/main/install.sh | bash
#   # or
#   bash install.sh
#
set -euo pipefail

REPO="nicolaslima/cc-hud-extended"
INSTALL_DIR="${CC_HUD_DIR:-$HOME/.local/share/cc-hud-extended}"
CONFIG_DIR="${CC_HUD_CONFIG_DIR:-$HOME/.config/cc-hud-extended}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${BLUE}ℹ${RESET} $*"; }
ok()    { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
err()   { echo -e "${RED}✗${RESET} $*" >&2; }

# --- Prompt helpers ---
prompt_yesno() {
  local question="$1"
  local default="${2:-y}"
  local options
  if [ "$default" = "y" ]; then
    options="[Y/n]"
  else
    options="[y/N]"
  fi
  echo -e "${CYAN}?${RESET} ${question} ${options}"
  read -rp "  " answer
  answer="${answer:-$default}"
  case "$answer" in
    [yY][eE][sS]|[yY]*) return 0 ;;
    *) return 1 ;;
  esac
}

prompt_choice() {
  local question="$1"
  shift
  local default_choice="$1"
  shift
  echo -e "${CYAN}?${RESET} ${question}"
  local i=1
  for opt in "$@"; do
    if [ "$i" = "$default_choice" ]; then
      echo -e "  ${BOLD}${i}.*${RESET} ${opt}"
    else
      echo -e "  ${DIM}${i}.${RESET} ${opt}"
    fi
    i=$((i + 1))
  done
  read -rp "  Choose [1-$((i-1))]: " choice
  choice="${choice:-$default_choice}"
  echo "$choice"
}

# --- Check prerequisites ---
command -v node >/dev/null 2>&1 || { err "Node.js is required but not found."; exit 1; }
ok "Node.js found: $(node --version)"

# --- Step 1: Download ---
info "Checking latest release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST" ]; then
  warn "No GitHub release found. Installing from main branch..."
  LATEST="main"
  DOWNLOAD_URL="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
else
  info "Latest version: $LATEST"
  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST/cc-hud-extended.tar.gz"
fi

info "Installing cc-hud-extended $LATEST to $INSTALL_DIR..."

mkdir -p "$INSTALL_DIR"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

if curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_DIR/cc-hud-extended.tar.gz" 2>/dev/null; then
  tar -xzf "$TEMP_DIR/cc-hud-extended.tar.gz" -C "$TEMP_DIR"
  EXTRACTED=$(find "$TEMP_DIR" -maxdepth 1 -type d ! -path "$TEMP_DIR" | head -1)
  if [ -n "$EXTRACTED" ]; then
    if [ -d "$EXTRACTED/dist" ]; then
      cp -r "$EXTRACTED/dist/"* "$INSTALL_DIR/"
    else
      warn "Pre-built dist not found. Building from source..."
      if [ -f "$EXTRACTED/package.json" ]; then
        (cd "$EXTRACTED" && npm install --production=false 2>/dev/null && npx tsc 2>/dev/null)
        cp -r "$EXTRACTED/dist/"* "$INSTALL_DIR/"
      else
        err "Could not find or build dist/. Aborting."
        exit 1
      fi
    fi
  fi
else
  err "Failed to download release. Check your internet connection."
  exit 1
fi

if [ ! -f "$INSTALL_DIR/index.js" ]; then
  err "Installation failed — index.js not found in $INSTALL_DIR"
  exit 1
fi

ok "Files installed to $INSTALL_DIR"

# --- Step 2: Interactive configuration ---
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Configuration${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo ""

# Line enable/disable
echo -e "${BOLD}Which lines should be enabled?${RESET}"
echo ""

GSD_ENABLED=y
GSD_DETAIL_ENABLED=y
MEM_ENABLED=y
SYS_ENABLED=y

if prompt_yesno "  GSD line — project phase, status, task, context?" "y"; then
  GSD_ENABLED=y
else
  GSD_ENABLED=n
fi

if [ "$GSD_ENABLED" = "y" ]; then
  if prompt_yesno "  GSD detail line — mode, blockers, todos, phase progress, activity, updates?" "y"; then
    GSD_DETAIL_ENABLED=y
  else
    GSD_DETAIL_ENABLED=n
  fi
else
  GSD_DETAIL_ENABLED=n
fi

if prompt_yesno "  Memory line — claude-mem observations and sessions?" "y"; then
  MEM_ENABLED=y
else
  MEM_ENABLED=n
fi

if prompt_yesno "  System line — memory, CPU, disk usage?" "y"; then
  SYS_ENABLED=y
else
  SYS_ENABLED=n
fi

# GSD primary components
GSD_SHOW_PHASE=true
GSD_SHOW_PLAN=true
GSD_SHOW_PERCENT=true
GSD_SHOW_STATUS=true
GSD_SHOW_TASK=true
GSD_SHOW_CONTEXT=true

if [ "$GSD_ENABLED" = "y" ]; then
  echo ""
  echo -e "${BOLD}GSD line components (primary status):${RESET}"
  echo -e "  ${DIM}Core project position and action data.${RESET}"
  echo ""

  if prompt_yesno "  Phase (e.g. \"2 of 5 (Foundation)\")" "y"; then GSD_SHOW_PHASE=true; else GSD_SHOW_PHASE=false; fi
  if prompt_yesno "  Plan progress (e.g. \"plan 3/8\")" "y"; then GSD_SHOW_PLAN=true; else GSD_SHOW_PLAN=false; fi
  if prompt_yesno "  Percent complete (e.g. \"38%\")" "y"; then GSD_SHOW_PERCENT=true; else GSD_SHOW_PERCENT=false; fi
  if prompt_yesno "  Status (e.g. \"in progress\", \"blocked\")" "y"; then GSD_SHOW_STATUS=true; else GSD_SHOW_STATUS=false; fi
  if prompt_yesno "  Current task (from Claude Code todos)" "y"; then GSD_SHOW_TASK=true; else GSD_SHOW_TASK=false; fi
  if prompt_yesno "  Context usage bar (e.g. \"█████░░░░░ 30%\")" "y"; then GSD_SHOW_CONTEXT=true; else GSD_SHOW_CONTEXT=false; fi
fi

# GSD detail components
GSD_DETAIL_SHOW_MODE=true
GSD_DETAIL_SHOW_BLOCKERS=true
GSD_DETAIL_SHOW_PENDING_TODOS=true
GSD_DETAIL_SHOW_PHASE_PROGRESS=true
GSD_DETAIL_SHOW_LAST_ACTIVITY=true
GSD_DETAIL_SHOW_UPDATES=true

if [ "$GSD_DETAIL_ENABLED" = "y" ]; then
  echo ""
  echo -e "${BOLD}GSD detail line components (supplementary context):${RESET}"
  echo -e "  ${DIM}Additional project health and progress data.${RESET}"
  echo ""

  if prompt_yesno "  Mode (e.g. \"interactive\", \"autonomous\")" "y"; then GSD_DETAIL_SHOW_MODE=true; else GSD_DETAIL_SHOW_MODE=false; fi
  if prompt_yesno "  Blockers count (e.g. \"2 blocked\")" "y"; then GSD_DETAIL_SHOW_BLOCKERS=true; else GSD_DETAIL_SHOW_BLOCKERS=false; fi
  if prompt_yesno "  Pending todos count (e.g. \"3 todos\")" "y"; then GSD_DETAIL_SHOW_PENDING_TODOS=true; else GSD_DETAIL_SHOW_PENDING_TODOS=false; fi
  if prompt_yesno "  Phase progress bar (e.g. \"▓▓▓▓░░░░░░ 2/5\")" "y"; then GSD_DETAIL_SHOW_PHASE_PROGRESS=true; else GSD_DETAIL_SHOW_PHASE_PROGRESS=false; fi
  if prompt_yesno "  Last activity time (e.g. \"3h\")" "y"; then GSD_DETAIL_SHOW_LAST_ACTIVITY=true; else GSD_DETAIL_SHOW_LAST_ACTIVITY=false; fi
  if prompt_yesno "  GSD update warnings (⬆ update, ⚠ stale)" "y"; then GSD_DETAIL_SHOW_UPDATES=true; else GSD_DETAIL_SHOW_UPDATES=false; fi
fi

# Line order
echo ""
echo -e "${BOLD}Line display order:${RESET}"
echo -e "  ${DIM}Which line should appear first?${RESET}"
echo ""

LINE_ORDER=""
if [ "$GSD_ENABLED" = "y" ] && [ "$GSD_DETAIL_ENABLED" = "y" ] && [ "$MEM_ENABLED" = "y" ] && [ "$SYS_ENABLED" = "y" ]; then
  CHOICE=$(prompt_choice "Line order:" "1" "gsd → gsd-detail → mem → system" "mem → gsd → gsd-detail → system" "system → gsd → gsd-detail → mem")
  case "$CHOICE" in
    1) LINE_ORDER='"gsd", "gsd-detail", "mem", "system"' ;;
    2) LINE_ORDER='"mem", "gsd", "gsd-detail", "system"' ;;
    3) LINE_ORDER='"system", "gsd", "gsd-detail", "mem"' ;;
    *) LINE_ORDER='"gsd", "gsd-detail", "mem", "system"' ;;
  esac
else
  # Build order from enabled lines
  ORDER_PARTS=""
  if [ "$GSD_ENABLED" = "y" ]; then ORDER_PARTS="${ORDER_PARTS}\"gsd\", "; fi
  if [ "$GSD_DETAIL_ENABLED" = "y" ]; then ORDER_PARTS="${ORDER_PARTS}\"gsd-detail\", "; fi
  if [ "$MEM_ENABLED" = "y" ]; then ORDER_PARTS="${ORDER_PARTS}\"mem\", "; fi
  if [ "$SYS_ENABLED" = "y" ]; then ORDER_PARTS="${ORDER_PARTS}\"system\", "; fi
  LINE_ORDER=$(echo "$ORDER_PARTS" | sed 's/, $//')
fi

# --- Step 3: Generate config ---
mkdir -p "$CONFIG_DIR/lines"

# Build the JSON config
GSD_BLOCK=""
if [ "$GSD_ENABLED" = "y" ]; then
  GSD_BLOCK=$(cat <<GSDJSON
    "gsd": {
      "enabled": true,
      "label": "gsd",
      "colors": { "label": "#416a63", "executing": "#517243", "warning": "#c0d18c", "critical": "#af7c84" },
      "showPhase": $GSD_SHOW_PHASE,
      "showPlan": $GSD_SHOW_PLAN,
      "showPercent": $GSD_SHOW_PERCENT,
      "showStatus": $GSD_SHOW_STATUS,
      "showTask": $GSD_SHOW_TASK,
      "showContext": $GSD_SHOW_CONTEXT
    }
GSDJSON
)
fi

GSD_DETAIL_BLOCK=""
if [ "$GSD_DETAIL_ENABLED" = "y" ]; then
  GSD_DETAIL_BLOCK=$(cat <<GSDDETAILJSON
    "gsd-detail": {
      "enabled": true,
      "label": "gsd",
      "colors": { "label": "#416a63", "executing": "#517243", "warning": "#c0d18c", "critical": "#af7c84" },
      "showMode": $GSD_DETAIL_SHOW_MODE,
      "showBlockers": $GSD_DETAIL_SHOW_BLOCKERS,
      "showPendingTodos": $GSD_DETAIL_SHOW_PENDING_TODOS,
      "showPhaseProgress": $GSD_DETAIL_SHOW_PHASE_PROGRESS,
      "showLastActivity": $GSD_DETAIL_SHOW_LAST_ACTIVITY,
      "showUpdates": $GSD_DETAIL_SHOW_UPDATES
    }
GSDDETAILJSON
)
fi

MEM_BLOCK=""
if [ "$MEM_ENABLED" = "y" ]; then
  MEM_BLOCK=$(cat <<MEMJSON
    "mem": {
      "enabled": true,
      "label": "mem",
      "colors": { "label": "#416a63", "ok": "#416a63", "warning": "#c0d18c", "critical": "#af7c84" },
      "showProject": true, "showObservations": true, "showPrompts": true,
      "showSessions": true, "showLastActivity": true, "showState": true
    }
MEMJSON
)
fi

SYS_BLOCK=""
if [ "$SYS_ENABLED" = "y" ]; then
  SYS_BLOCK=$(cat <<SYSJSON
    "system": {
      "enabled": true,
      "label": "sys",
      "colors": { "label": "#416a63", "warning": "#c0d18c", "critical": "#af7c84" },
      "showMemory": true, "showCpu": true, "showDisk": true
    }
SYSJSON
)
fi

# Assemble lines object
LINES_CONTENT=""
SEPARATOR=","
if [ "$GSD_ENABLED" = "y" ]; then
  LINES_CONTENT="${GSD_BLOCK}"
fi
if [ "$GSD_DETAIL_ENABLED" = "y" ]; then
  if [ -n "$LINES_CONTENT" ]; then
    LINES_CONTENT="${LINES_CONTENT}${SEPARATOR}"
  fi
  LINES_CONTENT="${LINES_CONTENT}${GSD_DETAIL_BLOCK}"
fi
if [ "$MEM_ENABLED" = "y" ]; then
  if [ -n "$LINES_CONTENT" ]; then
    LINES_CONTENT="${LINES_CONTENT}${SEPARATOR}"
  fi
  LINES_CONTENT="${LINES_CONTENT}${MEM_BLOCK}"
fi
if [ "$SYS_ENABLED" = "y" ]; then
  if [ -n "$LINES_CONTENT" ]; then
    LINES_CONTENT="${LINES_CONTENT}${SEPARATOR}"
  fi
  LINES_CONTENT="${LINES_CONTENT}${SYS_BLOCK}"
fi

cat > "$CONFIG_DIR/config.json" << CONFEOF
{
  "separator": " • ",
  "colors": { "secondary": "dim" },
  "baseHud": {
    "enabled": true,
    "filterPhaseLine": true,
    "filterMemoryLine": true,
    "separatorReplace": " • "
  },
  "lines": {
    $LINES_CONTENT
  },
  "lineOrder": [$LINE_ORDER]
}
CONFEOF

ok "Config created at $CONFIG_DIR/config.json"

# --- Step 4: Configure Claude Code statusline ---
info "Configuring Claude Code statusline..."

NODE_PATH=$(command -v node 2>/dev/null || echo "node")
STATUSLINE_CMD="${NODE_PATH} \"$INSTALL_DIR/index.js\""

if [ -f "$SETTINGS_FILE" ]; then
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup.$(date +%Y%m%d%H%M%S)"

  if grep -q '"statusLine"' "$SETTINGS_FILE" 2>/dev/null; then
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      s._statusLineBackup = s.statusLine || null;
      s.statusLine = { type: 'command', command: $JSON.stringify($STATUSLINE_CMD) };
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(s, null, 2) + '\n');
    " 2>/dev/null || {
      err "Failed to update settings.json."
      echo ""
      echo "  Add this to your ~/.claude/settings.json:"
      echo ""
      echo "  \"statusLine\": {"
      echo "    \"type\": \"command\","
      echo "    \"command\": \"$STATUSLINE_CMD\""
      echo "  }"
    }
  else
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      s._statusLineBackup = null;
      s.statusLine = { type: 'command', command: $JSON.stringify($STATUSLINE_CMD) };
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(s, null, 2) + '\n');
    " 2>/dev/null || {
      err "Failed to update settings.json."
    }
  fi
else
  mkdir -p "$CLAUDE_DIR"
  cat > "$SETTINGS_FILE" << EOF
{
  "statusLine": {
    "type": "command",
    "command": "$STATUSLINE_CMD"
  }
}
EOF
fi

ok "Claude Code statusline configured"

# --- Step 5: Verify ---
info "Verifying installation..."
if echo '{}' | node "$INSTALL_DIR/index.js" 2>/dev/null | grep -q "cc-hud-extended"; then
  ok "cc-hud-extended is working!"
else
  echo '{}' | node "$INSTALL_DIR/index.js" 2>/dev/null | head -1 | grep -q . && \
    ok "cc-hud-extended is working!" || \
    warn "Could not verify — please restart Claude Code and check manually"
fi

# --- Summary ---
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}  cc-hud-extended $LATEST installed successfully!${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${DIM}Install dir:${RESET}    $INSTALL_DIR"
echo -e "  ${DIM}Config:${RESET}         $CONFIG_DIR/config.json"
echo -e "  ${DIM}Custom lines:${RESET}   $CONFIG_DIR/lines/"
echo -e "  ${DIM}Settings:${RESET}       $SETTINGS_FILE"
echo ""
echo -e "  ${BOLD}Configuration:${RESET}"
echo -e "  ${DIM}GSD line:${RESET}       $([ "$GSD_ENABLED" = "y" ] && echo "enabled" || echo "disabled")"
echo -e "  ${DIM}GSD detail line:${RESET} $([ "$GSD_DETAIL_ENABLED" = "y" ] && echo "enabled" || echo "disabled")"
echo -e "  ${DIM}Memory line:${RESET}     $([ "$MEM_ENABLED" = "y" ] && echo "enabled" || echo "disabled")"
echo -e "  ${DIM}System line:${RESET}     $([ "$SYS_ENABLED" = "y" ] && echo "enabled" || echo "disabled")"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  1. ${BOLD}Restart Claude Code${RESET} — quit and run 'claude' again"
echo -e "  2. The HUD should appear below your input field"
echo -e "  3. Customize: edit ${DIM}$CONFIG_DIR/config.json${RESET}"
echo -e "  4. Add custom lines: drop .js files in ${DIM}$CONFIG_DIR/lines/${RESET}"
echo ""
echo -e "  ${DIM}Uninstall:${RESET} curl -fsSL https://raw.githubusercontent.com/$REPO/main/uninstall.sh | bash"
echo ""