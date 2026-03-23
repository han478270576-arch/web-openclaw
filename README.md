# web-openclaw

A snapshot repo for the current OpenClaw web and WeChat-side customizations.

## Included now

- WeChat per-conversation agent switch feature
- Recovery patch for plugin upgrades
- Check and reapply scripts
- Current customized `openclaw-weixin` messaging source
- Operational notes for restoring the customization

## Current WeChat commands

- `?????`
- `?????`
- `?????`
- Reply with a number like `3`
- Or reply with an agent name like `aji-coder`

## Included files

- `patches/weixin-agent-switch.patch`
- `patches/README-weixin-agent-switch.md`
- `scripts/check-weixin-agent-switch.sh`
- `scripts/reapply-weixin-agent-switch.sh`
- `docs/2026-03-23-weixin-agent-switch-recovery.md`
- `customizations/openclaw-weixin/src/messaging/process-message.ts`
- `customizations/openclaw-weixin/src/messaging/agent-switch.ts`

## Suggested next steps

1. Create a GitHub repository named `web-openclaw`.
2. Push this snapshot.
3. Continue storing future OpenClaw customizations here as patches plus source snapshots.
