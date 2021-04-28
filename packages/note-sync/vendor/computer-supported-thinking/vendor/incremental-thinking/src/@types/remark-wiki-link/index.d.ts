declare module "remark-wiki-link" {
  import remarkStringify from "remark-stringify";
  import unified from "unified";

  export = RemarkWikiLink;

  function RemarkWikiLink(
    this: unified.Processor,
    settings?: Partial<RemarkWikiLink.PluginSettings>,
  ): void;

  namespace RemarkWikiLink {
    export interface PluginSettings {}

    export interface RemarkWikiLinkNode {
      type: "wikiLink";
      value: string;
      data: {
        alias: string | undefined;
        permalink: string | undefined;
        exists: boolean;
        hName: "a";
        hProperties: {
          className: string;
          href: string;
        };
        hChildren: { type: "text"; value: string | undefined }[];
      };
    }
  }
}
