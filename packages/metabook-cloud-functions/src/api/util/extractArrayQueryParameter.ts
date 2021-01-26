import express from "express";

export function extractArrayQueryParameter(
  request: express.Request,
  key: string,
): string[] | null {
  const queryParameter = request.query[key];
  if (typeof queryParameter === "string") {
    return [queryParameter];
  } else if (queryParameter && Array.isArray(queryParameter)) {
    return queryParameter as string[];
  } else {
    return null;
  }
}
