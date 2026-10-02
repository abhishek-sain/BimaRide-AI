import { WS_BASE_URL } from "../api/config";

export interface LiveLocationMessage {
  lat: number;
  lon: number;
  speed_kmh?: number;
}

export interface CrashAlertMessage {
  alert_id?: string;
  kind?: string;
  trip_id?: string;
  rider_name?: string;
  lat?: number | null;
  lon?: number | null;
  speed_kmh?: number | null;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;

/**
 * Thin wrapper around the trip's live-location WebSocket. The rider's side
 * calls `send()`; the contact's side uses `onMessage`/`onCrashAlert` — the
 * backend ignores anything a contact's socket sends, so there's no separate
 * "receive-only" variant, just different usage.
 *
 * Reconnects automatically (1s, 2s, 4s … capped at 10s) until `close()` is
 * called. A phone loses its socket constantly — Wi-Fi hand-off, a brief
 * signal drop, the OS suspending a backgrounded app — and without this the
 * live location would silently stop for the rest of the ride.
 */
export class LiveLocationSocket {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private tripId: string,
    private token: string,
    private handlers: {
      onMessage?: (msg: LiveLocationMessage) => void;
      onCrashAlert?: (msg: CrashAlertMessage) => void;
      onRideEnded?: () => void;
      onOpen?: () => void;
      onClose?: (code: number) => void;
      onError?: (e: unknown) => void;
    } = {}
  ) {}

  connect() {
    this.closedByUs = false;
    this.open();
  }

  private open() {
    const url = `${WS_BASE_URL}/ws/trip/${this.tripId}?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      this.attempts = 0;
      this.handlers.onOpen?.();
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "location") this.handlers.onMessage?.(data);
        else if (data.type === "crash_alert") this.handlers.onCrashAlert?.(data);
        else if (data.type === "ride_ended") this.handlers.onRideEnded?.();
      } catch (e) {
        console.warn("Malformed live-location message:", e);
      }
    };
    ws.onerror = (e) => this.handlers.onError?.(e);
    ws.onclose = (event) => {
      this.handlers.onClose?.(event.code);
      // 44xx = the server deliberately refused us (bad token, unknown trip,
      // not an accepted contact). Retrying can't fix that, so don't.
      const refused = event.code >= 4400 && event.code < 4500;
      if (!this.closedByUs && !refused) this.scheduleReconnect();
    };

    this.ws = ws;
  }

  private scheduleReconnect() {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempts, RECONNECT_MAX_MS);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closedByUs) this.open();
    }, delay);
  }

  send(location: LiveLocationMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(location));
    }
  }

  close() {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
