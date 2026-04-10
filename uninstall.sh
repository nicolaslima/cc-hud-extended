#!/usr/bin/env bash
#
# cc-hud-extended — Uninstall script
# https://github.com/nicolaslima/cc-hud-extended
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

# --- Confirm ---
echo -e "${YELLOW}This will remove cc-hud-extended and restore your previous statusline.${RESET}"
echo ""
read -rp "Continue? [y/N] " confirm
if [[ "$confirm" != [yY]* ]]; then
  echo "Cancelled."
  exit 0
fi

# --- Restore previous statusline ---
if [ -f "$SETTINGS_FILE" ]; then
  # Check for backup
  HAS_BACKUP=$(node -e "
    const s = JSON.parse(require('fs').readFileSync('$SETTINGS_FILE', 'utf8'));
    process.stdout.write(s._statusLineBackup ? 'yes' : 'no');
  " 2>/dev/null || echo "no")

  if [ "$HAS_BACKUP" = "yes" ]; then
    info "Restoring previous statusline..."
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      if (s._statusLineBackup) {
        s.statusLine = s._statusLineBackup;
      } else {
        delete s.statusLine;
      }
      delete s._statusLineBackup;
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(s, null, 2) + '\n');
    " 2>/dev/null && ok "Previous statusline restored" || warn "Could not restore statusline automatically"
  else
    info "Removing statusline configuration..."
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      delete s.statusLine;
      delete s._statusLineBackup;
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(s, null, 2) + '\n');
    " 2>/dev/null && ok "Statusline removed from settings" || warn "Could not update settings.json"
  fi
fi

# --- Remove installed files ---
if [ -d "$INSTALL_DIR" ]; then
  info "Removing $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  ok "Install directory removed"
else
  warn "Install directory not found: $INSTALL_DIR"
fi

# --- Ask about config ---
if [ -d "$CONFIG_DIR" ]; then
  echo ""
  read -rp "Also remove config at $CONFIG_DIR? [y/N] " remove_config
  if [[ "$remove_config" == [yY]* ]]; then
    rm -rf "$CONFIG_DIR"
    ok "Config directory removed"
  else
    info "Config directory kept at $CONFIG_DIR"
  fi
fi

# --- Clean up backup files ---
BACKUPS=$(ls "$CLAUDE_DIR/settings.json.backup."* 2>/dev/null || true)
if [ -n "$BACKUPS" ]; then
  echo ""
  read -rp "Remove settings.json backup files? [y/N] " remove_backups
  if [[ "$remove_backups" == [yY]* ]]; then
    rm -f "$CLAUDE_DIR/settings.json.backup."*
    ok "Backup files removed"
  fi
fi

echo ""
ok "cc-hud-extended has been uninstalled."
echo -e "  ${DIM}Restart Claude Code for changes to take effect.${RESET}"
echo ""