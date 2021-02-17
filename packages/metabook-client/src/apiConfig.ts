import { fetch } from "./util/fetch";

export interface APIConfig {
  baseURL: string; // no trailing slash

  fetch?: typeof fetch;
}

export const defaultAPIConfig: APIConfig = {
  baseURL: "https://withorbit.com/api",
};
