import "isomorphic-fetch";

const HOST = "http://localhost:5001/metabook-system/us-central1";

type Args = { authorization?: { token: string } } & (
  | { method: "GET" }
  | { method: "POST"; json: any }
  | { method: "PATCH"; json: any }
);

export async function fetchRoute(
  path: string,
  args: Args = { method: "GET", authorization: undefined },
) {
  const result = await fetch(`${HOST}${path}`, {
    method: args.method,
    body: "json" in args ? JSON.stringify(args.json) : null,
    headers: {
      ...("json" in args && {
        "Content-Type": "application/json",
      }),
      ...(args.authorization && {
        Authorization: `Token ${args.authorization.token}`,
      }),
    },
  });
  // helper to avoid having this boilerplate unwrapping within the tests
  let body: any = undefined;
  try {
    body = await result.json();
  } catch {}
  return { status: result.status, body };
}
