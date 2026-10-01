import { WS_BASE_URL } from "../api/config";

export interface LiveLocationMessage {
  lat: number;
  lon: number;
  speed_kmh?: number;
}

/**
 * Thin wrapper around the trip's live-location WebSocket. The rider's side
 * calls `send()`; the contact's side only ever calls `onMessage`/`onClose`
 * — the backend ignores anything a contact's socket sends, so there's no
 * separate "receive-only" variant needed here, just different usage.
 */
export class LiveLocationSocket {
  private ws: WebSocket | null = null;

  constructor(
    private tripId: string,
    private token: string,
    private handlers: {
      onMessage?: (msg: LiveLocationMessage) => void;
      onOpen?: () => void;
      onClose?: (code: number) => void;
      onError?: (e: unknown) => void;
    } = {}
  ) {}

  connect() {
    const url = `${WS_BASE_URL}/ws/trip/${this.tripId}?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);

    ws.onopen = () => this.handlers.onOpen?.();
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "location") this.handlers.onMessage?.(data);
      } catch (e) {
        console.warn("Malformed live-location message:", e);
      }
    };
    ws.onerror = (e) => this.handlers.onError?.(e);
    ws.onclose = (event) => this.handlers.onClose?.(event.code);

    this.ws = ws;
  }

  send(location: LiveLocationMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(location));
    }
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}
