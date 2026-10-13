import {
  cbor,
  type Message,
  type PeerId,
} from "@automerge/automerge-repo/slim";
import type { HostedSyncCredential } from "@withorbit/api";
import { describe, expect, test } from "bun:test";
import {
  AuthenticatedWebSocketNetworkAdapter,
  type BrowserWebSocketFactory,
} from "./AuthenticatedWebSocketNetworkAdapter.js";

describe("authenticated WebSocket Repo adapter", () => {
  test("sends admission before Repo bytes and refreshes paired credentials on reconnect", async () => {
    const factory = new FakeWebSocketFactory();
    let credentialCount = 0;
    const adapter = new AuthenticatedWebSocketNetworkAdapter(
      "wss://sync.example.test/v1/sync",
      async () => credential(++credentialCount),
      { retryIntervalMillis: 1, webSocketFactory: factory },
    );
    adapter.connect("client-peer" as PeerId, {
      storageId: "client-storage" as never,
    });
    await eventually(() => factory.sockets.length === 1);
    const first = factory.sockets[0];
    first.open();
    expect(first.sent).toHaveLength(1);
    expect(JSON.parse(String(first.sent[0]))).toMatchObject({
      type: "orbit-sync-admission",
      token: "paired-1",
    });

    first.receive(
      JSON.stringify({
        type: "orbit-sync-admission-accepted",
        protocolVersion: 1,
      }),
    );
    expect(first.sent[1]).toBeInstanceOf(ArrayBuffer);
    expect(
      cbor.decode(new Uint8Array(first.sent[1] as ArrayBuffer)),
    ).toMatchObject({
      type: "join",
      senderId: "client-peer",
    });
    first.receive(
      encoded({
        type: "peer",
        senderId: "server-peer",
        targetId: "client-peer",
        peerMetadata: { storageId: "server-storage" },
        selectedProtocolVersion: "1",
      } as unknown as Message),
    );
    await adapter.whenReady();
    expect(adapter.isReady()).toBe(true);
    expect(adapter.remoteStorageID).toBe("server-storage" as never);

    first.remoteClose();
    await eventually(() => factory.sockets.length === 2);
    const second = factory.sockets[1];
    second.open();
    expect(JSON.parse(String(second.sent[0])).token).toBe("paired-2");
    expect(credentialCount).toBe(2);
    adapter.disconnect();
  });

  test("refuses a peer whose storage ID changes on reconnect", async () => {
    const factory = new FakeWebSocketFactory();
    const adapter = new AuthenticatedWebSocketNetworkAdapter(
      "wss://sync.example.test/v1/sync",
      async () => credential(1),
      { retryIntervalMillis: 1, webSocketFactory: factory },
    );
    adapter.connect("client-peer" as PeerId);
    await eventually(() => factory.sockets.length === 1);
    const socket = factory.sockets[0];
    socket.open();
    socket.receive(
      JSON.stringify({
        type: "orbit-sync-admission-accepted",
        protocolVersion: 1,
      }),
    );
    socket.receive(
      encoded({
        type: "peer",
        senderId: "server-peer",
        targetId: "client-peer",
        peerMetadata: { storageId: "server-storage" },
        selectedProtocolVersion: "1",
      } as unknown as Message),
    );
    await adapter.whenReady();
    socket.remoteClose();
    await eventually(() => factory.sockets.length === 2);
    const replacement = factory.sockets[1];
    replacement.open();
    replacement.receive(
      JSON.stringify({
        type: "orbit-sync-admission-accepted",
        protocolVersion: 1,
      }),
    );
    replacement.receive(
      encoded({
        type: "peer",
        senderId: "server-peer",
        targetId: "client-peer",
        peerMetadata: { storageId: "attacker-storage" },
        selectedProtocolVersion: "1",
      } as unknown as Message),
    );
    expect(replacement.closeCalls).toBe(1);
    expect(adapter.isReady()).toBe(false);
    adapter.disconnect();
  });
});

class FakeWebSocketFactory implements BrowserWebSocketFactory {
  readonly sockets: FakeWebSocket[] = [];

  create() {
    const socket = new FakeWebSocket();
    this.sockets.push(socket);
    return socket as unknown as WebSocket;
  }
}

class FakeWebSocket extends EventTarget {
  binaryType = "blob";
  readyState = 0;
  readonly sent: unknown[] = [];
  closeCalls = 0;

  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }

  send(value: unknown) {
    this.sent.push(value);
  }

  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  close() {
    this.closeCalls++;
    this.remoteClose();
  }

  remoteClose() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

function credential(index: number): HostedSyncCredential {
  return {
    kind: "pairedToken",
    token: `paired-${index}`,
  };
}

function encoded(message: Message) {
  const bytes = cbor.encode(message);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

async function eventually(predicate: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out awaiting fake WebSocket state");
}
