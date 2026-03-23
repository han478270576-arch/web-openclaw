# Project Status

Last updated: 2026-03-23

## Repository purpose

This repository currently tracks custom OpenClaw changes that are important to preserve independently from upstream plugin updates.

## Implemented

### 1. WeChat agent switch

Status: implemented and verified

Capabilities:
- show an agent selection menu in WeChat
- switch the current WeChat conversation to another agent
- query the current selected agent
- restore the conversation back to the default `main` agent

## Server-side operational state

### OpenClaw routing highlights
- `main` -> `myopenai/gpt-5.4`
- `aji-master` -> `myopenai/gpt-5.4`
- `aji-coder` -> `myopenai/gpt-5.3-codex`
- `aji-ops` -> `myopenai/gpt-5.4`

### myopenai model pool
- `gpt-4o-mini`
- `gpt-4o`
- `gpt-4.1`
- `gpt-5-mini`
- `gpt-5.4`
- `gpt-5.3-codex`

### Sub2API status summary
- OpenAI OAuth upstreams configured
- primary and backup accounts available
- WeChat/OpenClaw traffic can route through `myopenai`

## Risks

### Plugin upgrades can overwrite customization
The WeChat agent-switch implementation lives inside the `openclaw-weixin` plugin source tree, so reinstalling or upgrading that plugin can replace the customized files.

## Protection already in place
- patch file preserved in `patches/`
- recovery note preserved in `docs/`
- verification and reapply scripts preserved in `scripts/`
- current source snapshot preserved in `customizations/`

## Recommended next customizations
- `????`
- `????`
- `????`
- one-shot task delegation such as `?? coder: ...`
