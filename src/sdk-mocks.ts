// Mock implementation of openclaw/plugin-sdk for standalone testing

export const DEFAULT_ACCOUNT_ID = "default";

export function buildChannelConfigSchema(schema: any) {
    return schema;
}

export function normalizeAccountId(accountId: string) {
    return accountId?.toLowerCase().trim() || DEFAULT_ACCOUNT_ID;
}

export function deleteAccountFromConfigSection(params: any) {
    const { cfg, sectionKey, accountId } = params;
    if (cfg.channels?.[sectionKey]?.accounts?.[accountId]) {
        delete cfg.channels[sectionKey].accounts[accountId];
    }
    return cfg;
}

export function setAccountEnabledInConfigSection(params: any) {
    const { cfg, sectionKey, accountId, enabled } = params;
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.channels[sectionKey]) cfg.channels[sectionKey] = {};
    if (!cfg.channels[sectionKey].accounts) cfg.channels[sectionKey].accounts = {};

    if (!cfg.channels[sectionKey].accounts[accountId]) {
        cfg.channels[sectionKey].accounts[accountId] = {};
    }
    cfg.channels[sectionKey].accounts[accountId].enabled = enabled;
    return cfg;
}

export type ChannelPlugin<T> = any; // Simplify type for mock

// Additional mock types for plugin registration
export type OpenClawPluginApi = {
    runtime: any;
    logger: {
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
        debug: (msg: string) => void;
    };
    registerChannel: (options: { plugin: any }) => void;
};

export function emptyPluginConfigSchema() {
    return {
        type: "object",
        properties: {},
        additionalProperties: false
    };
}

export function createReplyPrefixContext(params: any) {
    return {
        responsePrefix: "",
        responsePrefixContextProvider: () => ({}),
        onModelSelected: () => {}
    };
}

export type ClawdbotConfig = any;
export type RuntimeEnv = any;
export type ReplyPayload = {
    text?: string;
    [key: string]: any;
};

