/**
 * System Info Collector for MSPBots Plugin
 * Collects Linux system information for API handshake
 */

import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * System information structure for API handshake
 */
export interface SystemInfo {
    ip: string;            // Local IP address (non-internal IPv4)
    hostname: string;      // Machine hostname
    osType: string;        // OS type (linux/darwin/win32)
    osVersion: string;     // OS version
    osArch: string;        // CPU architecture
    pluginVersion: string; // Plugin version from package.json
    timestamp: number;     // Report timestamp
}

/**
 * Get the first non-internal IPv4 address
 * @returns Local IP address or 'unknown' if not found
 */
function getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    let localIp = 'unknown';
    
    // Iterate interfaces and find first non-internal IPv4 address
    for (const name of Object.keys(interfaces)) {
        const netInfo = interfaces[name];
        if (!netInfo) continue;
        
        for (const info of netInfo) {
            // Filter: not internal, IPv4 only
            if (!info.internal && info.family === 'IPv4') {
                localIp = info.address;
                return localIp;
            }
        }
    }
    
    return localIp;
}

/**
 * Read plugin version from package.json
 * @param basePath Base path to search for package.json
 * @returns Plugin version string or 'unknown'
 */
function getPluginVersion(basePath: string): string {
    let version = 'unknown';
    
    try {
        const packageJsonPath = path.resolve(basePath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            version = packageJson.version || 'unknown';
        }
    } catch (error) {
        console.error('[MSPBots SystemInfo] Failed to read package.json:', error);
    }
    
    return version;
}

/**
 * Collect current system information
 * @param basePath Base path for plugin (to find package.json)
 * @returns SystemInfo object with all collected data
 */
export function collectSystemInfo(basePath: string = process.cwd()): SystemInfo {
    const info: SystemInfo = {
        ip: getLocalIp(),
        hostname: os.hostname(),
        osType: os.platform(),
        osVersion: os.release(),
        osArch: os.arch(),
        pluginVersion: getPluginVersion(basePath),
        timestamp: Date.now(),
    };
    
    console.log('[MSPBots SystemInfo] Collected:', JSON.stringify(info, null, 2));
    
    return info;
}
