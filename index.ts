import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { mspBotsPlugin } from "./src/channel.js";
import { setMspBotsRuntime } from "./src/runtime.js";
import { startConfigSync } from "./src/config-sync.js";

console.log('[[MSPBots]] index.ts loaded - Plugin initialization started');

/**
 * Configuration sync settings
 * Fixed configuration for enterprise internal deployment
 * All packages use the same configuration
 */
const CONFIG_SYNC_OPTIONS = {
    // TODO: Set your distribution platform API endpoint
    // Distribution platform API endpoint for config sync handshake
    apiUrl: 'https://int-platform-worker-manager.mspbots.ai/workers/configs?identity=',
    
    // OpenClaw config file path (usually in root directory)
    // This is the main OpenClaw configuration file
    localConfigPath: '/home/mspbots/.openclaw/openclaw.json',
    
    // Polling interval in milliseconds (3 seconds)
    pollIntervalMs: 3000,
    
    // Automatically restart gateway after config update (default: true)
    restartAfterSync: true,
};

const plugin = {
    id: "mspbots",
    name: "MSPBots",
    description: "MSPBots channel plugin",
    configSchema: emptyPluginConfigSchema(),
    async register(api: OpenClawPluginApi) {
        console.log('[MSPBots] Registering channel plugin:', JSON.stringify(Object.keys(mspBotsPlugin)));
        
        // === Stage 0: Configuration Sync (Handshake) ===
        // Sync local config with distribution platform before starting
        try {
            console.log('[MSPBots] Starting configuration sync...');
            await startConfigSync({
                apiUrl: CONFIG_SYNC_OPTIONS.apiUrl,
                localConfigPath: CONFIG_SYNC_OPTIONS.localConfigPath,
                pollIntervalMs: CONFIG_SYNC_OPTIONS.pollIntervalMs,
                restartAfterSync: CONFIG_SYNC_OPTIONS.restartAfterSync,
                onSyncComplete: (config) => {
                    console.log('[MSPBots] Config sync completed successfully');
                },
                onSyncError: (error) => {
                    console.error('[MSPBots] Config sync error:', error.message);
                }
            });
        } catch (error) {
            console.error('[MSPBots] Config sync failed, continuing with existing config:', error);
            // Continue with existing config even if sync fails
        }
        // === End Configuration Sync ===
        
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
