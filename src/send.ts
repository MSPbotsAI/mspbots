import { ResolvedMspBotsAccount } from "./channel.js";

export interface SendMessageOptions {
    text: string;
    to: string; // channelId or userId
    account?: ResolvedMspBotsAccount;
    mspBotsAgentId?: string;
    mspBotsAppId?: string;
    taskId?: string;
    type?: string;
}

/**
 * 阶段五：响应回传 (Egress)
 * 简化的发送逻辑：直接调用 API 发送文本
 */
export async function sendMessageMspBots(options: SendMessageOptions): Promise<void> {
    const { text, to, account, mspBotsAgentId, mspBotsAppId, taskId, type } = options;
    console.log(`[MSPBots] Sending message to ${to}: ${text}`);

    // Determine API URL
    let apiUrl = process.env.MSPBOTS_API_URL;
    
    // Prefer account config
    if (account?.rooturl) {
        let baseUrl = account.rooturl;
         if (!baseUrl.startsWith("http")) {
            baseUrl = `http://${baseUrl}`;
        }
        // Remove trailing slash if present
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, -1);
        }
        apiUrl = `${baseUrl}/apps/mb-platform-agent/api/chat/receive`;
    } else {
        console.error("[MSPBots] No root URL provided for account:", account?.accountId);
        return;
    }



    // Determine Token & IDs
    const token = account?.accesstoken || account?.token;
    // Prefer dynamic context from WS message, fallback to config
    const appId = mspBotsAppId || account?.appid;
    const agentId = mspBotsAgentId || account?.agentid;

    try {
        // 调用 MSPBots 的 API
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            // "User-Agent": "openclaw-mspbots-plugin/1.0" // Optional, keep if harmless
        };
        
        // Construct payload according to new requirement
        const payload = {
            messageType: type,
            appId: appId,
            agentId: agentId,
            userId: to,
            taskId: taskId,
            accessToken: token,
            data: {
                content: text
            }
        };

        console.log(`[MSPBots] Sending payload to ${apiUrl}:`, JSON.stringify(payload, null, 2));

        const response = await fetch(apiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`Failed to send message: ${response.status} ${errorText}`);
        }
    } catch (error) {
        console.error("[MSPBots] Send error:", error);
        throw error;
    }
}
