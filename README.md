# pi-wechat-hermes-bridge

一个把微信 iLink Bot SDK 和 Hermes Agent OpenAI 兼容接口串起来的桥接工程：

1. `@pinixai/weixin-bot` 通过扫码登录和长轮询接收微信消息。
2. 桥接层按微信消息里的接收者/会话/发送者字段选择 Hermes 子 Agent。
3. 通过 Hermes API Server 的 `/v1/chat/completions` 等待子 Agent 完成任务。
4. 将最终结果通过 iLink SDK 回复给微信发送者。

## 准备 Hermes API Server

Hermes 需要开启 OpenAI 兼容 API Server，参考官方 Open WebUI 集成文档：

```bash
hermes config set API_SERVER_ENABLED true
hermes config set API_SERVER_KEY your-secret-key
hermes gateway
```

确认服务可访问：

```bash
curl -s http://127.0.0.1:8642/health
curl -s -H "Authorization: Bearer your-secret-key" http://127.0.0.1:8642/v1/models
```

如需多个子 Agent，可以按 Hermes profile 启动多个端口，例如 `8650`、`8651`，然后在本工程的 `HERMES_TARGETS` 中配置多个目标。

## 安装与运行

```bash
npm install
cp .env.example .env
npm run dev
```

首次运行会在终端提示微信扫码登录；之后 SDK 会复用保存的凭证。需要强制重新扫码时：

```bash
npm run dev -- --force-login
```

## 配置

核心配置都在 `.env`：

```bash
HERMES_DEFAULT_TARGET=default
HERMES_REQUEST_TIMEOUT_MS=600000
HERMES_HISTORY_TURNS=6
WECHAT_MAX_REPLY_CHARS=3500
HERMES_TARGETS='[
  {
    "id": "default",
    "name": "Default Hermes Agent",
    "baseUrl": "http://127.0.0.1:8642/v1",
    "apiKey": "your-secret-key",
    "model": "hermes-agent",
    "match": []
  },
  {
    "id": "alice",
    "name": "Alice Hermes Agent",
    "baseUrl": "http://127.0.0.1:8650/v1",
    "apiKey": "alice-secret",
    "model": "alice",
    "match": ["wechat-recipient-or-user-id"]
  }
]'
```

`match` 会匹配微信消息里的这些字段：`toUserId`、`receiverId`、`recipientId`、`chatId`、`conversationId`、`roomId`、`userId`。没有命中时使用 `HERMES_DEFAULT_TARGET`。

## 构建

```bash
npm run build
npm start
```

## 参考

- iLink Bot SDK: https://github.com/epiral/weixin-bot
- Pi Agent Harness: https://github.com/earendil-works/pi
- Hermes Open WebUI / OpenAI 兼容接口: https://hermes-agent.nousresearch.com/docs/zh-Hans/user-guide/messaging/open-webui
