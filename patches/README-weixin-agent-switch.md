# Weixin Agent Switch Patch

Date: 2026-03-23

Purpose:
Add per-WeChat-conversation temporary agent switching to the `openclaw-weixin` plugin.

Modified files:
- `/root/.openclaw/extensions/openclaw-weixin/src/messaging/process-message.ts`
- `/root/.openclaw/extensions/openclaw-weixin/src/messaging/agent-switch.ts`

Feature summary:
- `切换智能体`: show menu
- reply `1..7` or `agent id/name`: switch current WeChat conversation
- `当前智能体`: show current selection
- `恢复主助手`: reset to default `main`
- override scope: current WeChat conversation only

Persistence:
- selection store path:
  `/root/.openclaw/channels/openclaw-weixin/agent-overrides.json`

Reapply steps after plugin upgrade:
1. Verify plugin source exists:
   `ls /root/.openclaw/extensions/openclaw-weixin/src/messaging`
2. Reapply patch:
   `bash /root/.openclaw/workspace/scripts/reapply-weixin-agent-switch.sh`
3. Restart gateway:
   `systemctl restart openclaw-prod-gateway.service`
4. Verify:
   `bash /root/.openclaw/workspace/scripts/check-weixin-agent-switch.sh`

Operational note:
- Plugin upgrades or reinstalls can overwrite this customization.
- OpenClaw core upgrades do not necessarily overwrite it, but plugin reinstall usually will.
