# web-openclaw

`web-openclaw` is a maintenance repository for custom OpenClaw web and channel-side enhancements, starting with the WeChat agent-switch capability.

## What this repository is for

This repo is used to preserve, document, and reapply custom OpenClaw behavior that is not part of the upstream default installation.

Current focus:
- WeChat per-conversation agent switching
- Patch-based recovery after plugin upgrades
- Operational documentation for preserving custom behavior
- A clean place to accumulate future web and channel customizations

## Current implemented feature

### WeChat temporary agent switch

Supported commands:
- `?????`
- `?????`
- `?????`
- reply with a number like `3`
- or reply with an agent name like `aji-coder`

Behavior:
- default route remains `main`
- selected agent is stored per WeChat conversation
- only the current WeChat conversation is affected
- other channels such as Discord or Telegram are not affected

## Repository structure

```text
web-openclaw/
?? customizations/
?  ?? openclaw-weixin/
?     ?? src/messaging/
?        ?? process-message.ts
?        ?? agent-switch.ts
?? docs/
?  ?? 2026-03-23-weixin-agent-switch-recovery.md
?  ?? PROJECT-STATUS.md
?  ?? WECHAT-COMMAND-SYSTEM-DRAFT.md
?? patches/
?  ?? README-weixin-agent-switch.md
?  ?? weixin-agent-switch.patch
?? scripts/
?  ?? check-weixin-agent-switch.sh
?  ?? reapply-weixin-agent-switch.sh
?? README.md
```

## Quick usage

### Reapply the WeChat customization after a plugin upgrade

```bash
bash /root/.openclaw/workspace/scripts/reapply-weixin-agent-switch.sh
systemctl restart openclaw-prod-gateway.service
bash /root/.openclaw/workspace/scripts/check-weixin-agent-switch.sh
```

### Working files on the server

- Plugin source:
  - `/root/.openclaw/extensions/openclaw-weixin/src/messaging/process-message.ts`
  - `/root/.openclaw/extensions/openclaw-weixin/src/messaging/agent-switch.ts`
- Runtime override state:
  - `/root/.openclaw/channels/openclaw-weixin/agent-overrides.json`

## Documentation

- Project status: `docs/PROJECT-STATUS.md`
- WeChat command design: `docs/WECHAT-COMMAND-SYSTEM-DRAFT.md`
- Recovery notes: `docs/2026-03-23-weixin-agent-switch-recovery.md`
- Patch notes: `patches/README-weixin-agent-switch.md`

## Suggested next steps

1. Add model-switch commands for WeChat sessions.
2. Add `????` to show current agent and model.
3. Add work modes such as `????` and `????`.
4. Add one-shot task delegation such as `?? coder: ...`.
5. Keep future changes in this repo as both source snapshots and patch files.
