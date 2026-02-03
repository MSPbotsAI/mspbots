import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { mspBotsPlugin } from "./src/channel.js";
import { setMspBotsRuntime } from "./src/runtime.js";

console.log('[[MSPBots]] index.ts loaded - Plugin initialization started');

const plugin = {
    id: "mspbots",
    name: "MSPBots",
    description: "MSPBots channel plugin",
    configSchema: emptyPluginConfigSchema(),
    register(api: OpenClawPluginApi) {
        console.log('[MSPBots] Registering channel plugin:', JSON.stringify(Object.keys(mspBotsPlugin)));
        
        // Capture the global runtime API
        setMspBotsRuntime(api.runtime);
        
        api.registerChannel({ plugin: mspBotsPlugin });
        api.logger.info('MSPBots channel plugin registered. Waiting for POST requests...');

        // MANUAL DEBUG START
        /*
        setTimeout(() => {
            console.log('[MSPBots] MANUAL DEBUG: Attempting to start account manually...');
            const mockCtx = {
                account: {
                    accountId: 'manual-debug',
                    token: 'manual-token',
                    enabled: true,
                    name: 'Manual Debug'
                },
                log: {
                    info: (msg) => console.log(`[MSPBots Manual] INFO: ${msg}`),
                    warn: (msg) => console.warn(`[MSPBots Manual] WARN: ${msg}`),
                    error: (msg) => console.error(`[MSPBots Manual] ERROR: ${msg}`),
                    debug: (msg) => console.log(`[MSPBots Manual] DEBUG: ${msg}`)
                },
                runtime: {
                    ingest: (msg) => console.log(`[MSPBots Manual] INGEST: ${JSON.stringify(msg)}`)
                }
            };
            
            try {
                if (mspBotsPlugin.gateway && mspBotsPlugin.gateway.startAccount) {
                     mspBotsPlugin.gateway.startAccount(mockCtx);
                } else {
                    console.error('[MSPBots] gateway.startAccount is missing!');
                }
            } catch (e) {
                console.error('[MSPBots] Manual start failed:', e);
            }
        }, 5000);
        */
    },
};

export default plugin;
