declare module "string.prototype.matchAll" {
  function matchAll(
    input: string,
    regexp: RegExp,
  ): IterableIterator<RegExpMatchArray>;
  export = matchAll;
}
