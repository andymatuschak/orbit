import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { HostedSyncAdmissionAcceptedFrame } from "@withorbit/api";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { bearerToken, pairedTokenMatches } from "../auth/pairing.js";

/** Authentication ends here; admitted sockets use Repo's ordinary wire protocol. */
export class AuthenticatedWebSocketRouter {
  readonly socketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
    perMessageDeflate: false,
  });
  private accepted = 0;
  private rejected = 0;
  private inboundBytes = 0;

  constructor(
    private readonly token: string,
    private readonly allowedOrigins: ReadonlySet<string>,
    private readonly isDraining: () => boolean,
  ) {}

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(request.url ?? "/", "http://lab.invalid");
    const native = request.headers.authorization !== undefined;
    const origin = request.headers.origin;
    if (
      url.pathname !== "/v1/sync" ||
      url.search ||
      this.isDraining() ||
      this.socketServer.clients.size >= 16 ||
      (origin ? !this.allowedOrigins.has(origin) : !native) ||
      (native &&
        !pairedTokenMatches(
          bearerToken(request.headers.authorization),
          this.token,
        ))
    ) {
      this.rejected++;
      socket.end(
        "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    this.socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.on("error", () => undefined);
      if (native) this.admit(webSocket, request);
      else this.awaitAdmission(webSocket, request);
    });
  }

  metrics() {
    return {
      activeSockets: this.socketServer.clients.size,
      acceptedSockets: this.accepted,
      rejectedSockets: this.rejected,
      inboundBytes: this.inboundBytes,
    };
  }

  close() {
    for (const socket of this.socketServer.clients) socket.terminate();
    this.socketServer.close();
  }

  private awaitAdmission(socket: WebSocket, request: IncomingMessage) {
    const timeout = setTimeout(() => reject(), 5000);
    timeout.unref();
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
    };
    const reject = () => {
      cleanup();
      this.rejected++;
      socket.close(1008, "admission rejected");
    };
    const onMessage = (data: RawData, binary: boolean) => {
      try {
        if (binary || byteLength(data) > 4096) return reject();
        const frame = JSON.parse(data.toString());
        if (
          !frame ||
          frame.type !== "orbit-sync-admission" ||
          frame.protocolVersion !== 1 ||
          Object.keys(frame).some(
            (key) => !["type", "protocolVersion", "token"].includes(key),
          ) ||
          !pairedTokenMatches(frame.token, this.token)
        )
          return reject();
        cleanup();
        // Repo can immediately send CBOR. Its acknowledgment must follow this JSON frame.
        const accepted: HostedSyncAdmissionAcceptedFrame = {
          type: "orbit-sync-admission-accepted",
          protocolVersion: 1,
        };
        socket.send(JSON.stringify(accepted));
        this.admit(socket, request);
      } catch {
        reject();
      }
    };
    socket.on("message", onMessage);
    socket.once("close", cleanup);
  }

  private admit(socket: WebSocket, request: IncomingMessage) {
    this.accepted++;
    socket.on("message", (data: RawData) => {
      this.inboundBytes += byteLength(data);
    });
    this.socketServer.emit("connection", socket, request);
  }
}

function byteLength(data: RawData): number {
  return Array.isArray(data)
    ? data.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    : data.byteLength;
}
