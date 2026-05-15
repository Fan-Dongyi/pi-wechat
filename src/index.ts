import { WeixinBot, type IncomingMessage } from "@pinixai/weixin-bot";

import { loadConfig } from "./config.js";
import { ConversationStore } from "./conversation-store.js";
import { HermesClient } from "./hermes-client.js";
import { formatError, log } from "./log.js";
import { TargetRouter } from "./router.js";
import { normalizeWechatMessage, truncateForWechat } from "./wechat.js";
import { AgentManager } from "./agent-manager.js";

const config = loadConfig();
const router = new TargetRouter(config);
const conversations = new ConversationStore(config.historyTurns);
const agentManager = new AgentManager(config.targets);
agentManager.start();

const clients = new Map(
  config.targets.map((target) => [target.id, new HermesClient(target, config.requestTimeoutMs)]),
);

const bot = new WeixinBot({
  onError: (error) => log("ERROR", formatError(error)),
});

function getClient(targetId: string) {
  const client = clients.get(targetId);
  if (!client) {
    throw new Error(`Hermes client not found: ${targetId}`);
  }

  return client;
}

log("INFO", config.forceLogin ? "强制重新扫码登录微信..." : "正在登录微信...");
const creds = await bot.login({ force: config.forceLogin });
log("INFO", `微信登录成功，Bot ID: ${creds.accountId}`);

bot.onMessage(async (rawMessage: IncomingMessage) => {
  const message = normalizeWechatMessage(rawMessage);
  log("RECV", `from=${message.userId} type=${message.type ?? "unknown"} text=${message.text}`);

  if (!message.text) {
    await bot.reply(rawMessage, "目前只支持文本指令。");
    return;
  }

  const { target, routeKeys, isMention } = router.resolve(message.raw, message.text, agentManager);
  
  // If the user didn't mention an agent and the message is asking for agents, return the list
  if (!isMention && /^(有哪些agent|agent列表|在线agent|agents|list|列表)$/i.test(message.text.trim())) {
    const onlineAgents = agentManager.getOnlineAgents();
    if (onlineAgents.length === 0) {
      await bot.reply(rawMessage, "当前没有在线的 Agent。");
    } else {
      const agentNames = onlineAgents.map(a => `- ${a.name || a.id}`).join("\n");
      await bot.reply(rawMessage, `当前在线的 Agent 有：\n${agentNames}\n\n请使用 @名字 提问。`);
    }
    return;
  }

  // If the target is offline, we should probably warn the user
  const targetStatus = agentManager.getAllStatuses().find(s => s.target.id === target.id);
  if (targetStatus && !targetStatus.isOnline) {
    await bot.reply(rawMessage, `目标 Agent [${target.name || target.id}] 当前离线，无法处理请求。`);
    return;
  }

  const client = getClient(target.id);
  log("INFO", `路由到 Hermes Agent: ${target.name ?? target.id}`);

  try {
    await bot.sendTyping(message.userId).catch(() => undefined);

    const response = await client.complete(conversations.buildMessages(target, message, routeKeys));
    conversations.append(target.id, message.userId, message.text, response);

    const reply = truncateForWechat(response, config.maxReplyChars);
    await bot.reply(rawMessage, reply);
    log("SEND", `to=${message.userId} target=${target.id} chars=${reply.length}`);
  } catch (error) {
    const reason = formatError(error);
    log("ERROR", reason);
    await bot.stopTyping(message.userId).catch(() => undefined);
    await bot.reply(rawMessage, `Hermes 子 Agent 执行失败：\n${reason}`);
  }
});

process.on("SIGINT", () => {
  log("INFO", "收到 SIGINT，正在停止微信 Bot...");
  agentManager.stop();
  bot.stop();
});

process.on("SIGTERM", () => {
  log("INFO", "收到 SIGTERM，正在停止微信 Bot...");
  agentManager.stop();
  bot.stop();
});

log("INFO", "开始接收微信消息");
await bot.run();
