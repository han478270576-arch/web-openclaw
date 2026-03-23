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

type AgentSwitchState = {
  agentId?: string;
  pendingSelection?: boolean;
  updatedAt: number;
};

type AgentSwitchStore = Record<string, AgentSwitchState>;

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

type RouteLike = {
  agentId?: string | null;
  sessionKey?: string | null;
  mainSessionKey?: string | null;
};

const STORE_DIR = path.join(resolveStateDir(), "channels", "openclaw-weixin");
const STORE_PATH = path.join(STORE_DIR, "agent-overrides.json");
const MENU_COMMANDS = new Set(["切换智能体", "切换助手", "切换agent", "切换代理", "/agent", "agent"]);
const CURRENT_COMMANDS = new Set(["当前智能体", "当前助手", "当前agent", "当前代理"]);
const RESET_COMMANDS = new Set(["恢复主助手", "恢复默认", "切回主助手", "切回main", "切回默认"]);

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
  const store = readStore();
  return store[storeKey(accountId, peerId)];
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
      model: item.model?.primary?.trim() || "未配置模型",
      isDefault: item.default === true,
    }));
}

function resolveDefaultAgent(cfg: OpenClawConfig): AgentOption | undefined {
  const agents = listAgentOptions(cfg);
  return agents.find((item) => item.isDefault) ?? agents[0];
}

function resolveSelection(cfg: OpenClawConfig, rawSelection: string): AgentOption | undefined {
  const agents = listAgentOptions(cfg);
  const trimmed = rawSelection.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const idx = Number.parseInt(trimmed, 10);
    return agents.find((item) => item.index == idx);
  }

  const normalized = trimmed.toLowerCase();
  return agents.find((item) => item.id.toLowerCase() === normalized || item.name.toLowerCase() === normalized);
}

function isValidAgentId(cfg: OpenClawConfig, agentId: string | undefined): agentId is string {
  if (!agentId) return false;
  return listAgentOptions(cfg).some((item) => item.id === agentId);
}

function currentAgentId(cfg: OpenClawConfig, accountId: string, peerId: string): string | undefined {
  const state = getPeerState(accountId, peerId);
  if (isValidAgentId(cfg, state?.agentId)) {
    return state!.agentId;
  }
  return resolveDefaultAgent(cfg)?.id;
}

function formatAgentLine(item: AgentOption, currentId?: string): string {
  const current = item.id === currentId ? " [当前]" : "";
  const defaultText = item.isDefault ? " [默认]" : "";
  return `${item.index}. ${item.name} (${item.id}) · ${item.model}${current}${defaultText}`;
}

function buildAgentMenu(cfg: OpenClawConfig, accountId: string, peerId: string): string {
  const agents = listAgentOptions(cfg);
  const currentId = currentAgentId(cfg, accountId, peerId);
  const lines = [
    `当前智能体：${currentId ?? "未设置"}`,
    "请选择要切换的智能体：",
    ...agents.map((item) => formatAgentLine(item, currentId)),
    "回复数字或 agent 名称即可切换。",
    "发送 当前智能体 可查看当前状态。",
    "发送 恢复主助手 可切回默认。",
  ];
  return lines.join("\n");
}

function buildCurrentAgentText(cfg: OpenClawConfig, accountId: string, peerId: string): string {
  const selected = resolveSelection(cfg, currentAgentId(cfg, accountId, peerId) ?? "");
  if (!selected) {
    return "当前没有找到可用的智能体配置。";
  }
  return [
    `当前智能体：${selected.name} (${selected.id})`,
    `模型：${selected.model}`,
    selected.isDefault ? "状态：默认主助手" : "状态：已切换到专用智能体",
    "发送“切换智能体”可重新选择。",
  ].join("\n");
}

function extractDirectSelection(raw: string): string | undefined {
  const direct = raw.match(/^(?:切到|切换到|切换为|使用|启用)\s*(.+)$/i);
  if (direct?.[1]) {
    return direct[1].trim();
  }
  return undefined;
}

