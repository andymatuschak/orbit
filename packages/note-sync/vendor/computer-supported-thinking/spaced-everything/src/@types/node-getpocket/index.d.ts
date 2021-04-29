declare module "node-getpocket" {
  export = GetPocket;

  class GetPocket {
    constructor(config: GetPocket.Config, root_url?: string);
    get(
      params: GetPocket.GetParams,
      callback: GetPocket.Callback<GetPocket.GetResponse>,
    ): void;

    delete(
      params: GetPocket.ItemListParams,
      callback: GetPocket.Callback<GetPocket.Response>,
    ): void;

    archive(
      params: GetPocket.ItemListParams,
      callback: GetPocket.Callback<GetPocket.Response>,
    ): void;
  }

  namespace GetPocket {
    export type Callback<Result> = (
      error: Error | null,
      result: Result,
    ) => void;

    export interface Config {
      consumer_key: string;
      access_token?: string;
    }

    export interface Item {
      item_id: string;
      resolved_title: string;
      resolved_id: string;
      resolved_url: string;
      authors: { [key: string]: { name: string } } | null;
      time_added: number; // in seconds
    }

    export type StatusCode = 0 | 1;
    export interface Response {
      status: StatusCode;
    }

    export interface GetParams {
      state?: string;
      detailType?: "simple" | "complete";
    }

    export interface GetResponse extends Response {
      list: { [key: string]: Item };
    }

    export interface ItemSpecifier {
      item_id: string;
    }
    export type ItemListParams = ItemSpecifier | ItemSpecifier[];
  }
}
