import { AnyJson } from "../util/JSONTypes";
import { getItemAtPath } from "../util/tests/getItemAtPath";
import {
  JSONCacheCollectionNode,
  JSONCacheNode,
  JSONInMemoryCache,
} from "./JSONCache";
import { TaskCache, TaskIDPath } from "./taskCache";

type TestTask = { [key: string]: AnyJson };
type TestTaskCollection = { [key: string]: AnyJson };

let testCache: TaskCache<TestTask, TestTaskCollection>;

function getMockActivitySourceNodeAtPath(
  path: TaskIDPath,
  activitySourceRootNode: JSONCacheCollectionNode<TestTask, TestTaskCollection>,
): JSONCacheNode<TestTask, TestTaskCollection> | null {
  return path.reduce(
    (node: JSONCacheNode<TestTask, TestTaskCollection> | null, component) => {
      if (node === null) {
        return null;
      } else if (node.type === "collection") {
        return node.children[component] || null;
      } else {
        throw new Error("Unexpectedly encountered task node in mock cache");
      }
    },
    activitySourceRootNode,
  );
}

beforeEach(() => {
  testCache = JSONInMemoryCache({
    type: "collection",
    children: {},
    value: { color: null },
  });
});

describe("mock cache", () => {
  test("fetching bare task", async () => {
    const testTask = {};
    testCache = JSONInMemoryCache({
      type: "collection",
      children: { a: { type: "task", value: testTask } },
      value: {},
    });
    await testCache.performOperations(async (session) => {
      const result = (await getItemAtPath(["a"], session))!;
      expect(result.type === "task" && result.value).toBe(testTask);
    });
  });

  test("fetching contained task", async () => {
    const testTask = {};
    testCache = JSONInMemoryCache({
      type: "collection",
      children: {
        a: {
          type: "collection",
          value: {},
          children: { b: { type: "task", value: testTask } },
        },
      },
      value: {},
    });
    await testCache.performOperations(async (session) => {
      const collectionResult = (await getItemAtPath(["a"], session))!;
      expect(
        collectionResult.type === "collection" && collectionResult.childIDs,
      ).toEqual(new Set(["b"]));

      const childResult = (await getItemAtPath(["a", "b"], session))!;
      expect(childResult.type === "task" && childResult.value).toBe(testTask);
    });
  });

  test("inserting task", async () => {
    await testCache.performOperations(async (session) => {
      const testTask = {};
      await session.writeChanges([
        {
          type: "insert",
          path: ["a"],
          record: {
            type: "collection",
            childIDs: new Set(["b"]),
            value: { color: "red" },
          },
        },
        {
          type: "insert",
          path: ["a", "b"],
          record: { type: "task", value: testTask },
        },
      ]);

      const parentNode = (await getItemAtPath(["a"], session))!;
      expect(parentNode).toBeTruthy();
      if (parentNode.type === "task") {
        fail("Unexpected task");
      }
      expect(parentNode.value.color).toBe("red");
      expect(parentNode.childIDs).toEqual(new Set(["b"]));

      const childNode = (await getItemAtPath(["a", "b"], session))!;
      expect(childNode).toEqual({ type: "task", value: testTask });
    });
  });

  test("deleting task", async () => {
    testCache = JSONInMemoryCache({
      type: "collection",
      children: {
        a: {
          type: "collection",
          value: { color: "blue" },
          children: { b: { type: "task", value: {} } },
        },
      },
      value: {},
    });

    await testCache.performOperations(async (session) => {
      await session.writeChanges([
        {
          type: "delete",
          path: ["a", "b"],
        },
      ]);

      const parentNode = (await getItemAtPath(["a"], session))!;
      expect(parentNode).toBeTruthy();
      expect(parentNode.type === "collection" && parentNode.value.color).toBe(
        "blue",
      );
      expect(await getItemAtPath(["a", "b"], session)).toBeNull();
    });
  });

  test("updating task", async () => {
    const oldTask = {};
    const newTask = {};
    testCache = JSONInMemoryCache({
      type: "collection",
      children: {
        a: {
          type: "collection",
          value: { color: "blue" },
          children: { b: { type: "task", value: oldTask } },
        },
      },
      value: {},
    });

    await testCache.performOperations(async (session) => {
      await session.writeChanges([
        {
          type: "update",
          path: ["a", "b"],
          record: { type: "task", value: newTask },
        },
      ]);

      const parentNode = (await getItemAtPath(["a"], session))!;
      expect(parentNode).toBeTruthy();

      const childNode = (await getItemAtPath(["a", "b"], session))!;
      expect(childNode.type === "task" && childNode.value).toBe(newTask);
    });
  });
});
