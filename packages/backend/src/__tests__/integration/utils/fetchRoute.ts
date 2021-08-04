import "isomorphic-fetch";

const HOST = "http://localhost:5001/metabook-system/us-central1";

type Args = { authorization?: { token: string }; followRedirects?: boolean } & (
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
    redirect: args.followRedirects === false ? "manual" : "follow",
  });
  // helper to avoid having this boilerplate unwrapping within the tests
  let body: any = undefined;
  try {
    body = await result.json();
  } catch {}
  return { status: result.status, body, headers: result.headers };
}
