import { styles } from "metabook-ui";
import { EmbeddedItem } from "./embeddedItem";
import { ColorPaletteName } from "metabook-core";

export interface EmbeddedScreenConfiguration {
  embeddedItems: EmbeddedItem[];
  embeddedHostMetadata: EmbeddedHostMetadata;
}

export interface EmbeddedHostMetadata {
  url: string;
  title: string | null;
  siteName: string | null;
  colorPaletteName: ColorPaletteName | null;
}

// Simple string hash, just for choosing palettes from the URL.
// https://stackoverflow.com/a/52171480
function hashString(input: string): number {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

let _hasWarnedAboutMissingColorName = false;
export function getEmbeddedColorPalette(
  config: EmbeddedScreenConfiguration,
): styles.colors.ColorPalette {
  if (config.embeddedHostMetadata.colorPaletteName) {
    return styles.colors.palettes[config.embeddedHostMetadata.colorPaletteName];
  } else {
    if (!_hasWarnedAboutMissingColorName) {
      console.error(
        "[Orbit] No color palette specified. We'll choose one based on host URL, but you should specify one.",
      );
      _hasWarnedAboutMissingColorName = true;
    }
    const hostURL = new URL(config.embeddedHostMetadata.url);
    const colorName =
      styles.colors.orderedPaletteNames[
        hashString(hostURL.host) % styles.colors.orderedPaletteNames.length
      ];
    return styles.colors.palettes[colorName];
  }
}

export function getEmbeddedScreenConfigurationFromURL(
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
