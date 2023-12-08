import * as mdast from "mdast";
import rehypeParse from "rehype-parse";
import rehype2Remark from "rehype-remark";
import remarkStringify from "remark-stringify";
import { unified, Processor } from "unified";
import { selectAll } from "unist-util-select";
import { AnkiAttachmentReference } from "./ankiAttachmentReference.js";

export function stripImages(this: Processor) {
  const data = this.data();
  if (!data.toMarkdownExtensions) {
    data.toMarkdownExtensions = [];
  }
  (data.toMarkdownExtensions as any[]).push({ handlers: { image: () => "" } });
}

const processor = unified()
  .use(rehypeParse)
  .use(rehype2Remark)
  .use(remarkStringify)
  .use(stripImages);
export default function parseAnkiField(ankiField: string): {
  contentsMarkdown: string;
  attachmentReferences: AnkiAttachmentReference[];
} {
  // Convert HTML to Markdown
  const ast = processor.parse(ankiField);
  const markdownAST = processor.runSync(ast);
  let markdown = processor.stringify(markdownAST);

  // Extract images
  const images = selectAll("image", markdownAST) as mdast.Image[];

  // Extract sounds
  const soundRegexp = /\\\[sound:([^\]]+)]/g;
  const soundNames = [...markdown.matchAll(soundRegexp)].map(
    (matchArray) => matchArray[1],
  );
  markdown = markdown.replace(soundRegexp, "");

  // Convert cloze prompts
  markdown = markdown.replace(/{{c\d+::([^}]+)}}/g, "{$1}");

  // Strip explicit ending newline
  markdown = markdown.replace(/\n\n\\/gm, "");

  return {
    contentsMarkdown: markdown.trimRight(),
    attachmentReferences: [
      ...images.map(
        (image) =>
          ({
            type: "image",
            name: image.url,
          } as const),
      ),
      ...soundNames.map(
        (soundName) =>
          ({
            type: "sound",
            name: soundName,
          } as const),
      ),
    ],
  };
}
