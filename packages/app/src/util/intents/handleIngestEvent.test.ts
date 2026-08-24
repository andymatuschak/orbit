import { OrbitStoreInMemory } from "@withorbit/store-fs";
import { afterEach, beforeEach, expect, it } from "bun:test";
import { handleIngestEvent } from "./handleIngestEvent.js";

let store: OrbitStoreInMemory;

beforeEach(() => {
  store = new OrbitStoreInMemory();
});

afterEach(async () => {
  await store.database.close();
});

it("rejects duplicate item identifiers across sources", async () => {
  const item = {
    identifier: "duplicate-item",
    spec: {
      type: "memory",
      content: {
        type: "qa",
        body: { text: "Question", attachments: [] },
        answer: { text: "Answer", attachments: [] },
      },
    },
  };

  const result = await handleIngestEvent(store, {
    json: JSON.stringify({
      sources: [
        {
          identifier: "source-a",
          title: "Source A",
          items: [item],
        },
        {
          identifier: "source-b",
          title: "Source B",
          items: [item],
        },
      ],
    }),
  });

  expect(result).toEqual({
    status: "permanent-failure",
    message:
      "The selected file contains the item identifier 'duplicate-item' more than once.",
  });
});
