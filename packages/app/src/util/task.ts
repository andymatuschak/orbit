// Tasks extend promises to describe cancellable operations.

export interface Task<T> {
  promise: Promise<T>;
  cancel: () => void; // promise will reject with CancelledError, if it hasn't already resolved
}

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
  }
}

export interface TaskStatus {
  isCancelled: boolean;
}

export function createTask<T>(
  operation: (taskStatus: TaskStatus) => Promise<T>,
): Task<T> {
  const taskStatus: TaskStatus = { isCancelled: false };
  let sharedReject: ((error: Error) => void) | null = null;

  return {
    cancel() {
      taskStatus.isCancelled = true;
      sharedReject?.(new CancelledError());
    },
    promise: new Promise(async (resolve, reject) => {
      sharedReject = reject;
      try {
        operation(taskStatus).then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    }),
  };
}
