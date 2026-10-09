import {
  NetworkAdapter,
  cbor,
  type Message,
  type PeerId,
  type PeerMetadata,
  type StorageId,
} from "@automerge/automerge-repo/slim";
import type {
  HostedSyncAdmissionAcceptedFrame,
  HostedSyncAdmissionFrame,
  HostedSyncCredential,
} from "@withorbit/api";

interface PeerMessage extends Message {
  type: "peer";
  peerMetadata: PeerMetadata;
  selectedProtocolVersion: "1";
}

interface ErrorMessage extends Message {
  type: "error";
  message: string;
}

export interface BrowserWebSocketFactory {
  create(url: string): WebSocket;
}

const defaultWebSocketFactory: BrowserWebSocketFactory = {
  create: (url) => new WebSocket(url),
};

const webSocketConnecting = 0;
const webSocketOpen = 1;

/**
 * Browser Repo adapter which authenticates with a Firebase ID token before
 * sending any Automerge protocol bytes. Every reconnect requests a fresh token
 * from the authenticated view realm.
 */
export class AuthenticatedWebSocketNetworkAdapter extends NetworkAdapter {
  private socket: WebSocket | null = null;
  private credential: HostedSyncCredential | null = null;
  private remotePeerId: PeerId | null = null;
  private _remoteStorageID: StorageId | null = null;
  private admitted = false;
  private disconnected = false;
  private connectionGeneration = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;

  constructor(
    private readonly websocketURL: string,
    private readonly requestCredential: () => Promise<HostedSyncCredential>,
    private readonly options: {
      retryIntervalMillis?: number;
      webSocketFactory?: BrowserWebSocketFactory;
    } = {},
  ) {
    super();
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  isReady() {
    return this.ready;
  }

  whenReady() {
    return this.readyPromise;
  }

  get remoteStorageID() {
    return this._remoteStorageID;
  }

  connect(peerId: PeerId, peerMetadata: PeerMetadata = {}) {
    if (this.peerId && this.peerId !== peerId) {
      throw new Error("Cannot reconnect an adapter under a different peer ID");
    }
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    this.disconnected = false;
    this.open();
  }

  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.connectionGeneration++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.credential = null;
    this.admitted = false;
    this.ready = false;
    if (socket) {
      this.removeSocketListeners(socket);
      socket.close();
    }
    if (this.remotePeerId) {
      this.emit("peer-disconnected", { peerId: this.remotePeerId });
      this.remotePeerId = null;
    }
  }

  send(message: Message) {
    if (!this.admitted || this.socket?.readyState !== webSocketOpen) return;
    if (message.data?.byteLength === 0) {
      throw new Error("Cannot send an empty Automerge message");
    }
    this.socket.send(toArrayBuffer(cbor.encode(message)));
  }

  private open() {
    const generation = ++this.connectionGeneration;
    this.closeCurrentSocket();
    void this.requestCredential()
      .then((credential) => {
        if (this.disconnected || generation !== this.connectionGeneration) {
          return;
        }
        this.credential = credential;
        const factory =
          this.options.webSocketFactory ?? defaultWebSocketFactory;
        const socket = factory.create(this.websocketURL);
        socket.binaryType = "arraybuffer";
        this.socket = socket;
        socket.addEventListener("open", this.onOpen);
        socket.addEventListener("message", this.onMessage);
        socket.addEventListener("close", this.onClose);
        socket.addEventListener("error", this.onError);
      })
      .catch(() => this.scheduleReconnect(generation));
  }

  private onOpen = () => {
    const socket = this.socket;
    const credential = this.credential;
    if (!socket || !credential) return;
    const frame: HostedSyncAdmissionFrame = {
      type: "orbit-sync-admission",
      protocolVersion: 1,
      firebaseIDToken: credential.token,
    };
    socket.send(JSON.stringify(frame));
  };

  private onMessage = (event: MessageEvent) => {
    if (!this.admitted) {
      let accepted: HostedSyncAdmissionAcceptedFrame;
      try {
        accepted = decodeAdmissionAccepted(event.data);
      } catch {
        this.socket?.close();
        return;
      }
      void accepted;
      this.admitted = true;
      this.sendJoin();
      return;
    }
    if (!(event.data instanceof ArrayBuffer)) {
      this.socket?.close();
      return;
    }
    let message: unknown;
    try {
      message = cbor.decode(new Uint8Array(event.data));
    } catch {
      this.socket?.close();
      return;
    }
    if (!isRecord(message) || typeof message.type !== "string") {
      this.socket?.close();
      return;
    }
    if (message.type === "peer") {
      const peer = message as unknown as PeerMessage;
      const storageID = peer.peerMetadata?.storageId;
      if (
        typeof peer.senderId !== "string" ||
        !isRecord(peer.peerMetadata) ||
        typeof storageID !== "string" ||
        storageID.length === 0 ||
        (this._remoteStorageID !== null && this._remoteStorageID !== storageID)
      ) {
        this.socket?.close();
        return;
      }
      this._remoteStorageID = storageID as StorageId;
      this.remotePeerId = peer.senderId;
      this.ready = true;
      this.resolveReady?.();
      this.resolveReady = null;
      this.emit("peer-candidate", {
        peerId: peer.senderId,
        peerMetadata: peer.peerMetadata,
      });
      return;
    }
    if (message.type === "error") {
      void (message as unknown as ErrorMessage);
      this.socket?.close();
      return;
    }
    this.emit("message", message as Message);
  };

  private onClose = () => {
    const generation = this.connectionGeneration;
    const peer = this.remotePeerId;
    this.closeCurrentSocket();
    this.ready = false;
    if (peer) {
      this.remotePeerId = null;
      this.emit("peer-disconnected", { peerId: peer });
    }
    this.scheduleReconnect(generation);
  };

  private onError = () => {};

  private sendJoin() {
    const socket = this.socket;
    if (!socket || socket.readyState !== webSocketOpen || !this.peerId) return;
    socket.send(
      toArrayBuffer(
        cbor.encode({
          type: "join",
          senderId: this.peerId,
          peerMetadata: this.peerMetadata ?? {},
          supportedProtocolVersions: ["1"],
        }),
      ),
    );
  }

  private scheduleReconnect(generation: number) {
    if (this.disconnected || generation !== this.connectionGeneration) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disconnected) this.open();
    }, this.options.retryIntervalMillis ?? 5_000);
  }

  private closeCurrentSocket() {
    const socket = this.socket;
    this.socket = null;
    this.credential = null;
    this.admitted = false;
    if (socket) {
      this.removeSocketListeners(socket);
      if (
        socket.readyState === webSocketOpen ||
        socket.readyState === webSocketConnecting
      ) {
        socket.close();
      }
    }
  }

  private removeSocketListeners(socket: WebSocket) {
    socket.removeEventListener("open", this.onOpen);
    socket.removeEventListener("message", this.onMessage);
    socket.removeEventListener("close", this.onClose);
    socket.removeEventListener("error", this.onError);
  }
}

function decodeAdmissionAccepted(
  value: unknown,
): HostedSyncAdmissionAcceptedFrame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new Error("Malformed Orbit Sync admission response");
  }
  if (
    !isRecord(parsed) ||
    parsed.type !== "orbit-sync-admission-accepted" ||
    parsed.protocolVersion !== 1 ||
    Object.keys(parsed).some(
      (key) => !["type", "protocolVersion"].includes(key),
    )
  ) {
    throw new Error("Invalid Orbit Sync admission response");
  }
  return parsed as unknown as HostedSyncAdmissionAcceptedFrame;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
