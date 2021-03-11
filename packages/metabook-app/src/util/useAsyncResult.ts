import { useWeakRef } from "@withorbit/ui";
import React from "react";

export function useAsyncResult<T>(initializer: () => Promise<T>): T | null {
  const [result, setResult] = React.useState<T | null>(null);
  const isCancelled = React.useRef(false);

  // We don't re-run the initializer if it changes.
  const weakInitializer = useWeakRef(initializer);
  React.useEffect(() => {
    weakInitializer.current().then((result) => {
      if (!isCancelled.current) {
        setResult(result);
      }
    });

    return () => {
      isCancelled.current = true;
    };
  }, [weakInitializer]);
  return result;
}
