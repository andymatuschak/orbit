declare module "websql" {
  function openDatabase(
    name: string,
    version: string,
    description: string,
    size: number,
  ): import("../../sqlite/types").SQLDatabase;
  export = openDatabase;
}
