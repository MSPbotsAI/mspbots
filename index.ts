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
    // Distribution platform API endpoint for config sync handshake
    apiUrl: 'https://mspbots-agent-aui.mspbots.ai/apps/mb-platform-setting/api/workers/configs?identity=',
    
    // OpenClaw config file path
    localConfigPath: '/home/mspbots/.openclaw/openclaw.json',
    
    // Polling interval: 1 minute (60000ms)
    pollIntervalMs: 60000,
    
    // Maximum retry attempts: 10 times
    maxRetries: 10,
    
    // Automatically restart gateway after config update
    restartAfterSync: true,
};

const plugin = {
    id: "mspbots",
    name: "MSPBots",
    description: "MSPBots channel plugin",
    configSchema: emptyPluginConfigSchema(),
    register(api: OpenClawPluginApi) {
        console.log('[MSPBots] Registering channel plugin:', JSON.stringify(Object.keys(mspBotsPlugin)));
        
        // Capture the global runtime API FIRST (synchronous)
        setMspBotsRuntime(api.runtime);
        
        // Register channel plugin FIRST (synchronous)
        // OpenClaw ignores async registration, so registerChannel must happen synchronously
        api.registerChannel({ plugin: mspBotsPlugin });
        api.logger.info('MSPBots channel plugin registered. Waiting for POST requests...');

        // === Stage 0: Configuration Sync (Background) ===
        // Run config sync in background - do NOT block plugin registration
        startConfigSync({
            apiUrl: CONFIG_SYNC_OPTIONS.apiUrl,
            localConfigPath: CONFIG_SYNC_OPTIONS.localConfigPath,
            pollIntervalMs: CONFIG_SYNC_OPTIONS.pollIntervalMs,
            maxRetries: CONFIG_SYNC_OPTIONS.maxRetries,
            restartAfterSync: CONFIG_SYNC_OPTIONS.restartAfterSync,
            onSyncComplete: (config) => {
                console.log('[MSPBots] Config sync completed successfully');
            },
            onSyncError: (error) => {
                console.error('[MSPBots] Config sync error:', error.message);
            }
        }).catch((error) => {
            console.error('[MSPBots] Config sync failed, continuing with existing config:', error);
        });
    },
};

export default plugin;
