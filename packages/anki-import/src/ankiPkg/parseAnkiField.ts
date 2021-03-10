import * as mdast from "mdast";
// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
import rehypeParse from "rehype-parse";
// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
import rehype2Remark from "rehype-remark";
import remarkStringify from "remark-stringify";
import matchAll from "string.prototype.matchAll";
import unified from "unified";
import { selectAll } from "unist-util-select";
import { AnkiAttachmentReference } from "./ankiAttachmentReference";

export function stripImages(this: unified.Processor) {
  this.Compiler.prototype.visitors["image"] = () => "";
}

const processor = unified()
  .use(rehypeParse)
  .use(rehype2Remark)
  .use(remarkStringify)
  .use(stripImages);
export default function parseAnkiField(
  ankiField: string,
): {
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
  const soundNames = [...matchAll(markdown, soundRegexp)].map(
    (matchArray) => matchArray[1],
  );
  markdown = markdown.replace(soundRegexp, "");

  // Convert cloze prompts
  markdown = markdown.replace(/{{c\d+::([^}]+)}}/g, "{$1}");

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
