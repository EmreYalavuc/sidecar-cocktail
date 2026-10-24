import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import type { FileChange } from "@/types";

interface RawFileChange {
  id: string;
  session_id: string;
  event_id: string | null;
  file_path: string;
  change_type: "modified" | "created" | "deleted" | "renamed";
  diff: string;
  lines_added: number;
  lines_removed: number;
  confidence: string;
  confidence_score: number;
  timestamp: string;
}

export function useFileStream() {
  const { addFileChange } = useAppStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<RawFileChange>("sidecar://file-change", (e) => {
      const raw = e.payload;
      const fc: FileChange = {
        id:            raw.id,
        session_id:    raw.session_id,
        event_id:      raw.event_id,
        file_path:     raw.file_path,
        change_type:   raw.change_type,
        diff:          raw.diff || null,
        lines_added:   raw.lines_added,
        lines_removed: raw.lines_removed,
        confidence:    raw.confidence as FileChange["confidence"],
        timestamp:     raw.timestamp,
      };
      addFileChange(fc);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);
}
