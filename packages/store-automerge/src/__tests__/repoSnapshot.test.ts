import { expect, test } from "bun:test";
import { Repo } from "@automerge/automerge-repo";
import { RepoPerTaskDocuments } from "../repoPerTaskDocuments.js";

test("document snapshots traverse numeric list indices, including scheduler weights", async () => {
  const repo = new Repo({ network: [] });
  const documents = new RepoPerTaskDocuments(repo);
  try {
    const data = {
      scheduler: { weights: [0.2, 1.3, 2.1], nested: [[1, 2], [3]] },
    };
    const created = await documents.create(data);
    expect(created.snapshot.data).toEqual(data);
    expect(created.snapshot.conflictCount).toBe(0);
    expect((await documents.read(created.url))?.data).toEqual(data);
  } finally {
    await documents.close();
    await repo.shutdown();
  }
});
