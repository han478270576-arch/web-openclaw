# Weixin Agent Switch Recovery Note

## What was customized
We added a lightweight command layer inside the `openclaw-weixin` plugin so that a WeChat DM can temporarily switch agents without changing global bindings.

## Commands
- `切换智能体`
- `当前智能体`
- `恢复主助手`
- reply with number like `3`
- or direct command like `切到 aji-coder`

## Behavior
- default route remains `main`
- the selected agent is stored per WeChat peer
- only the current WeChat conversation is affected
- other channels such as Discord or Telegram are not affected

## Files involved
- plugin source:
  - `/root/.openclaw/extensions/openclaw-weixin/src/messaging/process-message.ts`
  - `/root/.openclaw/extensions/openclaw-weixin/src/messaging/agent-switch.ts`
- state file:
  - `/root/.openclaw/channels/openclaw-weixin/agent-overrides.json`
- patch asset:
  - `/root/.openclaw/workspace/patches/weixin-agent-switch.patch`
- reapply helper:
  - `/root/.openclaw/workspace/scripts/reapply-weixin-agent-switch.sh`
- check helper:
  - `/root/.openclaw/workspace/scripts/check-weixin-agent-switch.sh`

## Why this can be lost
This customization lives in plugin source code. If the `openclaw-weixin` plugin is upgraded or reinstalled, the plugin directory may be replaced and the customization will disappear.

## How to recover
Run:
`bash /root/.openclaw/workspace/scripts/reapply-weixin-agent-switch.sh`

Then restart:
`systemctl restart openclaw-prod-gateway.service`

Then verify:
`bash /root/.openclaw/workspace/scripts/check-weixin-agent-switch.sh`
