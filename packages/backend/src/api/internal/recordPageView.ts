import { browserName, detectOS } from "detect-browser";
import type { Request, Response } from "express";
import isBot from "isbot-fast";
import requestIp from "request-ip";
import { sharedLoggingService } from "../../logging/index.js";
import crypto from "crypto";
import { startOfMonth } from "date-fns";
import serviceConfig from "../../serviceConfig.js";

// Adapted from Umami: https://github.com/mikecao/umami
/* MIT License

Copyright (c) 2020 Mike Cao <mike@mikecao.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

export const DESKTOP_SCREEN_WIDTH = 1920;
export const LAPTOP_SCREEN_WIDTH = 1024;
export const MOBILE_SCREEN_WIDTH = 479;

const DESKTOP_OS = [
  "Windows 3.11",
  "Windows 95",
  "Windows 98",
  "Windows 2000",
  "Windows XP",
  "Windows Server 2003",
  "Windows Vista",
  "Windows 7",
  "Windows 8",
  "Windows 8.1",
  "Windows 10",
  "Windows ME",
  "Open BSD",
  "Sun OS",
  "Linux",
  "Mac OS",
  "QNX",
  "BeOS",
  "OS/2",
  "Chrome OS",
];

const MOBILE_OS = [
  "iOS",
  "Android OS",
  "BlackBerry OS",
  "Windows Mobile",
  "Amazon OS",
];

function getIpAddress(request: Request) {
  // Cloudflare
  if (request.headers["cf-connecting-ip"]) {
    return request.headers["cf-connecting-ip"];
  }

  return requestIp.getClientIp(request);
}

function getDevice(screen: string | null, os: string | null): string | null {
  if (!screen) return null;

  const [widthString] = screen.split("x");
  const width = Number.parseInt(widthString);

  if (os && DESKTOP_OS.includes(os)) {
    if (os === "Chrome OS" || width < DESKTOP_SCREEN_WIDTH) {
      return "laptop";
    }
    return "desktop";
  } else if (os && MOBILE_OS.includes(os)) {
    if (os === "Amazon OS" || width > MOBILE_SCREEN_WIDTH) {
      return "tablet";
    }
    return "mobile";
  }

  if (width >= DESKTOP_SCREEN_WIDTH) {
    return "desktop";
  } else if (width >= LAPTOP_SCREEN_WIDTH) {
    return "laptop";
  } else if (width >= MOBILE_SCREEN_WIDTH) {
    return "tablet";
  } else {
    return "mobile";
  }
}

function getClientInfo(request: Request, screen: string | null) {
  const userAgent = request.headers["user-agent"];
  const ip = getIpAddress(request);
  const browser = userAgent ? browserName(userAgent) : null;
  const os = userAgent ? detectOS(userAgent) : null;
  const device = getDevice(screen, os);

  return { browser, os, ip, device };
}

function getSalt() {
  const salt = serviceConfig.sessionIDHashSalt;
  if (!salt) {
    throw new Error(
      "You must set a sessionIDHashSalt: firebase functions:config:set logging.session_id_hash_salt=YOURSALT",
    );
  }
  const rotatingSalt = startOfMonth(new Date()).toUTCString();
  return salt + rotatingSalt;
}

export async function recordPageView(request: Request, response: Response) {
  // Respond right away; don't occupy a spot in the browser's queue.
  response.sendStatus(200);

  const userAgent = request.headers["user-agent"];
  if (userAgent && isBot(userAgent)) {
    console.info("Ignoring page view from bot.");
    return;
  }

  const { pathname, hostname, referrer, screen, language } = request.body;
  if (hostname === "localhost") {
    console.info("Ignoring page view from localhost.");
    return;
  }

  const { browser, os, ip, device } = getClientInfo(request, screen);

  const sessionID = crypto
    .createHash("sha256")
    .update(JSON.stringify({ ip, userAgent, hostname, os, salt: getSalt() }))
    .digest("base64");

  try {
    await sharedLoggingService.logPageView({
      pathname,
      hostname,
      referrer: referrer ?? null,
      screen: screen ?? null,
      language: language ?? null,
      browser,
      os,
      device,
      sessionID,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(error);
  }
}
