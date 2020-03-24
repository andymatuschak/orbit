import {
  MetabookCardStateQuery,
  MetabookCardStateSnapshot,
  MetabookUserClient,
} from "./userClient";

export default function getCardStates(
  client: MetabookUserClient,
  query: MetabookCardStateQuery,
): Promise<MetabookCardStateSnapshot> {
  return new Promise((resolve, reject) => {
    const unsubscribe = client.subscribeToCardStates(
      query,
      newCardStates => {
        resolve(newCardStates);
        unsubscribe();
      },
      error => {
        reject(error);
        unsubscribe();
      },
    );
  });
}
