const HOST = "http://127.0.0.1:5001/metabook-system/us-central1";

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
  let body: any;
  const contentType = result.headers.get("Content-Type");
  if (contentType === null) {
    body = undefined;
  } else if (contentType?.startsWith("application/json")) {
    try {
      body = await result.json();
    } catch {}
  } else if (contentType?.startsWith("text/plain")) {
    body = await result.text();
  } else {
    throw new Error(`Unsupported response content type ${contentType}`);
  }
  return { status: result.status, body, headers: result.headers };
}
