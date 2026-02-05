import { handleMspBotsMessage } from "./bot.js";
import WebSocket from "ws";
import { EventEmitter } from "events";

/**
 * WebSocket Client for MSPBots
 */
class MspbotsWSClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private apiKey: string;
    private wsUrl: string;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pingTimer: NodeJS.Timeout | null = null;
    private isClosed = false;

    constructor(apiKey: string, wsUrl: string) {
        super();
        this.apiKey = apiKey;
        this.wsUrl = wsUrl;
    }

    private sendPing() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log("[MSPBots] Sending ping");
            this.ws.send(JSON.stringify({ type: "ping" }));
        }
    }

    connect() {
        if (this.isClosed) return;

        // Ensure URL has token
        // Use '&' if query params exist, otherwise '?'
        const separator = this.wsUrl.includes('?') ? '&' : '?';
        // Use accessToken parameter as requested, falling back to apiKey (token)
        const url = `${this.wsUrl}${separator}accessToken=${this.apiKey}`;
        
        console.log(`[MSPBots] Connecting to WebSocket: ${this.wsUrl}`);

        try {
            this.ws = new WebSocket(url);

            this.ws.on("open", () => {
                console.log("[MSPBots] WebSocket connected");
                this.emit("open");
                
                // Start ping timer
                this.pingTimer = setInterval(() => {
                    this.sendPing();
                }, 30000); // 30 seconds
            });

            this.ws.on("message", (data) => {
                try {
                    const text = data.toString();
                    const event = JSON.parse(text);

                    // Handle heartbeat
                    if (event.type === "ping") {
                        this.ws?.send(JSON.stringify({ type: "pong" }));
                        return;
                    }

                    // console.log("[MSPBots] Received message:", JSON.stringify(event, null, 2));
                    this.emit("message", event);
                } catch (err) {
                    console.error("[MSPBots] Error parsing WebSocket message:", err);
                }
            });

            this.ws.on("error", (err) => {
                console.error("[MSPBots] WebSocket error:", err);
                this.emit("error", err);
            });

            this.ws.on("close", (code, reason) => {
                console.log(`[MSPBots] WebSocket closed: ${code} ${reason}`);
                this.scheduleReconnect();
            });
        } catch (err) {
            console.error("[MSPBots] Failed to create WebSocket connection:", err);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.isClosed) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);

        console.log("[MSPBots] Reconnecting in 5s...");
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, 5000);
    }

    close() {
        this.isClosed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

/**
 * 阶段一：监听与接收 (Ingress)
 * 建立 WebSocket 连接监听消息
 */
export function monitorMspBotsProvider(ctx: any) {
    const accountId = ctx.account.accountId;
    // Prefer accesstoken, fallback to token
    const token = ctx.account.accesstoken || ctx.account.token; 
    const rootUrl = ctx.account.rooturl;
    
    console.log(`[MSPBots] Monitor started for account: ${accountId}`);

    // Determine WS URL
    let wsUrl: string;
    if (rootUrl) {
        // Simple heuristic: if no protocol, assume ws:// for local IP or wss:// otherwise?
        // Let's just assume ws:// if it looks like an IP or localhost, or respect protocol if present.
        let baseUrl = rootUrl;
        if (!baseUrl.startsWith("http") && !baseUrl.startsWith("ws")) {
            baseUrl = `ws://${baseUrl}`;
        } else if (baseUrl.startsWith("http")) {
            baseUrl = baseUrl.replace(/^http/, "ws");
        }
        
        // Remove trailing slash if present
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, -1);
        }
        
        wsUrl = `${baseUrl}/ws/openclaw`;
    } else {
        console.error("[MSPBots] No root URL provided for account:", accountId);
        return;
    }

    const wsClient = new MspbotsWSClient(token, wsUrl);

    wsClient.on("message", async (data) => {
        // 接收消息 (Receive)
        if (data) {
            console.log(`[MSPBots] Received WebSocket message:`, JSON.stringify(data, null, 2));
            // Filter out internal system messages
            if (data.type === 'connection') {
                return;
            }

            // 收到消息后，移交给处理阶段
            await handleMspBotsMessage({
                cfg: ctx.config || ctx.cfg, // 确保能取到 config
                payload: data,
                accountId,
                account: ctx.account, // Pass resolved account
                runtime: ctx.runtime
            });

        }
    });

    // 防止未捕获的 error 事件导致进程崩溃
    wsClient.on("error", (err) => {
        console.error(`[MSPBots] WebSocket Client Error (handled):`, err);
    });

    wsClient.connect();

    // 返回清理函数 (用于断开连接)
    return {
        close: () => {
            console.log(`[MSPBots] Monitor stopped for account: ${accountId}`);
            wsClient.close();
        }
    };
}
