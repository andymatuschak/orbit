declare module "file-metadata" {
  export = FileMetadata;

  type MetadataList = { [key: string]: string };

  function FileMetadata(filePath: string): Promise<MetadataList>;

  namespace FileMetadata {
    export function sync(filePath: string): MetadataList;
  }
}
