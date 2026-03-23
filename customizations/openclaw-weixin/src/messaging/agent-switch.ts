import fs from "node:fs";
import path from "node:path";

import type { OpenClawConfig } from "openclaw/plugin-sdk";

import type { WeixinApiOptions } from "../api/api.js";
import { resolveStateDir } from "../storage/state-dir.js";
import { logger } from "../util/logger.js";

import { sendMessageWeixin } from "./send.js";

type AgentListEntry = {
  id?: string;
  name?: string;
  default?: boolean;
  model?: {
    primary?: string;
  };
};

type AgentOption = {
  index: number;
  id: string;
  name: string;
  model: string;
  isDefault: boolean;
};

type ModelOption = {
  index: number;
  id: string;
  label: string;
};

type ModeOption = {
  index: number;
  id: string;
  label: string;
  description: string;
  agentId: string;
  modelId?: string;
};

type PendingSelectionKind = "agent" | "model" | "mode";

type AgentSwitchState = {
  agentId?: string;
  modelId?: string;
  modeId?: string;
  pendingSelection?: PendingSelectionKind;
  sessionVersion?: number;
  updatedAt: number;
};

type AgentSwitchStore = Record<string, AgentSwitchState>;

type RouteLike = {
  agentId?: string | null;
  sessionKey?: string | null;
  mainSessionKey?: string | null;
};

type PeerRuntimeState = {
  agentId?: string;
  modelId?: string;
  modeId?: string;
  sessionVersion?: number;
};

type OneShotDelegation = {
  target: "coder" | "ops" | "research" | "finance" | "crypto";
  agentId: string;
  modelId?: string;
  cleanedContent: string;
  label: string;
};

export interface AgentSwitchCommandResult {
  handled: boolean;
}

export interface AgentSwitchCommandContext {
  content: string;
  to: string;
  contextToken?: string;
  baseUrl: string;
  token?: string;
  accountId: string;
  cfg: OpenClawConfig;
  log: (msg: string) => void;
  errLog: (msg: string) => void;
}

const STORE_DIR = path.join(resolveStateDir(), "channels", "openclaw-weixin");
const STORE_PATH = path.join(STORE_DIR, "agent-overrides.json");

const MODEL_OPTIONS: ModelOption[] = [
  { index: 1, id: "gpt-4o-mini", label: "gpt-4o-mini" },
  { index: 2, id: "gpt-4o", label: "gpt-4o" },
  { index: 3, id: "gpt-4.1", label: "gpt-4.1" },
  { index: 4, id: "gpt-5-mini", label: "gpt-5-mini" },
  { index: 5, id: "gpt-5.4", label: "gpt-5.4" },
  { index: 6, id: "gpt-5.3-codex", label: "gpt-5.3-codex" },
];

const MODE_OPTIONS: ModeOption[] = [
  {
    index: 1,
    id: "coding",
    label: "\u7f16\u7a0b\u6a21\u5f0f",
    description: "\u7f16\u7a0b\u4e13\u5bb6 + gpt-5.3-codex",
    agentId: "aji-coder",
    modelId: "gpt-5.3-codex",
  },
  {
    index: 2,
    id: "ops",
    label: "\u8fd0\u7ef4\u6a21\u5f0f",
    description: "\u8fd0\u7ef4\u4e13\u5bb6 + gpt-5.4",
    agentId: "aji-ops",
    modelId: "gpt-5.4",
  },
  {
    index: 3,
    id: "research",
    label: "\u7814\u7a76\u6a21\u5f0f",
    description: "\u7814\u7a76\u5458 + \u5f53\u524d\u7814\u7a76\u9ed8\u8ba4\u6a21\u578b",
    agentId: "aji-research",
  },
  {
    index: 4,
    id: "quality",
    label: "\u9ad8\u8d28\u91cf\u6a21\u5f0f",
    description: "main + gpt-5.4",
    agentId: "main",
    modelId: "gpt-5.4",
  },
];

