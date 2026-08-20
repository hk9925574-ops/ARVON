export interface ClientMessage {
  type: string;
  requestId?: string;
  payload?: any;
}

export interface ServerMessage {
  type: string;
  requestId?: string;
  payload?: any;
}
type MessageHandler = (message: ServerMessage) => void;
type ConnectionHandler = (status: 'connected' | 'disconnected') => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private intentionallyClosed = false;
  
  private pingInterval: any = null;
  private pongTimeout: any = null;
  private readonly PING_RATE_MS = 15000;
  private readonly PONG_TIMEOUT_MS = 60000;

  constructor(url: string) {
    this.url = url;
  }

  public connect() {
    this.intentionallyClosed = false;
    this.createSocket();
  }

  public disconnect() {
    this.intentionallyClosed = true;
    this.clearHeartbeat();
    if (this.ws) {
      this.notifyConnectionHandlers('disconnected');
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private createSocket() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
    }

    const currentWs = new WebSocket(this.url);
    this.ws = currentWs;

    currentWs.onopen = () => {
      if (this.ws !== currentWs) return;
      console.log('[WebSocket] Connected');
      this.reconnectAttempts = 0;
      this.notifyConnectionHandlers('connected');
      this.startHeartbeat();
    };

    currentWs.binaryType = 'arraybuffer';
    currentWs.onmessage = (event) => {
      if (this.ws !== currentWs) return;
      if (event.data instanceof ArrayBuffer) {
        this.notifyMessageHandlers({ type: 'audio_stream_chunk', payload: event.data });
        return;
      }
      try {
        const message: ServerMessage = JSON.parse(event.data);
        if (message.type === 'pong') {
           this.handlePong();
           return;
        }
        this.notifyMessageHandlers(message);
      } catch (err) {
        console.error('[WebSocket] Error parsing message:', err);
      }
    };

    currentWs.onclose = () => {
      if (this.ws !== currentWs) return;
      console.log('[WebSocket] Disconnected');
      this.ws = null;
      this.clearHeartbeat();
      this.notifyConnectionHandlers('disconnected');
      if (!this.intentionallyClosed) {
        this.attemptReconnect();
      }
    };

    currentWs.onerror = (error) => {
      if (this.ws !== currentWs) return;
      console.error('[WebSocket] Error:', error);
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectAttempts++;
      console.log(`[WebSocket] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        if (!this.intentionallyClosed) {
          this.createSocket();
        }
      }, delay);
    } else {
      console.error('[WebSocket] Max reconnect attempts reached. Giving up.');
    }
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        this.pongTimeout = setTimeout(() => {
          console.error('[WebSocket] Pong timeout. Connection is dead. Closing...');
          this.ws?.close(); // Will trigger onclose and reconnect
        }, this.PONG_TIMEOUT_MS);
      }
    }, this.PING_RATE_MS);
  }

  private handlePong() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private clearHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.pingInterval = null;
    this.pongTimeout = null;
  }

  public send(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('[WebSocket] Cannot send message: Not connected');
    }
  }

  public onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  private notifyMessageHandlers(message: ServerMessage) {
    this.messageHandlers.forEach(handler => handler(message));
  }

  private notifyConnectionHandlers(status: 'connected' | 'disconnected') {
    this.connectionHandlers.forEach(handler => handler(status));
  }
}

export const wsService = new WebSocketService('ws://localhost:8080');
