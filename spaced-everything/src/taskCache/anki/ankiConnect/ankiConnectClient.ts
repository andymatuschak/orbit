import { AnyJson } from "../../../util/JSONTypes";
import { RequestSpec } from "./util/requestFactory";
import axios, { AxiosInstance } from "axios";

export interface AnkiConnectClient {
  request<ResponseData extends AnyJson>(
    request: RequestSpec<ResponseData>
  ): Promise<ResponseData>;

  deckName: string;
}

export function createAnkiConnectClient(
  axiosInstance: AxiosInstance,
  deckName: string
): AnkiConnectClient {
  return {
    request: async <ResponseData extends AnyJson>(
      request: RequestSpec<ResponseData>
    ) => {
      const response = await axiosInstance.request<
        { result: ResponseData; error: null } | { result: null; error: string }
      >(request.config);
      console.log(
        "Request",
        JSON.stringify(request, null, "\t"),
        "response",
        response.data
      );
      if (response.status !== 200) {
        throw new Error(
          `Unexpected response code for request ${JSON.stringify(request)}: ${
            response.status
          }`
        );
      }
      const data = response.data;
      if (data.error !== null) {
        throw new Error(data.error);
      } else {
        return data.result;
      }
    },

    deckName,
  };
}

export function createDefaultLocalAnkiConnectClient(
  deckName: string = "Default"
) {
  return createAnkiConnectClient(
    axios.create({ baseURL: "http://localhost:8765" }),
    deckName
  );
}
