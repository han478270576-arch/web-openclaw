#!/usr/bin/env bash
set -euo pipefail

BASE="/root/.openclaw/extensions/openclaw-weixin/src/messaging"
PROCESS="$BASE/process-message.ts"
SWITCH="$BASE/agent-switch.ts"
STORE="/root/.openclaw/channels/openclaw-weixin/agent-overrides.json"

fail=0

if [[ ! -f "$PROCESS" ]]; then
  echo "missing: $PROCESS"
  fail=1
fi

if [[ ! -f "$SWITCH" ]]; then
  echo "missing: $SWITCH"
  fail=1
fi

if [[ -f "$PROCESS" ]]; then
  grep -q 'handleAgentSwitchCommand' "$PROCESS" || { echo "process-message.ts missing handleAgentSwitchCommand hook"; fail=1; }
  grep -q 'applyAgentOverrideToRoute' "$PROCESS" || { echo "process-message.ts missing applyAgentOverrideToRoute hook"; fail=1; }
fi

if [[ -f "$SWITCH" ]]; then
  grep -q '切换智能体' "$SWITCH" || { echo "agent-switch.ts missing command definitions"; fail=1; }
  grep -q 'agent-overrides.json' "$SWITCH" || { echo "agent-switch.ts missing store path"; fail=1; }
fi

echo "state-file: $STORE"
if [[ -f "$STORE" ]]; then
  echo "state-file exists"
else
  echo "state-file not created yet (normal before first successful switch)"
fi

if [[ $fail -ne 0 ]]; then
  echo "CHECK FAILED"
  exit 1
fi

echo "CHECK OK"
