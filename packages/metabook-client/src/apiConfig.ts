import * as Network from "./util/fetch";

export interface APIConfig {
  baseURL: string; // no trailing slash

  fetch?: typeof Network.fetch;
}

export const defaultAPIConfig: APIConfig = {
  baseURL: "https://withorbit.com/api",
};
