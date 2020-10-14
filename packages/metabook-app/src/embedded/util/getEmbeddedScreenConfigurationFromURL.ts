import { EmbeddedScreenConfiguration } from "metabook-embedded-support";
import { styles } from "metabook-ui";

export default function getEmbeddedScreenConfigurationFromURL(
  href: string,
): EmbeddedScreenConfiguration {
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  const tasksString = params.get("i");
  if (tasksString) {
    const configuration: EmbeddedScreenConfiguration = JSON.parse(tasksString);
    // TODO: validate
    const colorPaletteName =
      configuration.embeddedHostMetadata.colorPaletteName;
    if (colorPaletteName && !styles.colors.palettes[colorPaletteName]) {
      throw new Error(`Unknown color palette name: ${colorPaletteName}`);
    }
    return configuration;
  } else {
    throw new Error("No review items supplied");
  }
}