const MENU_COMMANDS = new Set(["\u83dc\u5355", "\u5e2e\u52a9", "/help", "help"]);
const AGENT_MENU_COMMANDS = new Set(["\u5207\u6362\u667a\u80fd\u4f53", "\u5207\u6362\u52a9\u624b", "\u5207\u6362agent", "\u5207\u6362\u4ee3\u7406", "/agent", "agent"]);
const CURRENT_AGENT_COMMANDS = new Set(["\u5f53\u524d\u667a\u80fd\u4f53", "\u5f53\u524d\u52a9\u624b", "\u5f53\u524dagent", "\u5f53\u524d\u4ee3\u7406"]);
const CURRENT_STATUS_COMMANDS = new Set(["\u5f53\u524d\u72b6\u6001", "\u72b6\u6001", "/status"]);
const MODEL_MENU_COMMANDS = new Set(["\u5207\u6362\u6a21\u578b", "\u6a21\u578b\u83dc\u5355", "\u6a21\u578b", "/model"]);
const MODE_MENU_COMMANDS = new Set(["\u5de5\u4f5c\u6a21\u5f0f", "\u5207\u6362\u6a21\u5f0f", "\u6a21\u5f0f", "/mode"]);
const NEW_SESSION_COMMANDS = new Set(["\u65b0\u4f1a\u8bdd", "\u91cd\u5f00\u4f1a\u8bdd", "\u6e05\u7a7a\u8bb0\u5fc6", "\u91cd\u7f6e\u4f1a\u8bdd"]);
const RESET_COMMANDS = new Set(["\u6062\u590d\u4e3b\u52a9\u624b", "\u6062\u590d\u9ed8\u8ba4", "\u5207\u56de\u4e3b\u52a9\u624b", "\u5207\u56demain", "\u5207\u56de\u9ed8\u8ba4"]);

function normalizePeerId(peerId: string): string {
  return peerId.trim().toLowerCase();
}

function storeKey(accountId: string, peerId: string): string {
  return `${accountId}:${normalizePeerId(peerId)}`;
}

function readStore(): AgentSwitchStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AgentSwitchStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: AgentSwitchStore): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

function getPeerState(accountId: string, peerId: string): AgentSwitchState | undefined {
  return readStore()[storeKey(accountId, peerId)];
}

function upsertPeerState(accountId: string, peerId: string, next: AgentSwitchState): void {
  const store = readStore();
  store[storeKey(accountId, peerId)] = next;
  writeStore(store);
}

function clearPeerState(accountId: string, peerId: string): void {
  const store = readStore();
  delete store[storeKey(accountId, peerId)];
  writeStore(store);
}

function listAgentOptions(cfg: OpenClawConfig): AgentOption[] {
  const rawList = (((cfg as unknown as { agents?: { list?: AgentListEntry[] } }).agents?.list) ?? []);
  return rawList
    .filter((item): item is AgentListEntry & { id: string } => Boolean(item?.id))
    .map((item, idx) => ({
      index: idx + 1,
      id: item.id!,
      name: item.name?.trim() || item.id!,
      model: item.model?.primary?.trim() || "unconfigured",
      isDefault: item.default === true,
    }));
}

function resolveDefaultAgent(cfg: OpenClawConfig): AgentOption | undefined {
  const agents = listAgentOptions(cfg);
  return agents.find((item) => item.isDefault) ?? agents[0];
}

function findAgent(cfg: OpenClawConfig, agentId: string | undefined): AgentOption | undefined {
  if (!agentId) return undefined;
  return listAgentOptions(cfg).find((item) => item.id === agentId);
}

function resolveAgentSelection(cfg: OpenClawConfig, rawSelection: string): AgentOption | undefined {
  const trimmed = rawSelection.trim();
  if (!trimmed) return undefined;
  const options = listAgentOptions(cfg);
  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10);
    return options.find((item) => item.index === index);
  }
  const normalized = trimmed.toLowerCase();
  return options.find((item) => item.id.toLowerCase() === normalized || item.name.toLowerCase() === normalized);
}

