// 定义一个我们需要的 Runtime 类型接口
// 为了灵活性，我们使用 any 来覆盖 SDK 的复杂类型
export interface PluginRuntime {
    channel: {
        routing: {
            resolveAgentRoute: (params: any) => any;
        };
        reply: {
            resolveEnvelopeFormatOptions: (cfg: any) => any;
            formatAgentEnvelope: (params: any) => string;
            finalizeInboundContext: (params: any) => any;
            createReplyDispatcherWithTyping: (params: any) => any;
            resolveHumanDelayConfig: (cfg: any, agentId: string) => any;
            dispatchReplyFromConfig: (params: any) => Promise<any>;
        };
        [key: string]: any;
    };
    system: {
        enqueueSystemEvent: (text: string, params: any) => void;
    };
    [key: string]: any;
}

let runtime: any | null = null;

export function setMspBotsRuntime(next: any) {
    runtime = next;
}

export function getMspBotsRuntime(): PluginRuntime {
    if (!runtime) {
        throw new Error("MSPBots runtime not initialized");
    }
    return runtime;
}
