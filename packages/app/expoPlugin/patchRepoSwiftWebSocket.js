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

function patchSource(source) {
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

if (require.main === module) {
  const checkout = process.argv[2];
  if (!checkout)
    throw new Error("Pass the resolved automerge-repo-swift checkout");
  const filename = path.join(
    checkout,
    "Sources/AutomergeRepo/Networking/Providers/WebSocketProvider.swift",
  );
  const source = fs.readFileSync(filename, "utf8");
  const patched = patchSource(source);
  if (patched !== source) {
    fs.chmodSync(filename, fs.statSync(filename).mode | 0o200);
    fs.writeFileSync(filename, patched);
  }
  console.log(
    `Repo Swift WebSocket receive limit: ${automergeSyncMaximumMessageBytes} bytes`,
  );
}

module.exports = { patchSource };
