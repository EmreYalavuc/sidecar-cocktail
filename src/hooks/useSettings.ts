import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";

interface PersistedSettings {
  active_provider: string;
  gemini_model: string;
  claude_model: string;
  auto_analyze_risk: string;
  ipc_port: number;
  notifications_enabled: boolean;
  watch_paths: string[];
}

export function useSettings() {
  const { setSettings } = useAppStore();

  useEffect(() => {
    async function load() {
      const [s, geminiOk, claudeOk] = await Promise.all([
        invoke<PersistedSettings>("get_settings"),
        invoke<boolean>("has_api_key", { provider: "gemini" }),
        invoke<boolean>("has_api_key", { provider: "claude" }),
      ]);
      setSettings({
        active_provider:       s.active_provider as "gemini" | "claude",
        gemini_model:          s.gemini_model,
        claude_model:          s.claude_model,
        auto_analyze_risk:     s.auto_analyze_risk as import("@/types").RiskLevel,
        ipc_port:              s.ipc_port,
        notifications_enabled: s.notifications_enabled,
        watch_path:            s.watch_paths[0] ?? null,
        watch_paths:           s.watch_paths,
        gemini_api_key_set:    geminiOk,
        claude_api_key_set:    claudeOk,
      });
    }
    load().catch((e) => console.warn("Failed to load settings:", e));
  }, []);
}