function resolveModelSelection(rawSelection: string): ModelOption | undefined {
  const trimmed = rawSelection.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10);
    return MODEL_OPTIONS.find((item) => item.index === index);
  }
  const normalized = trimmed.toLowerCase();
  return MODEL_OPTIONS.find((item) => item.id.toLowerCase() === normalized || item.label.toLowerCase() === normalized);
}

function resolveModeSelection(rawSelection: string): ModeOption | undefined {
  const trimmed = rawSelection.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10);
    return MODE_OPTIONS.find((item) => item.index === index);
  }
  const normalized = trimmed.toLowerCase();
  return MODE_OPTIONS.find((item) => {
    const aliases = [item.id, item.label, item.description].map((v) => v.toLowerCase());
    return aliases.some((v) => v.includes(normalized) || normalized.includes(v));
  });
}

function isValidAgentId(cfg: OpenClawConfig, agentId: string | undefined): agentId is string {
  return Boolean(agentId) && listAgentOptions(cfg).some((item) => item.id === agentId);
}

function isValidModelId(modelId: string | undefined): modelId is string {
  return Boolean(modelId) && MODEL_OPTIONS.some((item) => item.id === modelId);
}

function getEffectivePeerRuntimeState(cfg: OpenClawConfig, accountId: string, peerId: string): PeerRuntimeState {
  const raw = getPeerState(accountId, peerId);
  const fallback = resolveDefaultAgent(cfg);
  const agentId = isValidAgentId(cfg, raw?.agentId) ? raw?.agentId : fallback?.id;
  const agent = findAgent(cfg, agentId);
  const modelId = isValidModelId(raw?.modelId) ? raw?.modelId : agent?.model;
  const modeId = raw?.modeId && MODE_OPTIONS.some((item) => item.id === raw.modeId) ? raw.modeId : undefined;
  return {
    agentId,
    modelId,
    modeId,
    sessionVersion: raw?.sessionVersion,
  };
}

function currentAgentId(cfg: OpenClawConfig, accountId: string, peerId: string): string | undefined {
  return getEffectivePeerRuntimeState(cfg, accountId, peerId).agentId;
}

function currentModelId(cfg: OpenClawConfig, accountId: string, peerId: string): string | undefined {
  return getEffectivePeerRuntimeState(cfg, accountId, peerId).modelId;
}

function formatAgentLine(item: AgentOption, currentId?: string): string {
  const current = item.id === currentId ? " [\u5f53\u524d]" : "";
  const defaultText = item.isDefault ? " [\u9ed8\u8ba4]" : "";
  return `${item.index}. ${item.name} (${item.id}) - ${item.model}${current}${defaultText}`;
}

function buildTopMenu(): string {
  return [
    "\u53ef\u7528\u547d\u4ee4\uff1a",
    "1. \u5207\u6362\u667a\u80fd\u4f53",
    "2. \u5207\u6362\u6a21\u578b",
    "3. \u5de5\u4f5c\u6a21\u5f0f",
    "4. \u5f53\u524d\u72b6\u6001",
    "5. \u65b0\u4f1a\u8bdd",
    "6. \u6062\u590d\u9ed8\u8ba4",
    "7. \u4ea4\u7ed9 coder: ...",
    "8. \u4ea4\u7ed9 ops: ...",
    "9. \u4ea4\u7ed9 research: ...",
    "10. \u4ea4\u7ed9 finance: ...",
    "11. \u4ea4\u7ed9 crypto: ...",
  ].join("\n");
}

function buildAgentMenu(cfg: OpenClawConfig, accountId: string, peerId: string): string {
  const currentId = currentAgentId(cfg, accountId, peerId);
  return [
    `\u5f53\u524d\u667a\u80fd\u4f53\uff1a${currentId ?? "\u672a\u8bbe\u7f6e"}`,
    "\u8bf7\u9009\u62e9\u8981\u5207\u6362\u7684\u667a\u80fd\u4f53\uff1a",
    ...listAgentOptions(cfg).map((item) => formatAgentLine(item, currentId)),
    "\u56de\u590d\u6570\u5b57\u6216 agent \u540d\u79f0\u5373\u53ef\u5207\u6362\u3002",
  ].join("\n");
}

