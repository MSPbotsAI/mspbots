/**
 * Config Sync Module for MSPBots Plugin
 * Handles configuration synchronization with distribution platform
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { collectSystemInfo, type SystemInfo } from './system-info.js';

const execAsync = promisify(exec);

/**
 * Configuration sync options
 */
export interface ConfigSyncOptions {
    apiUrl: string;             // Distribution platform API endpoint
    localConfigPath: string;    // Local JSON config file path
    pollIntervalMs?: number;    // Polling interval in milliseconds (default: 3000)
    maxRetries?: number;        // Maximum retry count (optional, default: unlimited)
    restartAfterSync?: boolean; // Whether to restart gateway after config update (default: true)
    onSyncComplete?: (config: any) => void; // Callback when sync completes
    onSyncError?: (error: Error) => void;   // Callback on error
    basePath?: string;          // Base path for plugin (for system info)
}

/**
 * API response structure
 * Success: { "success": true, ...config_fields }
 * Error: { "success": false, "error": "message" }
 */
interface ApiResponse {
    success: boolean;
    error?: string;            // Error message when success is false
    [key: string]: any;        // Config fields when success is true
}

/**
 * Calculate MD5 hash of a string
 * @param content String content to hash
 * @returns MD5 hash string
 */
function calculateMd5(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Recursively sort object keys to ensure consistent JSON stringification
 * This fixes the issue where same objects with different key orders 
 * would produce different MD5 hashes
 * @param obj Object to sort
 * @returns Object with sorted keys (recursively)
 */
function sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    
    const sortedObj: Record<string, any> = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    
    return sortedObj;
}

/**
 * Read local config file
 * @param configPath Path to local config file
 * @returns Parsed JSON object or null if file doesn't exist
 */
function readLocalConfig(configPath: string): Record<string, any> | null {
    try {
        if (!fs.existsSync(configPath)) {
            console.log('[MSPBots ConfigSync] Local config file does not exist:', configPath);
            return null;
        }
        
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('[MSPBots ConfigSync] Failed to read local config:', error);
        return null;
    }
}

/**
 * Write config to local file
 * @param configPath Path to local config file
 * @param config Configuration object to write
 */
function writeLocalConfig(configPath: string, config: Record<string, any>): void {
    try {
        // Ensure directory exists
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write to temp file first, then rename for atomic operation
        const tempPath = configPath + '.tmp';
        const content = JSON.stringify(config, null, 2);
        
        fs.writeFileSync(tempPath, content, 'utf-8');
        fs.renameSync(tempPath, configPath);
        
        console.log('[MSPBots ConfigSync] Config written successfully:', configPath);
    } catch (error) {
        console.error('[MSPBots ConfigSync] Failed to write config:', error);
        throw error;
    }
}

/**
 * Make API request to distribution platform
 * GET request with IP as identity parameter
 * @param apiUrl API base URL (should end with ?identity=)
 * @param systemInfo System information (IP is used)
 * @returns API response or null on network error
 */
async function fetchConfigFromApi(
    apiUrl: string, 
    systemInfo: SystemInfo
): Promise<ApiResponse | null> {
    try {
        // Build URL with IP as identity parameter
        const fullUrl = `${apiUrl}${encodeURIComponent(systemInfo.ip)}`;
        console.log(`[MSPBots ConfigSync] Fetching config from: ${fullUrl}`);
        
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            console.error('[MSPBots ConfigSync] API request failed:', response.status, response.statusText);
            return null;
        }
        
        const data = await response.json() as ApiResponse;
        return data;
    } catch (error) {
        console.error('[MSPBots ConfigSync] Network error:', error);
        return null;
    }
}

/**
 * Compare two config objects for equality using MD5 hash
 * @param localConfig Local configuration
 * @param remoteConfig Remote configuration
 * @returns true if configs are identical
 */
function configsAreEqual(
    localConfig: Record<string, any> | null, 
    remoteConfig: Record<string, any>
): boolean {
    if (localConfig === null) {
        return false;
    }
    
    // Sort keys recursively before comparison to ensure consistent hashing
    // This fixes issues where same objects with different key orders 
    // would be incorrectly identified as different
    const sortedLocal = sortObjectKeys(localConfig);
    const sortedRemote = sortObjectKeys(remoteConfig);
    
    const localHash = calculateMd5(JSON.stringify(sortedLocal));
    const remoteHash = calculateMd5(JSON.stringify(sortedRemote));
    
    return localHash === remoteHash;
}

