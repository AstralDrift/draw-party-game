import type { ClientMessage, Role, ServerMessage } from './protocol';
import { isServerMessage } from './protocol';

interface SocketOptions {
  role: Role;
  clientId: string;
  sessionToken: string;
  roomCode?: string;
  hostToken?: string;
  onOpen: () => void;
  onClose: () => void;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: string) => void;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const INACTIVITY_TIMEOUT_MS = 45_000;
const RESUME_TIMEOUT_MS = 5_000;

export class GameSocket {
  private ws: WebSocket | null = null;
  private heartbeat = 0;
  private watchdog = 0;
  private resumeProbe = 0;

  constructor(private readonly options: SocketOptions) {}

  connect(): void {
    this.close();
    const url = new URL('/ws', window.location.href);
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('role', this.options.role);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('sessionToken', this.options.sessionToken);
    if (this.options.roomCode) {
      url.searchParams.set('room', this.options.roomCode);
    }
    if (this.options.hostToken) {
      url.searchParams.set('hostToken', this.options.hostToken);
    }

    this.options.onStatus('Connecting');
    const socket = new WebSocket(url);
    this.ws = socket;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('online', this.probeConnection);
    // A connection that never opens must be recoverable too.
    this.armWatchdog();
    socket.addEventListener('open', () => {
      if (this.ws !== socket) return;
      this.options.onStatus('Connected');
      this.startHeartbeat();
      this.options.onOpen();
    });
    socket.addEventListener('message', (event) => {
      if (this.ws !== socket) return;
      try {
        const payload: unknown = JSON.parse(String(event.data));
        if (isServerMessage(payload)) {
          this.clearResumeProbe();
          this.armWatchdog();
          this.options.onMessage(payload);
        }
      } catch {
        this.options.onStatus('Received invalid server message');
      }
    });
    socket.addEventListener('close', (event) => {
      this.disconnect(socket, event.code !== 4001);
    });
    socket.addEventListener('error', () => {
      if (this.ws === socket) {
        this.options.onStatus('Connection error');
      }
    });
  }

  send(message: ClientMessage): boolean {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    const socket = this.ws;
    this.ws = null;
    this.stopMonitoring();
    socket?.close();
  }

  private disconnect(socket: WebSocket, reconnect = true): void {
    if (this.ws !== socket) return;
    // Invalidate before close: native close/message events may arrive much later.
    this.close();
    this.options.onStatus('Disconnected');
    if (reconnect) this.options.onClose();
  }

  private startHeartbeat(): void {
    this.heartbeat = window.setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    const socket = this.ws;
    if (!socket || document.visibilityState === 'hidden') return;
    this.watchdog = window.setTimeout(() => {
      this.disconnect(socket);
    }, INACTIVITY_TIMEOUT_MS);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.clearWatchdog();
      this.clearResumeProbe();
    } else {
      this.probeConnection();
    }
  };

  private readonly probeConnection = (): void => {
    const socket = this.ws;
    if (!socket || document.visibilityState === 'hidden' || this.resumeProbe) return;
    this.clearWatchdog();
    this.resumeProbe = window.setTimeout(() => {
      this.disconnect(socket);
    }, RESUME_TIMEOUT_MS);
    this.send({ type: 'heartbeat' });
  };

  private clearWatchdog(): void {
    window.clearTimeout(this.watchdog);
    this.watchdog = 0;
  }

  private clearResumeProbe(): void {
    window.clearTimeout(this.resumeProbe);
    this.resumeProbe = 0;
  }

  private stopMonitoring(): void {
    window.clearInterval(this.heartbeat);
    this.heartbeat = 0;
    this.clearWatchdog();
    this.clearResumeProbe();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('online', this.probeConnection);
  }
}