function buildModelMenu(cfg: OpenClawConfig, accountId: string, peerId: string): string {
  const currentId = currentModelId(cfg, accountId, peerId);
  return [
    `\u5f53\u524d\u6a21\u578b\uff1a${currentId ?? "\u672a\u8bbe\u7f6e"}`,
    "\u8bf7\u9009\u62e9\u6a21\u578b\uff1a",
    ...MODEL_OPTIONS.map((item) => `${item.index}. ${item.label}${item.id === currentId ? " [\u5f53\u524d]" : ""}`),
    "\u56de\u590d\u6570\u5b57\u6216\u6a21\u578b\u540d\u79f0\u5373\u53ef\u5207\u6362\u3002",
  ].join("\n");
}

function buildModeMenu(): string {
  return [
    "\u8bf7\u9009\u62e9\u5de5\u4f5c\u6a21\u5f0f\uff1a",
    ...MODE_OPTIONS.map((item) => `${item.index}. ${item.label} - ${item.description}`),
    "\u56de\u590d\u6570\u5b57\u6216\u6a21\u5f0f\u540d\u79f0\u5373\u53ef\u5207\u6362\u3002",
  ].join("\n");
}

function buildCurrentStatusText(cfg: OpenClawConfig, accountId: string, peerId: string): string {
  const state = getEffectivePeerRuntimeState(cfg, accountId, peerId);
  const agent = findAgent(cfg, state.agentId);
  const mode = state.modeId ? MODE_OPTIONS.find((item) => item.id === state.modeId) : undefined;
  return [
    `\u5f53\u524d\u667a\u80fd\u4f53\uff1a${agent?.name ?? state.agentId ?? "\u672a\u8bbe\u7f6e"} (${state.agentId ?? "none"})`,
    `\u5f53\u524d\u6a21\u578b\uff1a${state.modelId ?? agent?.model ?? "\u672a\u8bbe\u7f6e"}`,
    `\u5f53\u524d\u6a21\u5f0f\uff1a${mode?.label ?? "\u81ea\u5b9a\u4e49/\u9ed8\u8ba4"}`,
    `\u4f1a\u8bdd\u72b6\u6001\uff1a${state.sessionVersion ? `\u5df2\u5207\u5230\u65b0\u4f1a\u8bdd #${String(state.sessionVersion).slice(-6)}` : "\u9ed8\u8ba4\u4f1a\u8bdd"}`,
  ].join("\n");
}

function buildCurrentAgentText(cfg: OpenClawConfig, accountId: string, peerId: string): string {
  const selected = findAgent(cfg, currentAgentId(cfg, accountId, peerId));
  if (!selected) {
    return "\u5f53\u524d\u6ca1\u6709\u627e\u5230\u53ef\u7528\u7684\u667a\u80fd\u4f53\u914d\u7f6e\u3002";
  }
  return [
    `\u5f53\u524d\u667a\u80fd\u4f53\uff1a${selected.name} (${selected.id})`,
    `\u6a21\u578b\uff1a${currentModelId(cfg, accountId, peerId) ?? selected.model}`,
    selected.isDefault ? "\u72b6\u6001\uff1a\u9ed8\u8ba4\u4e3b\u52a9\u624b" : "\u72b6\u6001\uff1a\u5df2\u5207\u6362\u5230\u4e13\u7528\u667a\u80fd\u4f53",
    "\u53d1\u9001\u201c\u5207\u6362\u667a\u80fd\u4f53\u201d\u53ef\u91cd\u65b0\u9009\u62e9\u3002",
  ].join("\n");
}

