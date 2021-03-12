import { EmbeddedScreenConfiguration } from "@withorbit/embedded-support";
import { styles } from "@withorbit/ui";

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
export default function getEmbeddedColorPalette(
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
