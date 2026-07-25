export function getInheritedLanguage(element: HTMLElement): string {
  let currentElement: HTMLElement | null = element;
  while (currentElement) {
    const language = currentElement.getAttribute("lang")?.trim();
    if (language) return language;
    currentElement = currentElement.parentElement;
  }

  return document.documentElement.lang.trim() || "en";
}
