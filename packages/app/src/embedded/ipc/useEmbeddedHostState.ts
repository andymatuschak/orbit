import { EmbeddedHostState } from "@withorbit/embedded-support";
import { useEffect, useState } from "react";
import { EmbeddedHostBridge } from "../embeddedHostBridge.js";

export function useEmbeddedHostState(
  bridge: EmbeddedHostBridge,
): EmbeddedHostState | null {
  const [hostState, setHostState] = useState<EmbeddedHostState | null>(null);

  useEffect(() => {
    return bridge.subscribeToHostState(setHostState);
  }, [bridge]);

  return hostState;
}