function extractByPrefixes(raw: string, prefixes: string[]): string | undefined {
  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) {
      const next = raw.slice(prefix.length).trim();
      return next || undefined;
    }
  }
  return undefined;
}

function extractDirectSelection(raw: string): string | undefined {
  return extractByPrefixes(raw, ["\u5207\u5230", "\u5207\u6362\u5230", "\u5207\u6362\u4e3a", "\u4f7f\u7528", "\u542f\u7528"]);
}

function extractDirectModelSelection(raw: string): string | undefined {
  return extractByPrefixes(raw, ["\u5207\u5230\u6a21\u578b", "\u5207\u6362\u6a21\u578b\u4e3a", "\u4f7f\u7528\u6a21\u578b", "\u6a21\u578b\u4e3a", "\u6a21\u578b"]);
}

function extractDirectModeSelection(raw: string): string | undefined {
  return extractByPrefixes(raw, ["\u5207\u5230\u6a21\u5f0f", "\u5207\u6362\u6a21\u5f0f\u4e3a", "\u6a21\u5f0f\u4e3a"]);
}

function withPendingSelection(accountId: string, peerId: string, kind: PendingSelectionKind): void {
  const prev = getPeerState(accountId, peerId) ?? { updatedAt: Date.now() };
  upsertPeerState(accountId, peerId, {
    ...prev,
    pendingSelection: kind,
    updatedAt: Date.now(),
  });
}

function saveSessionState(accountId: string, peerId: string, patch: Partial<AgentSwitchState>): void {
  const prev = getPeerState(accountId, peerId) ?? { updatedAt: Date.now() };
  upsertPeerState(accountId, peerId, {
    ...prev,
    ...patch,
    pendingSelection: undefined,
    updatedAt: Date.now(),
  });
}

async function sendReply(ctx: AgentSwitchCommandContext, text: string): Promise<void> {
  const opts: WeixinApiOptions & { contextToken?: string } = {
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    contextToken: ctx.contextToken,
  };
  await sendMessageWeixin({ to: ctx.to, text, opts });
}