async function sendReply(ctx: AgentSwitchCommandContext, text: string): Promise<void> {
  logger.info(`[weixin] agent-switch send start to=${ctx.to} textLen=${text.length} hasContextToken=${Boolean(ctx.contextToken)}`);
  const opts: WeixinApiOptions & { contextToken?: string } = {
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    contextToken: ctx.contextToken,
  };
  await sendMessageWeixin({ to: ctx.to, text, opts });
  logger.info(`[weixin] agent-switch send ok to=${ctx.to} textLen=${text.length}`);
}

export async function handleAgentSwitchCommand(
  ctx: AgentSwitchCommandContext,
): Promise<AgentSwitchCommandResult> {
  const raw = ctx.content.trim();
  if (!raw) {
    return { handled: false };
  }

  const peerState = getPeerState(ctx.accountId, ctx.to);

  try {
    if (MENU_COMMANDS.has(raw)) {
      upsertPeerState(ctx.accountId, ctx.to, {
        agentId: isValidAgentId(ctx.cfg, peerState?.agentId) ? peerState?.agentId : undefined,
        pendingSelection: true,
        updatedAt: Date.now(),
      });
      await sendReply(ctx, buildAgentMenu(ctx.cfg, ctx.accountId, ctx.to));
      return { handled: true };
    }

    if (CURRENT_COMMANDS.has(raw)) {
      await sendReply(ctx, buildCurrentAgentText(ctx.cfg, ctx.accountId, ctx.to));
      return { handled: true };
    }

    if (RESET_COMMANDS.has(raw)) {
      clearPeerState(ctx.accountId, ctx.to);
      const fallback = resolveDefaultAgent(ctx.cfg);
      await sendReply(
        ctx,
        fallback
          ? `已恢复主助手：${fallback.name} (${fallback.id})\n模型：${fallback.model}`
          : "已恢复默认路由。",
      );
      return { handled: true };
    }

    const directSelection = extractDirectSelection(raw);
    const selectionText = directSelection ?? (peerState?.pendingSelection ? raw : "");

    if (selectionText) {
      const selected = resolveSelection(ctx.cfg, selectionText);
      if (!selected) {
        if (peerState?.pendingSelection) {
          await sendReply(
            ctx,
            `没有识别到要切换的智能体：${selectionText}\n\n${buildAgentMenu(ctx.cfg, ctx.accountId, ctx.to)}`,
          );
          return { handled: true };
        }
        return { handled: false };
      }

      upsertPeerState(ctx.accountId, ctx.to, {
        agentId: selected.id,
        pendingSelection: false,
        updatedAt: Date.now(),
      });
      await sendReply(
        ctx,
        [
          `已切换到：${selected.name} (${selected.id})`,
          `模型：${selected.model}`,
          "本微信会话后续消息将优先由它处理。",
          "发送“恢复主助手”可切回默认。",
        ].join("\n"),
      );
      return { handled: true };
    }

    return { handled: false };
  } catch (err) {
    logger.error(`[weixin] agent switch command error: ${String(err)}`);
    try {
      await sendReply(ctx, `❌ 智能体切换失败：${String(err).slice(0, 200)}`);
    } catch {
    }
    return { handled: true };
  }
}

export function applyAgentOverrideToRoute<T extends RouteLike>(
  route: T,
  params: {
    cfg: OpenClawConfig;
    accountId: string;
    peerId: string;
    channel: string;
    chatType?: "direct" | "group";
  },
): T {
  const state = getPeerState(params.accountId, params.peerId);
  if (!state?.agentId) {
    return route;
  }

  if (!isValidAgentId(params.cfg, state.agentId)) {
    clearPeerState(params.accountId, params.peerId);
    return route;
  }

  const chatType = params.chatType ?? "direct";
  const sessionKey = `agent:${state.agentId}:${params.channel}:${chatType}:${normalizePeerId(params.peerId)}`;
  logger.info(
    `[weixin] route override hit account=${params.accountId} peer=${normalizePeerId(params.peerId)} agent=${state.agentId}`,
  );
  return {
    ...route,
    agentId: state.agentId,
    sessionKey,
  };
}
