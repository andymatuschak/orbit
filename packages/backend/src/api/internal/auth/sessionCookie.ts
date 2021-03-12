import express from "express";

export const sessionCookieName = "__session"; // mandated by Firebase hosting, c.f. https://firebase.google.com/docs/hosting/manage-cache#using_cookies
export function getSessionCookieOptions(
  expirationDate: Date,
): express.CookieOptions {
  return {
    domain: "withorbit.com",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "none", // Our use in an embedded context requires a "none" same-site setting, since these are considered "unsafe" requests.
    expires: expirationDate,
  };
}
