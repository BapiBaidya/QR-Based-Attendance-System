import type { WSEnvelope, AttendanceMarkedPayload, SessionEndedPayload, ConnectionAckPayload } from '../types';

export type WSConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR';

type EventListener<T = any> = (data: T, envelope: WSEnvelope<T>) => void;

export class SessionWebSocketService {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private token: string;
  private statusListeners: Set<(status: WSConnectionStatus) => void> = new Set();
  private listeners: Map<string, Set<EventListener>> = new Map();
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private isExplicitlyClosed = false;
  private retryCount = 0;
  private maxRetries = 10;

  constructor(sessionId: string, token: string) {
    this.sessionId = sessionId;
    this.token = token;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.notifyStatus(this.retryCount > 0 ? 'RECONNECTING' : 'CONNECTING');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/ws/sessions/${this.sessionId}?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.retryCount = 0;
        this.notifyStatus('CONNECTED');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope: WSEnvelope = JSON.parse(event.data);
          this.dispatchEvent(envelope.event, envelope.data, envelope);
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err, event.data);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WebSocket] Error occurred:', err);
        this.notifyStatus('ERROR');
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.ws = null;

        if (this.isExplicitlyClosed) {
          this.notifyStatus('DISCONNECTED');
          return;
        }

        // Reconnect policy: 4001/4003/4004/4005 are terminal server rejections
        if (event.code >= 4000 && event.code < 4010) {
          console.warn(`[WebSocket] Terminating on server close code ${event.code}: ${event.reason}`);
          this.notifyStatus('ERROR');
          return;
        }

        if (this.retryCount < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(1.5, this.retryCount), 15000);
          this.retryCount++;
          this.notifyStatus('RECONNECTING');
          this.reconnectTimeout = window.setTimeout(() => {
            this.connect();
          }, backoff);
        } else {
          this.notifyStatus('DISCONNECTED');
        }
      };
    } catch (err) {
      console.error('[WebSocket] Connection initialization failed:', err);
      this.notifyStatus('ERROR');
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
    this.notifyStatus('DISCONNECTED');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ event: 'ping' }));
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // Event Subscription
  public on<T = any>(event: string, listener: EventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  public onAttendanceMarked(callback: (data: AttendanceMarkedPayload) => void): () => void {
    return this.on('attendance.marked', callback);
  }

  public onSessionEnded(callback: (data: SessionEndedPayload) => void): () => void {
    return this.on('session.ended', callback);
  }

  public onSessionConnected(callback: (data: ConnectionAckPayload) => void): () => void {
    return this.on('session.connected', callback);
  }

  public onStatusChange(listener: (status: WSConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatus(status: WSConnectionStatus): void {
    this.statusListeners.forEach((listener) => listener(status));
  }

  private dispatchEvent(event: string, data: any, envelope: WSEnvelope): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data, envelope));
    }
  }
}