/**
 * Sleep for specified milliseconds
 * @param ms Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Restart OpenClaw gateway after config update
 * Executes: openclaw gateway restart
 */
async function restartGateway(): Promise<void> {
    console.log('[MSPBots ConfigSync] Restarting OpenClaw gateway...');
    try {
        const { stdout, stderr } = await execAsync('openclaw gateway restart');
        if (stdout) {
            console.log('[MSPBots ConfigSync] Gateway restart output:', stdout.trim());
        }
        if (stderr) {
            console.warn('[MSPBots ConfigSync] Gateway restart stderr:', stderr.trim());
        }
        console.log('[MSPBots ConfigSync] Gateway restart command executed successfully');
    } catch (error) {
        console.error('[MSPBots ConfigSync] Failed to restart gateway:', error);
        // Don't throw - restart failure shouldn't break the sync process
    }
}

/**
 * Main config sync function
 * Initiates the handshake process with distribution platform
 * 
 * @param options Configuration sync options
 * @returns Promise that resolves when sync completes
 */
export async function startConfigSync(options: ConfigSyncOptions): Promise<void> {
    const {
        apiUrl,
        localConfigPath,
        pollIntervalMs = 3000,
        maxRetries,
        restartAfterSync = true,  // Default: restart gateway after config update
        onSyncComplete,
        onSyncError,
        basePath = process.cwd()
    } = options;

    console.log('[MSPBots ConfigSync] Starting configuration sync...');
    console.log(`[MSPBots ConfigSync] API URL: ${apiUrl}`);
    console.log(`[MSPBots ConfigSync] Local config path: ${localConfigPath}`);

    let retryCount = 0;
    let syncComplete = false;

    // Step 1: Collect system info
    const systemInfo = collectSystemInfo(basePath);
    
    // Step 2: Read local config
    let localConfig = readLocalConfig(localConfigPath);
    
    // Step 3: Polling loop
    while (!syncComplete) {
        retryCount++;
        console.log(`[MSPBots ConfigSync] Attempt #${retryCount}...`);
        
        // Check max retries if specified
        if (maxRetries && retryCount > maxRetries) {
            const error = new Error(`Config sync failed after ${maxRetries} retries`);
            console.error('[MSPBots ConfigSync]', error.message);
            onSyncError?.(error);
            throw error;
        }
        
        // Make API request
        const response = await fetchConfigFromApi(apiUrl, systemInfo);
        
        // Handle network failure
        if (response === null) {
            console.log(`[MSPBots ConfigSync] Request failed, retrying in ${pollIntervalMs}ms...`);
            await sleep(pollIntervalMs);
            continue;
        }
        
        // Handle API response based on success field
        if (!response.success) {
            // Error response: { "success": false, "error": "message" }
            console.error('[MSPBots ConfigSync] Server error:', response.error || 'Unknown error');
            await sleep(pollIntervalMs);
            continue;
        }

        syncComplete = true;
        // onSyncComplete?.(localConfig);
        console.log('[MSPBots ConfigSync] Received valid config from server', response);
        
        // Success response: { "success": true, ...config_fields }
        // Extract config by removing the "success" field
        const { success, worker } = response;
        const configData = worker.configs;
        // Validate that we have actual config data
        if (Object.keys(configData).length === 0) {
            console.error('[MSPBots ConfigSync] Success but no config data received');
            await sleep(pollIntervalMs);
            continue;
        }
        
        console.log('[MSPBots ConfigSync] Received valid config from server',);


        
        // // Check if configs are equal
        // if (configsAreEqual(localConfig, configData)) {
        //     console.log('[MSPBots ConfigSync] Config is up to date, no update needed');
        //     syncComplete = true;
        //     onSyncComplete?.(localConfig);
        // } else {
        //     // Write new config to local file (without "success" field)
        //     console.log('[MSPBots ConfigSync] Config differs, updating local file...');
        //     writeLocalConfig(localConfigPath, configData);
        //     console.log('[MSPBots ConfigSync] Config updated successfully!');
            
        //     // Restart gateway if enabled
        //     if (restartAfterSync) {
        //         await restartGateway();
        //     }
            
        //     syncComplete = true;
        //     onSyncComplete?.(configData);
        // }
    }
    
    console.log('[MSPBots ConfigSync] Sync process completed.');
}
