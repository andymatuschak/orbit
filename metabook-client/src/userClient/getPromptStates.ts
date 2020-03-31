import {
  MetabookCardStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "./userClient";

export default function getPromptStates(
  client: MetabookUserClient,
  query: MetabookCardStateQuery,
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