export async function handleAgentSwitchCommand(ctx: AgentSwitchCommandContext): Promise<AgentSwitchCommandResult> {
  const raw = ctx.content.trim();
  if (!raw) {
    return { handled: false };
  }

  const peerState = getPeerState(ctx.accountId, ctx.to);

  try {
    if (MENU_COMMANDS.has(raw)) {
      await sendReply(ctx, buildTopMenu());
      return { handled: true };
    }
    if (AGENT_MENU_COMMANDS.has(raw)) {
      withPendingSelection(ctx.accountId, ctx.to, "agent");
      await sendReply(ctx, buildAgentMenu(ctx.cfg, ctx.accountId, ctx.to));
      return { handled: true };
    }
    if (CURRENT_STATUS_COMMANDS.has(raw)) {
      await sendReply(ctx, buildCurrentStatusText(ctx.cfg, ctx.accountId, ctx.to));
      return { handled: true };
    }
    if (CURRENT_AGENT_COMMANDS.has(raw)) {
      await sendReply(ctx, buildCurrentAgentText(ctx.cfg, ctx.accountId, ctx.to));
      return { handled: true };
    }
    if (MODEL_MENU_COMMANDS.has(raw)) {
      withPendingSelection(ctx.accountId, ctx.to, "model");
      await sendReply(ctx, buildModelMenu(ctx.cfg, ctx.accountId, ctx.to));
      return { handled: true };
    }
    if (MODE_MENU_COMMANDS.has(raw)) {
      withPendingSelection(ctx.accountId, ctx.to, "mode");
      await sendReply(ctx, buildModeMenu());
      return { handled: true };
    }
    if (NEW_SESSION_COMMANDS.has(raw)) {
      const state = getPeerState(ctx.accountId, ctx.to) ?? { updatedAt: Date.now() };
      saveSessionState(ctx.accountId, ctx.to, {
        agentId: isValidAgentId(ctx.cfg, state.agentId) ? state.agentId : currentAgentId(ctx.cfg, ctx.accountId, ctx.to),
        modelId: isValidModelId(state.modelId) ? state.modelId : currentModelId(ctx.cfg, ctx.accountId, ctx.to),
        modeId: state.modeId,
        sessionVersion: Date.now(),
      });
      await sendReply(ctx, `\u5df2\u5f00\u542f\u65b0\u4f1a\u8bdd\u3002\n${buildCurrentStatusText(ctx.cfg, ctx.accountId, ctx.to)}`);
      return { handled: true };
    }
    if (RESET_COMMANDS.has(raw)) {
      clearPeerState(ctx.accountId, ctx.to);
      const fallback = resolveDefaultAgent(ctx.cfg);
      await sendReply(
        ctx,
        fallback
          ? `\u5df2\u6062\u590d\u9ed8\u8ba4\u3002\n\u667a\u80fd\u4f53\uff1a${fallback.name} (${fallback.id})\n\u6a21\u578b\uff1a${fallback.model}`
          : "\u5df2\u6062\u590d\u9ed8\u8ba4\u8def\u7531\u3002",
      );
      return { handled: true };
    }

    const directAgentSelection = extractDirectSelection(raw);
    if (directAgentSelection) {
      const selected = resolveAgentSelection(ctx.cfg, directAgentSelection);
      if (selected) {
        saveSessionState(ctx.accountId, ctx.to, { agentId: selected.id, modeId: undefined });
        await sendReply(ctx, `\u5df2\u5207\u6362\u5230\uff1a${selected.name} (${selected.id})\n\u6a21\u578b\uff1a${currentModelId(ctx.cfg, ctx.accountId, ctx.to) ?? selected.model}`);
        return { handled: true };
      }
    }

    const directModelSelection = extractDirectModelSelection(raw);
    if (directModelSelection) {
      const selected = resolveModelSelection(directModelSelection);
      if (selected) {
        saveSessionState(ctx.accountId, ctx.to, { modelId: selected.id, modeId: undefined });
        await sendReply(ctx, `\u5df2\u5207\u6362\u6a21\u578b\uff1a${selected.label}\n${buildCurrentStatusText(ctx.cfg, ctx.accountId, ctx.to)}`);
        return { handled: true };
      }
    }

    const directModeSelection = extractDirectModeSelection(raw);
    if (directModeSelection) {
      const selected = resolveModeSelection(directModeSelection);
      if (selected) {
        saveSessionState(ctx.accountId, ctx.to, {
          agentId: selected.agentId,
          modelId: selected.modelId,
          modeId: selected.id,
        });
        await sendReply(ctx, `\u5df2\u5207\u6362\u5230\uff1a${selected.label}\n\u667a\u80fd\u4f53\uff1a${selected.agentId}\n\u6a21\u578b\uff1a${selected.modelId ?? findAgent(ctx.cfg, selected.agentId)?.model ?? "default"}`);
        return { handled: true };
      }
    }

    if (peerState?.pendingSelection === "agent") {
      const selected = resolveAgentSelection(ctx.cfg, raw);
      if (!selected) {
        await sendReply(ctx, `\u6ca1\u6709\u8bc6\u522b\u5230\u8981\u5207\u6362\u7684\u667a\u80fd\u4f53\uff1a${raw}\n\n${buildAgentMenu(ctx.cfg, ctx.accountId, ctx.to)}`);
        return { handled: true };
      }
      saveSessionState(ctx.accountId, ctx.to, { agentId: selected.id, modeId: undefined });
      await sendReply(ctx, `\u5df2\u5207\u6362\u5230\uff1a${selected.name} (${selected.id})\n\u6a21\u578b\uff1a${currentModelId(ctx.cfg, ctx.accountId, ctx.to) ?? selected.model}`);
      return { handled: true };
    }

    if (peerState?.pendingSelection === "model") {
      const selected = resolveModelSelection(raw);
      if (!selected) {
        await sendReply(ctx, `\u6ca1\u6709\u8bc6\u522b\u5230\u8981\u5207\u6362\u7684\u6a21\u578b\uff1a${raw}\n\n${buildModelMenu(ctx.cfg, ctx.accountId, ctx.to)}`);
        return { handled: true };
      }
      saveSessionState(ctx.accountId, ctx.to, { modelId: selected.id, modeId: undefined });
      await sendReply(ctx, `\u5df2\u5207\u6362\u6a21\u578b\uff1a${selected.label}\n${buildCurrentStatusText(ctx.cfg, ctx.accountId, ctx.to)}`);
      return { handled: true };
    }

    if (peerState?.pendingSelection === "mode") {
      const selected = resolveModeSelection(raw);
      if (!selected) {
        await sendReply(ctx, `\u6ca1\u6709\u8bc6\u522b\u5230\u8981\u5207\u6362\u7684\u6a21\u5f0f\uff1a${raw}\n\n${buildModeMenu()}`);
        return { handled: true };
      }
      saveSessionState(ctx.accountId, ctx.to, {
        agentId: selected.agentId,
        modelId: selected.modelId,
        modeId: selected.id,
      });
      await sendReply(ctx, `\u5df2\u5207\u6362\u5230\uff1a${selected.label}\n\u667a\u80fd\u4f53\uff1a${selected.agentId}\n\u6a21\u578b\uff1a${selected.modelId ?? findAgent(ctx.cfg, selected.agentId)?.model ?? "default"}`);
      return { handled: true };
    }

    return { handled: false };
  } catch (err) {
    logger.error(`[weixin] command handler error: ${String(err)}`);
    try {
      await sendReply(ctx, `\u547d\u4ee4\u5904\u7406\u5931\u8d25\uff1a${String(err).slice(0, 200)}`);
    } catch {
      // noop
    }
    return { handled: true };
  }
}

