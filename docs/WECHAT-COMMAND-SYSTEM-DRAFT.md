# WeChat Command System Draft

This draft describes a practical command layer for using OpenClaw from WeChat as a lightweight control console.

## Design goals
- short mobile-friendly commands
- conversation-scoped changes instead of global changes
- easy rollback to defaults
- consistent command wording

## Priority 1

### `??`
Show the available command list.

### `?????`
Show a numbered agent menu.

### `?????`
Show the current agent for this WeChat conversation.

### `?????`
Restore the conversation to `main`.

### `????`
Show current agent, current model, and whether the session is temporarily switched.

## Priority 2

### `????`
Allow the current WeChat conversation to select a model from:
- `gpt-4o-mini`
- `gpt-4o`
- `gpt-4.1`
- `gpt-5-mini`
- `gpt-5.4`
- `gpt-5.3-codex`

### `????`
Preset bundles such as:
- `????`
- `????`
- `????`
- `?????`
- `????`

## Priority 3

### One-shot delegation
Examples:
- `?? coder: ...`
- `?? ops: ...`
- `?? research: ...`

This should delegate a single task without permanently switching the current conversation.

## Interaction style
Keep the replies short, operational, and menu-based when possible.

Example menu:

```text
???????
1. main
2. aji-master
3. aji-coder
4. aji-ops
5. aji-research
6. aji-finance
7. aji-crypto
```
