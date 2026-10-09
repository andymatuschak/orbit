import { EmbeddedScreenConfiguration } from "@withorbit/embedded-support";
import { styles } from "../../ui/index.js";

export default function getEmbeddedScreenConfigurationFromURL(
  href: string,
): EmbeddedScreenConfiguration | null {
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  const tasksString = params.get("i");
  if (tasksString === null) return null;

  const raw = JSON.parse(tasksString) as unknown;
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== 1 ||
    typeof raw.sessionID !== "string" ||
    !Array.isArray(raw.tasks) ||
    !Array.isArray(raw.reviewItems) ||
    !Array.isArray(raw.attachmentIDs) ||
    !isRecord(raw.embeddedHostMetadata)
  ) {
    throw new Error("Malformed embedded screen configuration in URL");
  }
  const configuration = {
    ...raw,
    ipcNonce: typeof raw.ipcNonce === "string" ? raw.ipcNonce : "",
  } as unknown as EmbeddedScreenConfiguration;
  const colorPaletteName = configuration.embeddedHostMetadata.colorPaletteName;
  if (colorPaletteName && !styles.colors.palettes[colorPaletteName]) {
    throw new Error(`Unknown color palette name: ${colorPaletteName}`);
  }
  return configuration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
