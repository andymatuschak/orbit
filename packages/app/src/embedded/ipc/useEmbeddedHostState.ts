import {
  EmbeddedHostEventType,
  EmbeddedHostState,
  EmbeddedHostUpdateEvent,
} from "@withorbit/embedded-support";
import { useEffect, useState } from "react";

export function useEmbeddedHostState(): EmbeddedHostState | null {
  const [hostState, setHostState] = useState<EmbeddedHostState | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.source === parent &&
        event.data &&
        event.data.type === EmbeddedHostEventType.HostUpdate
      ) {
        const updateEvent: EmbeddedHostUpdateEvent = event.data;
        setHostState(updateEvent.state);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return hostState;
}
