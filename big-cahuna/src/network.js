/** Each browser tab owns a reconnectable seat; only intentions leave the client. */
export class RoomClient {
  constructor(code, name, handlers, startSide = 0) {
    this.code = code;
    this.startSide = startSide;
    this.name = name;
    this.handlers = handlers;
    this.seq = 0;
    this.attempt = 0;
    this.closed = false;
    try {
      this.credentials = JSON.parse(
        sessionStorage.getItem("cahuna-seat-" + code),
      );
    } catch {}
  }
  connect() {
    if (this.closed) return;
    this.handlers.status("Connecting…");
    const ws = (this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${this.code}/socket`,
    ));
    let welcomed = false;
    const timeout = setTimeout(() => ws.close(), 10000);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "join",
          name: this.name,
          startSide: this.startSide,
          credentials: this.credentials,
        }),
      );
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "welcome") {
        clearTimeout(timeout);
        welcomed = true;
        this.attempt = 0;
        this.seq = 0;
        this.credentials = message.credentials;
        try {
          sessionStorage.setItem(
            "cahuna-seat-" + this.code,
            JSON.stringify(this.credentials),
          );
        } catch {}
        this.handlers.status("Connected");
        this.handlers.state(message.state, [], this.credentials.id);
      } else if (message.type === "state" || message.type === "room") {
        this.handlers.state(
          message.state,
          message.events || [],
          this.credentials.id,
        );
      } else if (message.type === "error") {
        this.handlers.error(message.message);
        if (!welcomed) {
          this.closed = true;
          ws.close();
        }
      }
    };
    ws.onclose = ({ code }) => {
      clearTimeout(timeout);
      if (this.closed) return;
      if (
        code === 4001 ||
        code === 1008 ||
        code === 1000 ||
        (!welcomed && ++this.attempt >= 4)
      ) {
        this.closed = true;
        this.handlers.status("Disconnected");
        this.handlers.error(
          code === 4001
            ? "Your seat is open in another tab."
            : "Room unavailable. Return home and try another room.",
        );
        return;
      }
      this.handlers.status("Reconnecting… Your character is stopped.");
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(5000, 500 * 2 ** this.attempt++),
      );
    };
    ws.onerror = () => {};
  }
  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(message));
  }
  input(x, y, navigator) {
    this.send({ type: "input", seq: this.seq++, x, y, navigator });
  }
  leave() {
    this.closed = true;
    clearTimeout(this.retry);
    this.send({ type: "leave" });
    this.ws?.close();
    try {
      sessionStorage.removeItem("cahuna-seat-" + this.code);
    } catch {}
  }
}
export async function createRoom() {
  const response = await fetch("/api/rooms", { method: "POST" });
  if (!response.ok)
    throw new Error("Could not create a room. Please try again.");
  return (await response.json()).code;
}
