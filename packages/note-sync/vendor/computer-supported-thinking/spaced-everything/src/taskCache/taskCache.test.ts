import {
  decodeTaskIDPath,
  encodeTaskIDPath,
  updateTaskCache,
} from "./taskCache";
import { JSONCacheNode, JSONInMemoryCache } from "./JSONCache";
import { TaskSource } from "./taskSource";

type TestTask = { [key: string]: string | null };
type TestTaskCollection = { [key: string]: string | null };

function createMockActivitySource(rootChildren: {
  [key: string]: JSONCacheNode<TestTask, TestTaskCollection>;
}): TaskSource<TestTask, TestTaskCollection> {
  const store = JSONInMemoryCache({
    type: "collection",
    children: rootChildren,
    value: {},
  });

  return {
    performOperations: (continuation) =>
      store.performOperations((session) =>
        continuation({
          ...session,
          isCacheHit: (cache, test) =>
            (cache.value["modificationDate"] || {}) ===
            (test.value["modificationDate"] || {}),
        })
      ),
  };
}

describe("cache reconciliation", () => {
  async function reconcile(
    cacheRootChildren: {
      [key: string]: JSONCacheNode<TestTask, TestTaskCollection>;
    },
    sourceRootChildren: {
      [key: string]: JSONCacheNode<TestTask, TestTaskCollection>;
    },
    expectEqual: boolean = true
  ) {
    const testCache = JSONInMemoryCache({
      type: "collection",
      children: cacheRootChildren,
      value: { label: null },
    });

    const activitySource = createMockActivitySource(sourceRootChildren);

    await updateTaskCache(testCache, activitySource);
    if (expectEqual) {
      expect(testCache.rootNode.children).toEqual(sourceRootChildren);
    } else {
      expect(testCache.rootNode.children).not.toEqual(sourceRootChildren);
    }
  }

  test("basic addition", async () => {
    await reconcile(
      {},
      {
        a: {
          type: "collection",
          children: {
            b: { type: "task", value: { label: null } },
          },
          value: {},
        },
      }
    );
  });

  test("basic deletion", async () => {
    await reconcile(
      {
        a: {
          type: "collection",
          children: {
            b: { type: "task", value: { label: null } },
          },
          value: {},
        },
      },
      {}
    );
  });

  test("basic update", async () => {
    const oldTask = { label: "old" };
    const newTask = { label: "new" };
    await reconcile(
      {
        a: {
          type: "collection",
          children: {
            b: { type: "task", value: oldTask },
          },
          value: {},
        },
      },
      {
        a: {
          type: "collection",
          children: {
            b: { type: "task", value: newTask },
          },
          value: {},
        },
      }
    );
  });

  test("complex update", async () => {
    const oldTask = { label: "old" };
    const newTask = { label: "new" };
    await reconcile(
      {
        a: {
          type: "collection",
          children: {
            b: { type: "task", value: oldTask },
            c: {
              type: "collection",
              children: {
                g: { type: "task", value: { label: null } },
              },
              value: {},
            },
          },
          value: { label: "old" },
        },
      },
      {
        a: {
          type: "collection",
          children: {
            b: { type: "task", value: newTask },
            f: {
              type: "collection",
              children: {
                g: { type: "task", value: { label: null } },
              },
              value: {},
            },
          },
          value: { label: "new" },
        },
      }
    );
  });

  test("move", async () => {
    const oldTask = { label: "old" };
    const newTask = { label: "new" };
    await reconcile(
      {
        a: {
          type: "collection",
          children: {
            c: {
              type: "collection",
              children: {
                g: { type: "task", value: { label: null } },
              },
              value: {},
            },
            d: {
              type: "collection",
              children: {},
              value: {},
            },
          },
          value: { label: "old" },
        },
      },
      {
        a: {
          type: "collection",
          children: {
            c: {
              type: "collection",
              children: {},
              value: {},
            },
            d: {
              type: "collection",
              children: {
                g: { type: "task", value: { label: null } },
              },
              value: {},
            },
          },
          value: { label: "old" },
        },
      }
    );
  });

  test("cache hit", async () => {
    await reconcile(
      {
        a: {
          type: "collection",
          children: {},
          value: { modificationDate: "old" },
        },
      },
      {
        a: {
          type: "collection",
          children: { x: { type: "task", value: {} } },
          value: { modificationDate: "old" },
        },
      },
      false
    );
  });
});

describe("task ID path encoding", () => {
  test("encodes plain paths", () => {
    const input = ["foo.md", "abc"];
    const encoded = encodeTaskIDPath(input);
    expect(encoded).toEqual("foo.md/abc");
    const decoded = decodeTaskIDPath(encoded);
    expect(input).toEqual(decoded);
  });

  test("encodes paths with /", () => {
    const input = ["foo/bar /baz.md", "abc/def"];
    const encoded = encodeTaskIDPath(input);
    expect(encoded).toEqual("foo\\/bar \\/baz.md/abc\\/def");
    const decoded = decodeTaskIDPath(encoded);
    expect(input).toEqual(decoded);
  });
});
