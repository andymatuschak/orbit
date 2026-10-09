import { readFile } from "node:fs/promises";
import { applicationDefault } from "firebase-admin/app";

export interface ReminderConfiguration {
  apiKey: string;
  secretKey: string;
  publicOrigin: string;
}

export async function loadReminderConfiguration(
  environment = process.env,
): Promise<ReminderConfiguration | null> {
  let raw: unknown;
  if (environment.ORBIT_REMINDER_CONFIG_FILE) {
    raw = parseConfigurationJSON(
      await readFile(environment.ORBIT_REMINDER_CONFIG_FILE, "utf8"),
    );
  } else if (environment.ORBIT_REMINDER_SECRET) {
    const resource = environment.ORBIT_REMINDER_SECRET;
    if (
      !/^projects\/[a-zA-Z0-9-]+\/secrets\/[a-zA-Z0-9_-]+\/versions\/[a-zA-Z0-9_-]+$/.test(
        resource,
      )
    )
      throw new TypeError("Invalid reminder secret resource");
    const token = await applicationDefault().getAccessToken();
    const response = await fetch(
      `https://secretmanager.googleapis.com/v1/${resource}:access`,
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("Could not read reminder configuration");
    const payload = (await response.json()) as { payload?: { data?: string } };
    if (!payload.payload?.data)
      throw new Error("Reminder configuration missing");
    raw = parseConfigurationJSON(
      Buffer.from(payload.payload.data, "base64").toString("utf8"),
    );
  } else return null;
  if (!raw || typeof raw !== "object")
    throw new TypeError("Invalid reminder configuration");
  const configuration = raw as ReminderConfiguration;
  if (
    typeof configuration.apiKey !== "string" ||
    !configuration.apiKey ||
    typeof configuration.secretKey !== "string" ||
    !configuration.secretKey ||
    new URL(configuration.publicOrigin).protocol !== "https:"
  )
    throw new TypeError("Invalid reminder configuration");
  return {
    apiKey: configuration.apiKey,
    secretKey: configuration.secretKey,
    publicOrigin: configuration.publicOrigin,
  };
}

function parseConfigurationJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new TypeError("Invalid reminder configuration JSON");
  }
}
