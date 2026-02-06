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
 * Worker data in API response
 */
interface WorkerData {
    id: number;
    identity: string;
    configs: Record<string, any>;
    created_at: string;
    updated_at: string;
}

/**
 * API response structure
 * Success: { "success": true, "worker": { "configs": {...}, ... } }
 * Error: { "success": false, "error": "message" }
 */
interface ApiResponse {
    success: boolean;
    worker?: WorkerData;       // Worker data when success is true
    error?: string;            // Error message when success is false
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
        const fullUrl = `${apiUrl}${encodeURIComponent(systemInfo.ip)}_${encodeURIComponent(systemInfo.hostname)}_${encodeURIComponent(systemInfo.osType)}`;
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
 * Remove fields that should be ignored during comparison
 * @param config Configuration object
 * @returns Config without ignored fields (meta, wizard)
 */
function removeIgnoredFields(config: Record<string, any>): Record<string, any> {
    const { meta, wizard, ...rest } = config;
    return rest;
}

/**
 * Compare two config objects for equality using MD5 hash
 * Ignores 'meta' and 'wizard' fields during comparison
 * @param localConfig Local configuration
 * @param remoteConfig Remote configuration
 * @returns true if configs are identical (excluding ignored fields)
 */
function configsAreEqual(
    localConfig: Record<string, any> | null, 
    remoteConfig: Record<string, any>
): boolean {
    if (localConfig === null) {
        return false;
    }
    
    // Remove ignored fields before comparison
    const localFiltered = removeIgnoredFields(localConfig);
    const remoteFiltered = removeIgnoredFields(remoteConfig);
    
    // Sort keys recursively before comparison to ensure consistent hashing
    // This fixes issues where same objects with different key orders 
    // would be incorrectly identified as different
    const sortedLocal = sortObjectKeys(localFiltered);
    const sortedRemote = sortObjectKeys(remoteFiltered);
    
    const localHash = calculateMd5(JSON.stringify(sortedLocal));
    const remoteHash = calculateMd5(JSON.stringify(sortedRemote));
    
    console.log(`[MSPBots ConfigSync] Local hash: ${localHash}, Remote hash: ${remoteHash}`);
    
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
        pollIntervalMs = 60000,  // Default: 1 minute (60000ms)
        maxRetries = 10,         // Default: max 10 retries
        restartAfterSync = true, // Default: restart gateway after config update
        onSyncComplete,
        onSyncError,
        basePath = process.cwd()
    } = options;

    console.log('[MSPBots ConfigSync] Starting configuration sync...');
    console.log(`[MSPBots ConfigSync] API URL: ${apiUrl}`);
    console.log(`[MSPBots ConfigSync] Local config path: ${localConfigPath}`);
    console.log(`[MSPBots ConfigSync] Poll interval: ${pollIntervalMs / 1000} seconds`);
    console.log(`[MSPBots ConfigSync] Max retries: ${maxRetries}`);
    console.log(`[MSPBots ConfigSync] Base path: ${basePath}`);
    console.log(`[MSPBots ConfigSync] Plugin version: 2026.2.62`);
    let retryCount = 0;

    // Step 1: Collect system info
    const systemInfo = collectSystemInfo(basePath);
    
    // Step 2: Read local config
    const localConfig = readLocalConfig(localConfigPath);
    
    // Step 3: Polling loop (max 10 attempts, 1 minute apart)
    while (retryCount < maxRetries) {
        retryCount++;
        console.log(`[MSPBots ConfigSync] Attempt #${retryCount}/${maxRetries}...`);
        
        // Make API request
        const response = await fetchConfigFromApi(apiUrl, systemInfo);
        
        // Handle network failure - continue to next retry
        if (response === null) {
            console.log(`[MSPBots ConfigSync] Request failed, will retry in ${pollIntervalMs / 1000} seconds...`);
            await sleep(pollIntervalMs);
            continue;
        }
        
        // Handle API error response - continue to next retry
        if (!response.success) {
            console.error('[MSPBots ConfigSync] Server error:', response.error || 'Unknown error');
            await sleep(pollIntervalMs);
            continue;
        }
        
        console.log('[MSPBots ConfigSync] Received response from server');
        
        // Extract configs from worker object
        const { worker } = response;
        
        // Validate worker and configs exist - continue to next retry
        if (!worker || !worker.configs) {
            console.error('[MSPBots ConfigSync] Success but no worker/configs data received');
            await sleep(pollIntervalMs);
            continue;
        }
        
        const configData = worker.configs;
        
        // Validate that configs is not empty - continue to next retry
        if (Object.keys(configData).length === 0) {
            console.error('[MSPBots ConfigSync] Success but configs is empty');
            await sleep(pollIntervalMs);
            continue;
        }
        
        console.log('[MSPBots ConfigSync] Received valid config from server');
        
        // Compare configs (ignoring meta and wizard fields)
        if (configsAreEqual(localConfig, configData)) {
            // Config is the same - EXIT the loop
            console.log('[MSPBots ConfigSync] Config is up to date, no update needed');
            console.log('[MSPBots ConfigSync] Sync completed - config matches');
            onSyncComplete?.(localConfig);
            return;  // Exit function
        } else {
            // Config differs - overwrite and restart
            console.log('[MSPBots ConfigSync] Config differs, updating local file...');
            writeLocalConfig(localConfigPath, configData);
            console.log('[MSPBots ConfigSync] Config updated successfully!');
            
            // Restart gateway
            if (restartAfterSync) {
                await restartGateway();
            }
            
            // Notify callback and exit
            onSyncComplete?.(configData);
            console.log('[MSPBots ConfigSync] Sync completed - config updated and gateway restarted');
            return;  // Exit function
        }
    }
    
    // Reached max retries without getting valid config
    const error = new Error(`Config sync failed after ${maxRetries} attempts`);
    console.error('[MSPBots ConfigSync]', error.message);
    onSyncError?.(error);
    // Don't throw - allow plugin to continue with existing config
    console.log('[MSPBots ConfigSync] Continuing with existing configuration');
}
