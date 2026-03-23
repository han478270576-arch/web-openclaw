#!/usr/bin/env bash
set -euo pipefail

BASE="/root/.openclaw/extensions/openclaw-weixin/src/messaging"
PATCH="/root/.openclaw/workspace/patches/weixin-agent-switch.patch"
PROCESS="$BASE/process-message.ts"
SWITCH="$BASE/agent-switch.ts"
BACKUP_TS="$(date +%Y%m%d-%H%M%S)"

if [[ ! -f "$PATCH" ]]; then
  echo "patch not found: $PATCH"
  exit 1
fi

if [[ ! -f "$PROCESS" ]]; then
  echo "missing target file: $PROCESS"
  exit 1
fi

mkdir -p /root/.openclaw/workspace/patches
cp "$PROCESS" "$PROCESS.reapply.$BACKUP_TS.bak"

patch -p0 < "$PATCH"

if [[ ! -f "$SWITCH" ]]; then
  echo "reapply failed: missing $SWITCH after patch"
  exit 1
fi

echo "patch reapplied"
echo "restart with: systemctl restart openclaw-prod-gateway.service"
