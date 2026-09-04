import { EmbeddedScreenConfiguration } from "@withorbit/embedded-support";
import { styles } from "../../ui/index.js";

export default function getEmbeddedScreenConfigurationFromURL(
  href: string,
): EmbeddedScreenConfiguration | null {
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  const tasksString = params.get("i");
  if (tasksString === null) return null;

  const configuration: EmbeddedScreenConfiguration = JSON.parse(tasksString);
  // TODO: validate
  const colorPaletteName = configuration.embeddedHostMetadata.colorPaletteName;
  if (colorPaletteName && !styles.colors.palettes[colorPaletteName]) {
    throw new Error(`Unknown color palette name: ${colorPaletteName}`);
  }
  return configuration;
}
