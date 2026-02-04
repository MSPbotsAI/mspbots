import {
    createReplyPrefixContext,
    type ClawdbotConfig,
    type RuntimeEnv,
    type ReplyPayload,
} from "openclaw/plugin-sdk";
import { getMspBotsRuntime } from "./runtime.js";
import { sendMessageMspBots } from "./send.js";

import { ResolvedMspBotsAccount } from "./channel.js";

export type CreateMspBotsReplyDispatcherParams = {
    cfg: ClawdbotConfig;
    agentId: string;
    runtime: RuntimeEnv;
    chatId: string;
    replyToMessageId?: string;
    account?: ResolvedMspBotsAccount;
    mspBotsAgentId?: string;
    mspBotsAppId?: string;
};

export function createMspBotsReplyDispatcher(params: CreateMspBotsReplyDispatcherParams) {
    const core = getMspBotsRuntime();
    const { cfg, agentId, chatId, account, mspBotsAgentId, mspBotsAppId } = params;

    const prefixContext = createReplyPrefixContext({
        cfg,
        agentId,
    });

    let messageSent = false;
    
    const { dispatcher, replyOptions, markDispatchIdle } =
        core.channel.reply.createReplyDispatcherWithTyping({
            responsePrefix: prefixContext.responsePrefix,
            responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
            // 简化版：不需要 Human Delay
            humanDelay: { enabled: false }, 
            // 简化版：不需要 Typing Indicator
            onReplyStart: () => {},
            
            deliver: async (payload: ReplyPayload) => {
                const text = payload.text ?? "";
                if (!text.trim() || messageSent) return;

                params.runtime.log?.(`[MSPBots] delivering reply: ${text.slice(0, 50)}...`);

                await sendMessageMspBots({
                    text: text,
                    to: chatId,
                    account,
                    mspBotsAgentId,
                    mspBotsAppId
                });
                
                messageSent = true;
            },
            onError: (err: any, info: any) => {
                params.runtime.error?.(`[MSPBots] ${info.kind} reply failed: ${String(err)}`);
            },
            onIdle: () => {
                messageSent = false;
            },
        });

    return {
        dispatcher,
        replyOptions: {
            ...replyOptions,
            onModelSelected: prefixContext.onModelSelected,
        },
        markDispatchIdle,
    };
}
