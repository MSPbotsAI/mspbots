import {
    buildChannelConfigSchema, 
    DEFAULT_ACCOUNT_ID,
    deleteAccountFromConfigSection,
    normalizeAccountId,
    setAccountEnabledInConfigSection,
    type ChannelPlugin,
} from "openclaw/plugin-sdk";
import { monitorMspBotsProvider } from "./monitor.js";
import { sendMessageMspBots } from "./send.js";

console.log('[[MSPBots]] channel.ts loaded - Module scope executed');

const MspBotsConfigSchema = {
    toJSONSchema: () => ({
        type: "object",
        properties: {
            rooturl: { type: "string" },
            accesstoken: { type: "string" },
            agentid: { type: "string" },
            appid: { type: "string" },
            enabled: { type: "boolean" },
        },
        required: ["rooturl", "accesstoken"],
        additionalProperties: true
    })
};

// Locally defined types since they are not in the SDK
export interface ResolvedMspBotsAccount {
    accountId: string;
    name?: string;
    // Old field
    token?: string; 
    // New fields
    rooturl?: string;
    accesstoken?: string;
    agentid?: string;
    appid?: string;
    
    enabled: boolean;
    tokenSource?: string;
    config: any;
}

export const mspBotsPlugin: ChannelPlugin<ResolvedMspBotsAccount> = {
    id: "mspbots",
    meta: {
        icon: "robot",
        label: "MSPBots",
        description: "Connect to MSPBots via chat",
    },
    capabilities: {
        chatTypes: ["direct"], // Minimal chat support
        nativeCommands: true,
    },
    configSchema: buildChannelConfigSchema(MspBotsConfigSchema),
    config: {
        listAccountIds: (cfg) => {
            console.log(`[MSPBots] listAccountIds called. Returning hardcoded default.`);
            return ["default"];
        },
        resolveAccount: (cfg, accountId) => {
            // Debug log to trace config resolution
            console.log(`[MSPBots] Resolving account ${accountId}`, JSON.stringify(cfg.channels?.mspbots?.accounts?.[accountId]));
            const acc = cfg.channels?.mspbots?.accounts?.[accountId] ?? {};

            let rooturl = acc.rooturl;
            if (rooturl && !rooturl.startsWith("http") && !rooturl.startsWith("ws")) {
                rooturl = `https://${rooturl}`;
            }
            console.log(`[MSPBots] Resolved account rooturl`, rooturl);
            // If accesstoken is present, default to enabled unless explicitly disabled
            const hasToken = Boolean(acc.accesstoken?.trim());
            const enabled = acc.enabled ?? hasToken;
            console.log(`[MSPBots] Resolved account acc`, JSON.stringify(acc));
            
            return {
                accountId,
                name: acc.name,
                token: acc.accesstoken || acc.token, // Fallback for backward compatibility if needed, or just map accesstoken
                rooturl,
                accesstoken: acc.accesstoken,
                agentid: acc.agentid,
                appid: acc.appid,
                enabled: enabled,
                tokenSource: "config",
                config: acc,
            };
        },
        defaultAccountId: (cfg) => "default",
        setAccountEnabled: ({ cfg, accountId, enabled }) =>
            setAccountEnabledInConfigSection({
                cfg,
                sectionKey: "mspbots",
                accountId,
                enabled,
                allowTopLevel: true,
            }),
        deleteAccount: ({ cfg, accountId }) =>
            deleteAccountFromConfigSection({
                cfg,
                sectionKey: "mspbots",
                accountId,
                clearBaseFields: ["accesstoken", "rooturl", "agentid", "appid", "token", "name"],
            }),
        isConfigured: (account) => Boolean(account.accesstoken?.trim()),
        describeAccount: (account) => ({
            accountId: account.accountId,
            name: account.name,
            enabled: account.enabled,
            configured: Boolean(account.accesstoken?.trim()),
            tokenSource: account.tokenSource,
        }),
    },
    setup: {
        resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
        validateInput: ({ accountId, input }) => {
            if (!input.accesstoken) {
                return "MSPBots requires an accesstoken.";
            }
            if (!input.rooturl) {
                return "MSPBots requires a rooturl.";
            }
            return null;
        },
        applyAccountConfig: ({ cfg, accountId, input }) => {
            return {
                ...cfg,
                channels: {
                    ...cfg.channels,
                    mspbots: {
                        ...cfg.channels?.mspbots,
                        accounts: {
                            ...cfg.channels?.mspbots?.accounts,
                            [accountId]: {
                                enabled: true,
                                accesstoken: input.accesstoken,
                                rooturl: input.rooturl,
                                agentid: input.agentid,
                                appid: input.appid
                            }
                        }
                    }
                }
            };
        }
    },
    outbound: {
        deliveryMode: "direct",
        sendText: async (params) => {
            const { to, text, accountId } = params;
            // Try to extract account from params if available (common in OpenClaw SDK)
            const account = (params as any).account as ResolvedMspBotsAccount | undefined;
            
            await sendMessageMspBots({ text, to, account });
            return { channel: "mspbots", sent: true, messageId: "mock-" + Date.now() };
        },
    },
    gateway: {
        startAccount: async (ctx) => {
            console.log(`[MSPBots] startAccount called`);
            
            const account = ctx.account;
            const token = account.accesstoken?.trim();
            const rootUrl = account.rooturl?.trim();

            ctx.log?.info(`[${account.accountId}] starting MSPBots provider (Standalone Mode)`);
            console.log(`[MSPBots] Token present: ${Boolean(token)}, RootURL: ${rootUrl}`);

            if (!token) {
                ctx.log?.warn(`[${account.accountId}] No accesstoken provided, skipping connection.`);
                return { close: () => { } };
            }
            
            if (!rootUrl) {
                ctx.log?.warn(`[${account.accountId}] No rooturl provided, skipping connection.`);
                return { close: () => { } };
            }

            // 使用重构后的 Monitor 模块 (Stage 1: Ingress)
            return monitorMspBotsProvider(ctx);
        },
    },
};
