import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import type { ClaudeEvent } from "@/types";

interface RawEvent {
  id: string;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: string | null;
  working_dir: string | null;
  file_paths: string[];
  timestamp: string;
  risk_level: string | null;
  is_bookmarked: boolean;
  annotation: string | null;
}

export function useEventStream() {
  const { addEvent, setIpcConnected, activeSessionId, setActiveSession } =
    useAppStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<RawEvent>("sidecar://event", (tauri_event) => {
      const raw = tauri_event.payload;

      const event: ClaudeEvent = {
        ...raw,
        event_type: raw.event_type as ClaudeEvent["event_type"],
        tool_input: raw.tool_input as Record<string, unknown> | null,
        file_paths: raw.file_paths ?? [],
        risk_level: raw.risk_level as ClaudeEvent["risk_level"],
      };

      addEvent(event);
      setIpcConnected(true);

      // Auto-select first session seen
      if (!activeSessionId && event.session_id) {
        setActiveSession(event.session_id);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    // Use Tauri invoke (no CORS issues) to poll IPC liveness
    invoke("get_ipc_port").then(() => setIpcConnected(true)).catch(() => {});
    const healthCheck = setInterval(async () => {
      try {
        await invoke("get_ipc_port");
        setIpcConnected(true);
      } catch {
        setIpcConnected(false);
      }
    }, 5000);

    return () => {
      unlisten?.();
      clearInterval(healthCheck);
    };
  }, []);
}
