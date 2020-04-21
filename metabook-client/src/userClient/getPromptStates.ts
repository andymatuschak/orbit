import {
  PromptStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "./userClient";

export default function getPromptStates(
  client: MetabookUserClient,
  query: PromptStateQuery,
): Promise<MetabookPromptStateSnapshot> {
  return new Promise((resolve, reject) => {
    const unsubscribe = client.subscribeToPromptStates(
      query,
      (newPromptStates) => {
        resolve(newPromptStates);
        unsubscribe();
      },
      (error) => {
        reject(error);
        unsubscribe();
      },
    );
  });
}
