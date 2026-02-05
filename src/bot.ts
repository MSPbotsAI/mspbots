import { getMspBotsRuntime } from "./runtime.js";
import { createMspBotsReplyDispatcher } from "./reply-dispatcher.js";
import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedMspBotsAccount } from "./channel.js";

export interface MspBotsMessagePayload {
    // Old fields
    message?: string;
    senderId?: string;
    senderName?: string;
    
    // New fields based on logs
    data?: string;
    userId?: string;
    type?: string;
    agentId?: string;
    appId?: string;
    taskId?: string;
}

export async function handleMspBotsMessage(
    params: {
        cfg: ClawdbotConfig;
        payload: MspBotsMessagePayload;
        accountId: string;
        account?: ResolvedMspBotsAccount;
        runtime?: RuntimeEnv;
    }
) {
    const { cfg, payload, accountId, account, runtime } = params;
    
    // Adapt payload fields
    const rawText = payload.data;
    if (!rawText) {
        console.log('[MSPBots] Skipping message with no content');
        return;
    }

    const sender = {
        id: payload.userId || payload.senderId || "local-tester",
        name: payload.senderName || "User"
    };

    // Extract dynamic context from payload
    const mspBotsContext = {
        agentId: payload.agentId,
        appId: payload.appId
    };

    const core = getMspBotsRuntime();
    const messageId = "msg-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const taskId = payload.taskId;
    
    // 1. Resolve Agent Route (确定 Session Key)
    const mspBotsFrom = `mspbots:${sender.id}`;
    // 私聊模式下，To 指向用户自己 (参考飞书实现: isGroup ? chat:id : user:id)
    const mspBotsTo = `user:${sender.id}`; 

    const route = core.channel.routing.resolveAgentRoute({
        cfg,
        channel: "mspbots",
        peer: {
            kind: "dm", // 简化处理，视为 DM
            id: sender.id,
        },
    });

    console.log(`[MSPBots] Route resolved: Agent=${route.agentId}, Session=${route.sessionKey}`);

    // 2. Enqueue System Event (记录日志到 Session)
    core.system.enqueueSystemEvent(`MSPBots message from ${sender.name}: ${rawText.slice(0, 50)}`, {
        sessionKey: route.sessionKey,
        contextKey: taskId ? `mspbots:message:${taskId}` : `mspbots:message:${messageId}`,
    });

    // 3. Build Envelope Body (构建最终给 AI 的 Prompt Body)
    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
    const body = core.channel.reply.formatAgentEnvelope({
        channel: "MSPBots",
        from: sender.name,
        timestamp: new Date(),
        envelope: envelopeOptions,
        body: `${rawText}`, // 格式: "User: Hello"
    });

    // 4. Finalize Inbound Context (构建标准上下文)
    const ctxPayload = core.channel.reply.finalizeInboundContext({
        Body: body,
        RawBody: rawText,
        CommandBody: rawText,
        From: mspBotsFrom,
        To: mspBotsTo,
        SessionKey: route.sessionKey,
        AccountId: route.accountId, // 这里应该是我们的 accountId
        ChatType: "direct",
        SenderName: sender.name,
        SenderId: sender.id,
        Provider: "mspbots",
        Surface: "mspbots",
        MessageSid: messageId,
        Timestamp: Date.now(),
        CommandAuthorized: true,
        OriginatingChannel: "mspbots",
        OriginatingTo: mspBotsTo,
    });

    // 5. Create Dispatcher (创建回复处理器)
    const { dispatcher, replyOptions, markDispatchIdle } = createMspBotsReplyDispatcher({
        cfg,
        agentId: route.agentId,
        runtime: runtime as RuntimeEnv,
        chatId: sender.id, // Use sender.id as the recipient for replies
        account, // Pass resolved account
        replyToMessageId: messageId,
        mspBotsAgentId: mspBotsContext.agentId, // Pass dynamic agentId
        mspBotsAppId: mspBotsContext.appId, // Pass dynamic appId
        taskId: payload.taskId, // Pass taskId if available
    });

    // 6. Dispatch! (分发给 AI)
    try {
        console.log(`[MSPBots] Dispatching to agent...`);
        const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
            ctx: ctxPayload,
            cfg,
            dispatcher,
            replyOptions,
        });
        
        markDispatchIdle();
        console.log(`[MSPBots] Dispatch complete. Queued=${queuedFinal}, Replies=${counts.final}`);
    } catch (err) {
        console.error(`[MSPBots] Dispatch failed:`, err);
    }
}
