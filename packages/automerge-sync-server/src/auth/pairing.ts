import { createHash, timingSafeEqual } from "node:crypto";

export function pairedTokenMatches(candidate: unknown, expected: string) {
  return (
    typeof candidate === "string" &&
    candidate.length <= 1024 &&
    timingSafeEqual(digest(candidate), digest(expected))
  );
}

export function bearerToken(
  authorization: string | undefined,
): string | undefined {
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
  return match?.[1];
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}
