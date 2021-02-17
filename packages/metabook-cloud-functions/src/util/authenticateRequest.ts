import { API } from "@withorbit/api";
import express from "express";
import { TypedRequest, TypedResponse } from "../api/util/typedRouter";
import * as backend from "../backend";

export async function authenticateRequest(
  request: express.Request,
  response: express.Response,
  next: (userID: string) => void,
): Promise<void> {
  authenticateTypedRequest(request, async (userID) => {
    next(userID);
    // HACK Not actually used:
    return { status: 200, json: undefined };
  });
}

export async function authenticateTypedRequest<
  API extends API.Spec,
  Path extends Extract<keyof API, string>,
  Method extends Extract<keyof API[Path], API.HTTPMethod>
>(
  request: TypedRequest<API[Path][Method]>,
  next: (
    userID: string,
  ) => Promise<TypedResponse<API.RouteResponseData<API[Path][Method]>>>,
): Promise<TypedResponse<API.RouteResponseData<API[Path][Method]>>> {
  const authorizationHeader = request.header("Authorization");
  let idToken: string | null = null;
  if (authorizationHeader) {
    const match = authorizationHeader.match(/ID (.+)/);
    if (match) {
      idToken = match[1];
    }
  }

  const accessCode = (request.query as any)["accessCode"];
  if (accessCode && typeof accessCode === "string") {
    let userID: string;
    try {
      userID = await backend.auth.consumeAccessCode(accessCode, Date.now());
    } catch (error) {
      console.error(`Couldn't consume access code ${accessCode}: ${error}`);
      return { status: 401 };
    }
    return next(userID);
  } else if (idToken) {
    try {
      const userID = await backend.auth.validateIDToken(idToken);
      return next(userID);
    } catch (error) {
      console.error(`Couldn't validate ID token ${idToken}: ${error}`);
      return { status: 401 };
    }
  } else {
    return { status: 401 };
  }
}
