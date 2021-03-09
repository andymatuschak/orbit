declare module "citation-js" {
  export = Cite;

  class Cite {
    data: Cite.CitationEntry[];
    set(data: Cite.CitationEntry[]): void;
    format(formatter: "bibtex"): string;
  }

  namespace Cite {
    export function async(contents: string): Promise<Cite>;

    export interface CitationEntry {
      title: string;
      ISBN: string;
      author: { family: string }[];
    }
  }
}
