import { resetLocalEmulators } from "../emulators.js";
import { setupAccessCode } from "../firebaseTesting.js";
import { fetchRoute } from "./utils/fetchRoute.js";

beforeEach(async () => {
  await resetLocalEmulators();
  await setupAccessCode("test");
});

async function consumeAccessCode(accessCode: string) {
  return await fetchRoute(`/api/internal/auth/consumeAccessCode`, {
    method: "GET",
    authorization: { token: accessCode },
  });
}

describe("/internal/auth/consumeAccessCode", () => {
  test("returns a login token for valid access code", async () => {
    const { status, body } = await consumeAccessCode("test");
    expect(status).toBe(200);
    expect(body).toMatch(/.+/); // i.e. to be a non-empty string
  });

  test("fails when no authorization is provided", async () => {
    const { status, body } = await fetchRoute(
      `/api/internal/auth/consumeAccessCode`,
      {
        method: "GET",
      },
    );
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });

  test("fails when consuming an already-consumed code", async () => {
    await consumeAccessCode("test");
    const { status, body } = await consumeAccessCode("test");
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });

  test("fails when consuming a non-existent code", async () => {
    const { status, body } = await consumeAccessCode("test2");
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });

  test("fails when consuming an expired code", async () => {
    await setupAccessCode(
      "testExpired",
      "testUserID",
      {},
      new Date(Date.now() - 1000),
    );
    const { status, body } = await consumeAccessCode("testExpired");
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });
});

describe("/internal/auth/personalAccessTokens", () => {
  test("creates PAT from access code", async () => {
    const { status, body } = await fetchRoute(
      `/api/internal/auth/personalAccessTokens`,
      {
        method: "POST",
        json: {},
        authorization: { token: "test" },
      },
    );
    expect(status).toBe(200);
    expect(body.token).toMatch(/.+/); // i.e. to be a non-empty string

    // Personal access tokens can be used repeatedly.
    expect((await consumeAccessCode(body.token)).status).toBe(200);
    expect((await consumeAccessCode(body.token)).status).toBe(200);
  });

  test("fails without auth", async () => {
    const { status, body } = await fetchRoute(
      `/api/internal/auth/personalAccessTokens`,
      {
        method: "POST",
        json: {},
      },
    );
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });

  test("fails with invalid auth", async () => {
    const { status, body } = await fetchRoute(
      `/api/internal/auth/personalAccessTokens`,
      {
        method: "POST",
        json: {},
        authorization: { token: "invalid" },
      },
    );
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });
});
