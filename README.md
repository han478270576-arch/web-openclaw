# web-openclaw

`web-openclaw` is a maintenance repository for custom OpenClaw web and channel-side enhancements, starting with the WeChat control command suite.

## What this repository is for

This repo is used to preserve, document, and reapply custom OpenClaw behavior that is not part of the upstream default installation.

Current focus:
- WeChat per-conversation agent switching
- WeChat command suite for model, mode, session, and one-shot delegation control
- Patch-based recovery after plugin upgrades
- Operational documentation for preserving custom behavior

## Current WeChat commands

- `??`
- `????`
- `?????`
- `????`
- `????`
- `???`
- `????`
- `?? coder: ...`
- `?? ops: ...`
- `?? research: ...`

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
