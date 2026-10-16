const { expect, test } = require("bun:test");
const { automergeSyncMaximumMessageBytes } = require("@withorbit/api");
const { patchSource } = require("./patchRepoSwiftWebSocket");

const source = `        let webSocketTask = URLSession.shared.webSocketTask(with: request)
        webSocketTask.resume()`;

test("sets the shared finite receive budget before starting the upstream socket", () => {
  const patched = patchSource(source);
  expect(patched).toContain(
    `webSocketTask.maximumMessageSize = ${automergeSyncMaximumMessageBytes}\n        webSocketTask.resume()`,
  );
  expect(automergeSyncMaximumMessageBytes).toBeGreaterThan(1024 * 1024);
  expect(patchSource(patched)).toBe(patched);
});

test("requires review when upstream gains a limit or changes task creation", () => {
  expect(() =>
    patchSource(source.replace("URLSession.shared", "session")),
  ).toThrow("review/remove");
  expect(() =>
    patchSource(source + "\nwebSocketTask.maximumMessageSize = 1024"),
  ).toThrow("review/remove");
  expect(() => patchSource(source + source)).toThrow("review/remove");
});