export function resolveOneShotDelegation(raw: string): OneShotDelegation | undefined {
  const trimmed = raw.trim();
  const patterns: Array<{ re: RegExp; target: OneShotDelegation["target"]; agentId: string; modelId?: string; label: string }> = [
    { re: /^\u4ea4\u7ed9\s*coder\s*[:\uff1a]\s*(.+)$/i, target: "coder", agentId: "aji-coder", modelId: "gpt-5.3-codex", label: "\u7f16\u7a0b\u4e13\u5bb6" },
    { re: /^\u4ea4\u7ed9\s*ops\s*[:\uff1a]\s*(.+)$/i, target: "ops", agentId: "aji-ops", modelId: "gpt-5.4", label: "\u8fd0\u7ef4\u4e13\u5bb6" },
    { re: /^\u4ea4\u7ed9\s*research\s*[:\uff1a]\s*(.+)$/i, target: "research", agentId: "aji-research", label: "\u6df1\u5ea6\u7814\u7a76\u5458" },
    { re: /^\u4ea4\u7ed9\s*finance\s*[:\uff1a]\s*(.+)$/i, target: "finance", agentId: "aji-finance", label: "\u91d1\u878d\u4e13\u5bb6" },
    { re: /^\u4ea4\u7ed9\s*crypto\s*[:\uff1a]\s*(.+)$/i, target: "crypto", agentId: "aji-crypto", label: "\u52a0\u5bc6\u7814\u7a76\u5458" },
    { re: /^\u4ea4\u7ed9\s*\u7f16\u7a0b\u4e13\u5bb6\s*[:\uff1a]\s*(.+)$/i, target: "coder", agentId: "aji-coder", modelId: "gpt-5.3-codex", label: "\u7f16\u7a0b\u4e13\u5bb6" },
    { re: /^\u4ea4\u7ed9\s*\u8fd0\u7ef4\u4e13\u5bb6\s*[:\uff1a]\s*(.+)$/i, target: "ops", agentId: "aji-ops", modelId: "gpt-5.4", label: "\u8fd0\u7ef4\u4e13\u5bb6" },
    { re: /^\u4ea4\u7ed9\s*\u6df1\u5ea6\u7814\u7a76\u5458\s*[:\uff1a]\s*(.+)$/i, target: "research", agentId: "aji-research", label: "\u6df1\u5ea6\u7814\u7a76\u5458" },
    { re: /^\u4ea4\u7ed9\s*\u91d1\u878d\u4e13\u5bb6\s*[:\uff1a]\s*(.+)$/i, target: "finance", agentId: "aji-finance", label: "\u91d1\u878d\u4e13\u5bb6" },
    { re: /^\u4ea4\u7ed9\s*\u52a0\u5bc6\u7814\u7a76\u5458\s*[:\uff1a]\s*(.+)$/i, target: "crypto", agentId: "aji-crypto", label: "\u52a0\u5bc6\u7814\u7a76\u5458" },
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern.re);
    if (match?.[1]?.trim()) {
      return {
        target: pattern.target,
        agentId: pattern.agentId,
        modelId: pattern.modelId,
        cleanedContent: match[1].trim(),
        label: pattern.label,
      };
    }
  }
  return undefined;
}

