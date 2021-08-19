import { ColorPaletteName } from "@withorbit/core";
import { EmbeddedHostMetadata } from "@withorbit/embedded-support";

let hasWarnedAboutTitle = false;
function readMetadata(): EmbeddedHostMetadata {
  const head = document.head;

  let title: string | null = null;
  let openGraphTitle: string | null = null;
  let siteName: string | null = null;
  let colorName: string | null = null;
  let canonicalURL: string | null = null;
  for (let i = 0; i < head.children.length; i++) {
    const node = head.children[i];
    if (node instanceof HTMLMetaElement) {
      const propertyName = node.getAttribute("property");
      const content = node.getAttribute("content");
      if (propertyName === "og:title") {
        openGraphTitle = content;
      } else if (propertyName === "og:site_name") {
        siteName = content;
      } else if (propertyName === "orbit:color") {
        colorName = content;
      }
    } else if (node instanceof HTMLTitleElement) {
      title = node.innerText;
    } else if (
      node instanceof HTMLLinkElement &&
      node.getAttribute("rel") === "canonical"
    ) {
      canonicalURL = node.getAttribute("href");
    }
  }

  if (!title && !hasWarnedAboutTitle) {
    hasWarnedAboutTitle = true;
    console.warn(
      "[Orbit] This page has no title. It will not display correctly in Orbit's interface.",
    );
  }

  return {
    url: canonicalURL ?? document.location.toString(),
    title: openGraphTitle ?? title,
    siteName,
    // Validation of the color palette name will happen in the embedded environment to avoid loading the strings here.
    colorPaletteName: (colorName as ColorPaletteName) ?? null,
  };
}

export type MetadataListener = (newMetadata: EmbeddedHostMetadata) => void;
class MetadataMonitor {
  private readonly listeners: Set<MetadataListener>;
  private cachedMetadata: EmbeddedHostMetadata;

  constructor() {
    this.listeners = new Set();

    const headObserver = new MutationObserver(this.onHeadChange);
    headObserver.observe(document.head, {
      subtree: true,
      childList: true,
      attributes: true,
    });

    this.cachedMetadata = readMetadata();
  }

  addEventListener(listener: MetadataListener) {
    this.listeners.add(listener);
    listener(this.cachedMetadata);
  }

  removeEventListener(listener: MetadataListener) {
    this.listeners.delete(listener);
  }

  onHeadChange = () => {
    const oldMetadata = this.cachedMetadata;
    const metadata = readMetadata();
    if (
      metadata.url !== oldMetadata.url ||
      metadata.title !== oldMetadata.title ||
      metadata.siteName !== oldMetadata.siteName ||
      metadata.colorPaletteName !== oldMetadata.colorPaletteName
    ) {
      for (const listener of this.listeners) {
        listener(metadata);
      }
      this.cachedMetadata = metadata;
    }
  };
}

let _monitor: MetadataMonitor | null = null;
export function getSharedMetadataMonitor() {
  if (!_monitor) {
    _monitor = new MetadataMonitor();
  }
  return _monitor;
}
