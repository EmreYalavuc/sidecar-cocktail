import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import type { Analysis } from "@/types";

export function useAnalysisStream() {
  const { addAnalysis, setPendingAnalysis } = useAppStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<Analysis>("sidecar://analysis", (e) => {
      const a = e.payload;
      addAnalysis(a);
      setPendingAnalysis(a.event_id, false);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);
}
