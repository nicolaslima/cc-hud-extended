#!/usr/bin/env bash
#
# cc-hud-extended — Install script
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
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${BLUE}ℹ${RESET} $*"; }
ok()    { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
err()   { echo -e "${RED}✗${RESET} $*" >&2; }

# --- Check prerequisites ---
command -v node >/dev/null 2>&1 || { err "Node.js is required but not found."; exit 1; }
ok "Node.js found: $(node --version)"

# --- Detect latest release ---
info "Checking latest release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST" ]; then
  # Fallback: try main branch (for development)
  warn "No GitHub release found. Installing from main branch..."
  LATEST="main"
  DOWNLOAD_URL="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
else
  info "Latest version: $LATEST"
  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST/cc-hud-extended.tar.gz"
fi

# --- Download and install ---
info "Installing cc-hud-extended $LATEST to $INSTALL_DIR..."

mkdir -p "$INSTALL_DIR"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

if curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_DIR/cc-hud-extended.tar.gz" 2>/dev/null; then
  tar -xzf "$TEMP_DIR/cc-hud-extended.tar.gz" -C "$TEMP_DIR"
  # Find the extracted directory (may have a prefix)
  EXTRACTED=$(find "$TEMP_DIR" -maxdepth 1 -type d ! -path "$TEMP_DIR" | head -1)
  if [ -n "$EXTRACTED" ]; then
    # Copy dist/ files
    if [ -d "$EXTRACTED/dist" ]; then
      cp -r "$EXTRACTED/dist/"* "$INSTALL_DIR/"
    else
      # From source archive — need to build
      warn "Pre-built dist not found in archive. Building from source..."
      if [ -d "$EXTRACTED/package.json" ]; then
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

# Verify installation
if [ ! -f "$INSTALL_DIR/index.js" ]; then
  err "Installation failed — index.js not found in $INSTALL_DIR"
  exit 1
fi

ok "Files installed to $INSTALL_DIR"

# --- Create default config ---
mkdir -p "$CONFIG_DIR/lines"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  cat > "$CONFIG_DIR/config.json" << 'CONFIGEOF'
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
    "gsd": {
      "enabled": true,
      "label": "gsd",
      "colors": { "label": "#416a63", "executing": "#517243", "warning": "#c0d18c", "critical": "#af7c84" },
      "showPhase": true, "showPlan": true, "showPercent": true,
      "showStatus": true, "showTask": true, "showContext": true, "showUpdates": true
    },
    "mem": {
      "enabled": true,
      "label": "mem",
      "colors": { "label": "#416a63", "ok": "#416a63", "warning": "#c0d18c", "critical": "#af7c84" },
      "showProject": true, "showObservations": true, "showPrompts": true,
      "showSessions": true, "showLastActivity": true, "showState": true
    },
    "system": {
      "enabled": true,
      "label": "sys",
      "colors": { "label": "#416a63", "warning": "#c0d18c", "critical": "#af7c84" },
      "showMemory": true, "showCpu": true, "showDisk": true
    }
  },
  "lineOrder": ["gsd", "mem", "system"]
}
CONFIGEOF
  ok "Default config created at $CONFIG_DIR/config.json"
else
  info "Config already exists at $CONFIG_DIR/config.json — keeping it"
fi

# --- Configure Claude Code statusline ---
info "Configuring Claude Code statusline..."

# Detect Node.js path
NODE_PATH=$(command -v node 2>/dev/null || echo "node")

# Generate the statusline command
STATUSLINE_CMD="${NODE_PATH} \"$INSTALL_DIR/index.js\""

# Read existing settings or create new
if [ -f "$SETTINGS_FILE" ]; then
  # Backup existing settings
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup.$(date +%Y%m%d%H%M%S)"

  # Check if statusLine already exists
  if grep -q '"statusLine"' "$SETTINGS_FILE" 2>/dev/null; then
    # Update existing statusLine using node
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      s._statusLineBackup = s.statusLine || null;
      s.statusLine = { type: 'command', command: $JSON.stringify($STATUSLINE_CMD) };
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(s, null, 2) + '\n');
    " 2>/dev/null || {
      err "Failed to update settings.json. You may need to update it manually."
      echo ""
      echo "Add this to your ~/.claude/settings.json:"
      echo ""
      echo "  \"statusLine\": {"
      echo "    \"type\": \"command\","
      echo "    \"command\": \"$STATUSLINE_CMD\""
      echo "  }"
    }
  else
    # Append statusLine to existing settings
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
  # Create new settings file
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

# --- Verify ---
info "Verifying installation..."
if echo '{}' | node "$INSTALL_DIR/index.js" 2>/dev/null | grep -q "cc-hud-extended"; then
  ok "cc-hud-extended is working!"
else
  # It may output HUD lines instead of the init message
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
echo -e "  ${DIM}Install dir:${RESET}  $INSTALL_DIR"
echo -e "  ${DIM}Config dir:${RESET}   $CONFIG_DIR"
echo -e "  ${DIM}Settings:${RESET}     $SETTINGS_FILE"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  1. ${BOLD}Restart Claude Code${RESET} — quit and run 'claude' again"
echo -e "  2. The HUD should appear below your input field"
echo -e "  3. Customize: edit ${DIM}$CONFIG_DIR/config.json${RESET}"
echo -e "  4. Add custom lines: drop .js files in ${DIM}$CONFIG_DIR/lines/${RESET}"
echo ""
echo -e "  ${DIM}Uninstall:${RESET} curl -fsSL https://raw.githubusercontent.com/$REPO/main/uninstall.sh | bash"
echo ""