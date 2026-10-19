const fs = require("node:fs");
const path = require("node:path");
const { automergeSyncMaximumMessageBytes } = require("@withorbit/api");

// Repo Swift 0.3.2 does not expose URLSession's receive limit. Its 1 MiB default
// rejects our catalog before Automerge sees it. Keep upstream's transport; remove
// this patch when WebSocketProvider supports configuring maximumMessageSize.
// https://github.com/automerge/automerge-repo-swift/blob/0.3.2/Sources/AutomergeRepo/Networking/Providers/WebSocketProvider.swift
const anchor =
  "let webSocketTask = URLSession.shared.webSocketTask(with: request)";
const setting = `webSocketTask.maximumMessageSize = ${automergeSyncMaximumMessageBytes}`;
const replacement = `${anchor}\n        ${setting}`;

function patchWebSocketSource(source) {
  if (
    source.includes(replacement) &&
    source.split("maximumMessageSize").length === 2
  )
    return source;
  if (
    source.split(anchor).length !== 2 ||
    source.includes("maximumMessageSize")
  )
    throw new Error(
      "Repo Swift WebSocketProvider changed; review/remove the receive-limit patch",
    );
  return source.replace(anchor, replacement);
}

// SyncState contains connection-specific in-flight bookkeeping. Repo Swift
// 0.3.2 reuses it after reconnecting, so a lost message can stay "already sent"
// forever. Reset before starting *any* document sync on the new connection.
// A WebSocket .ready event means a completed handshake, including reconnections
// that have not emitted peerDisconnect. Do not gate this on peers() membership.
const peerConnection = `    func addPeerWithMetadata(peer: PEER_ID, metadata: PeerMetadata?) async {
        assert(peer != self.peerId)
        peerMetadataByPeerId[peer] = metadata
        if logLevel(.repo).canTrace() {
            Logger.repo.trace("REPO: \\(self.peerId) adding peer \\(peer)")
        }
        for docId in documentIds() {
            await beginSync(docId: docId, to: peer)
        }
    }`;
const resetStates = `        // A new connection cannot reuse in-flight sync bookkeeping.
        for handle in handles.values {
            handle.syncStates[peer]?.reset()
        }
`;
const newPeerConnection = peerConnection.replace(
  "        peerMetadataByPeerId[peer] = metadata",
  `${resetStates}        peerMetadataByPeerId[peer] = metadata`,
);

function patchRepoSource(source) {
  const reset = "handle.syncStates[peer]?.reset()";
  if (source.includes(newPeerConnection) && source.split(reset).length === 2)
    return source;
  if (source.split(peerConnection).length !== 2 || source.includes(reset))
    throw new Error(
      "Repo Swift peer lifecycle changed; review/remove the reconnect-state patch",
    );
  return source.replace(peerConnection, newPeerConnection);
}

if (require.main === module) {
  const checkout = process.argv[2];
  if (!checkout)
    throw new Error("Pass the resolved automerge-repo-swift checkout");
  for (const [relative, patch] of [
    [
      "Sources/AutomergeRepo/Networking/Providers/WebSocketProvider.swift",
      patchWebSocketSource,
    ],
    ["Sources/AutomergeRepo/Repo.swift", patchRepoSource],
  ]) {
    const filename = path.join(checkout, relative);
    const source = fs.readFileSync(filename, "utf8");
    const patched = patch(source);
    if (patched !== source) {
      fs.chmodSync(filename, fs.statSync(filename).mode | 0o200);
      fs.writeFileSync(filename, patched);
    }
  }
  console.log(
    `Repo Swift: ${automergeSyncMaximumMessageBytes}-byte WebSocket receive limit and fresh reconnect sync states`,
  );
}

module.exports = { patchWebSocketSource, patchRepoSource };
