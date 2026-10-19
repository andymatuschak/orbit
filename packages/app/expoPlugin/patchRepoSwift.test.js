const { expect, test } = require("bun:test");
const { automergeSyncMaximumMessageBytes } = require("@withorbit/api");
const { patchWebSocketSource, patchRepoSource } = require("./patchRepoSwift");

const source = `        let webSocketTask = URLSession.shared.webSocketTask(with: request)
        webSocketTask.resume()`;

test("sets the shared finite receive budget before starting the upstream socket", () => {
  const patched = patchWebSocketSource(source);
  expect(patched).toContain(
    `webSocketTask.maximumMessageSize = ${automergeSyncMaximumMessageBytes}\n        webSocketTask.resume()`,
  );
  expect(automergeSyncMaximumMessageBytes).toBeGreaterThan(1024 * 1024);
  expect(patchWebSocketSource(patched)).toBe(patched);
});

test("requires review when upstream gains a limit or changes task creation", () => {
  expect(() =>
    patchWebSocketSource(source.replace("URLSession.shared", "session")),
  ).toThrow("review/remove");
  expect(() =>
    patchWebSocketSource(source + "\nwebSocketTask.maximumMessageSize = 1024"),
  ).toThrow("review/remove");
  expect(() => patchWebSocketSource(source + source)).toThrow("review/remove");
});

const repo = `    func addPeerWithMetadata(peer: PEER_ID, metadata: PeerMetadata?) async {
        assert(peer != self.peerId)
        peerMetadataByPeerId[peer] = metadata
        if logLevel(.repo).canTrace() {
            Logger.repo.trace("REPO: \\(self.peerId) adding peer \\(peer)")
        }
        for docId in documentIds() {
            await beginSync(docId: docId, to: peer)
        }
    }`;

test("resets every cached document's connection state before any awaited sync", () => {
  const patched = patchRepoSource(repo);
  expect(patched).toContain(
    "for handle in handles.values {\n            handle.syncStates[peer]?.reset()\n        }",
  );
  expect(patched.indexOf(".reset()")).toBeLessThan(patched.indexOf("await "));
  // Reconnection can leave metadata present, so this must not depend on whether
  // the peer was explicitly removed or on which documents happen to be ready.
  expect(patched.indexOf(".reset()")).toBeLessThan(
    patched.indexOf("peerMetadataByPeerId[peer] = metadata"),
  );
  expect(patchRepoSource(patched)).toBe(patched);
});

test("requires review if the peer lifecycle or reconnect reset changes upstream", () => {
  expect(() =>
    patchRepoSource(
      repo.replace("for docId in documentIds()", "for docId in cachedIds()"),
    ),
  ).toThrow("review/remove");
  expect(() => patchRepoSource(repo + repo)).toThrow("review/remove");
  expect(() =>
    patchRepoSource(repo + "\nhandle.syncStates[peer]?.reset()"),
  ).toThrow("review/remove");
  const patched = patchRepoSource(repo);
  expect(() =>
    patchRepoSource(
      patched.replace(
        "for handle in handles.values",
        "for handle in readyHandles",
      ),
    ),
  ).toThrow("review/remove");
  expect(() => patchRepoSource(patched + patched)).toThrow("review/remove");
});