export function buildOneShotDelegationNotice(delegation: OneShotDelegation): string {
  return delegation.modelId
    ? `\u672c\u6b21\u4efb\u52a1\u5df2\u4ea4\u7ed9\uff1a${delegation.label}\n\u6a21\u578b\uff1a${delegation.modelId}`
    : `\u672c\u6b21\u4efb\u52a1\u5df2\u4ea4\u7ed9\uff1a${delegation.label}`;
}

export function applyAgentOverrideToRoute<T extends RouteLike>(
  route: T,
  params: {
    cfg: OpenClawConfig;
    accountId: string;
    peerId: string;
    channel: string;
    chatType?: "direct" | "group";
    forceAgentId?: string;
    sessionVersion?: number;
  },
): T {
  const state = getEffectivePeerRuntimeState(params.cfg, params.accountId, params.peerId);
  const agentId = params.forceAgentId ?? state.agentId;
  if (!agentId || !isValidAgentId(params.cfg, agentId)) {
    return route;
  }
  const chatType = params.chatType ?? "direct";
  const version = params.sessionVersion ?? state.sessionVersion;
  const sessionSuffix = version ? `:v${version}` : "";
  const sessionKey = `agent:${agentId}:${params.channel}:${chatType}:${normalizePeerId(params.peerId)}${sessionSuffix}`;
  return {
    ...route,
    agentId,
    sessionKey,
  };
}

export function cloneConfigWithRouteOverrides(
  cfg: OpenClawConfig,
  params: {
    accountId: string;
    peerId: string;
    effectiveAgentId?: string;
    forceModelId?: string;
  },
): OpenClawConfig {
  const state = getEffectivePeerRuntimeState(cfg, params.accountId, params.peerId);
  const targetAgentId = params.effectiveAgentId ?? state.agentId;
  const targetModelId = params.forceModelId ?? state.modelId;
  if (!targetAgentId || !targetModelId) {
    return cfg;
  }
  const source = cfg as unknown as { agents?: { list?: AgentListEntry[] } };
  const list = source.agents?.list ?? [];
  let changed = false;
  const nextList = list.map((item) => {
    if (item.id !== targetAgentId) {
      return item;
    }
    if (item.model?.primary === targetModelId) {
      return item;
    }
    changed = true;
    return {
      ...item,
      model: {
        ...(item.model ?? {}),
        primary: targetModelId,
      },
    };
  });
  if (!changed) {
    return cfg;
  }
  return {
    ...(cfg as Record<string, unknown>),
    agents: {
      ...(source.agents ?? {}),
      list: nextList,
    },
  } as OpenClawConfig;
}

export function getPeerEffectiveState(cfg: OpenClawConfig, accountId: string, peerId: string): PeerRuntimeState {
  return getEffectivePeerRuntimeState(cfg, accountId, peerId);
}
