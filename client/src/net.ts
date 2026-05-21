import type { ClientMessage, Role, ServerMessage } from './protocol';
import { isServerMessage } from './protocol';

interface SocketOptions {
  role: Role;
  clientId: string;
  roomCode?: string;
  hostToken?: string;
  onOpen: () => void;
  onClose: () => void;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: string) => void;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private heartbeat = 0;
  private closedByUser = false;

  constructor(private readonly options: SocketOptions) {}

  connect(): void {
    this.closedByUser = false;
    const url = new URL('/ws', window.location.href);
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('role', this.options.role);
    url.searchParams.set('client_id', this.options.clientId);
    if (this.options.roomCode) {
      url.searchParams.set('room', this.options.roomCode);
    }
    if (this.options.hostToken) {
      url.searchParams.set('hostToken', this.options.hostToken);
    }

    this.options.onStatus('Connecting');
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => {
      this.options.onStatus('Connected');
      this.options.onOpen();
      this.startHeartbeat();
    });
    this.ws.addEventListener('message', (event) => {
      try {
        const payload: unknown = JSON.parse(String(event.data));
        if (isServerMessage(payload)) {
          this.options.onMessage(payload);
        }
      } catch {
        this.options.onStatus('Received invalid server message');
      }
    });
    this.ws.addEventListener('close', () => {
      this.options.onStatus('Disconnected');
      this.stopHeartbeat();
      if (!this.closedByUser) {
        this.options.onClose();
      }
    });
    this.ws.addEventListener('error', () => {
      this.options.onStatus('Connection error');
    });
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.closedByUser = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, 15_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = 0;
    }
  }
}
