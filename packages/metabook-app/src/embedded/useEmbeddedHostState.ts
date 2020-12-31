import {
  EmbeddedHostState,
  embeddedHostUpdateEventName,
} from "metabook-embedded-support";
import { useEffect, useState } from "react";

export function useEmbeddedHostState(): EmbeddedHostState | null {
  const [hostState, setHostState] = useState<EmbeddedHostState | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.source === parent &&
        event.data &&
        event.data.type === embeddedHostUpdateEventName
      ) {
        // console.log("Got new host state", event.data.state);
        setHostState(event.data.record);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return hostState;
}
