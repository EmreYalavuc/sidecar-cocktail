import { create } from "zustand";
import type {
  Session,
  ClaudeEvent,
  FileChange,
  Analysis,
  AppSettings,
} from "@/types";

type View = "timeline" | "files" | "analysis" | "sessions" | "settings";

interface AppState {
  // Navigation
  activeView: View;
  setActiveView: (v: View) => void;

  // Sessions
  sessions: Session[];
  activeSessionId: string | null;
  setSessions: (s: Session[]) => void;
  setActiveSession: (id: string | null) => void;

  // Events
  events: ClaudeEvent[];
  addEvent: (e: ClaudeEvent) => void;
  setEvents: (e: ClaudeEvent[]) => void;
  updateEvent: (id: string, patch: Partial<ClaudeEvent>) => void;

  // File changes
  fileChanges: FileChange[];
  addFileChange: (f: FileChange) => void;
  setFileChanges: (f: FileChange[]) => void;

  // Analysis
  analyses: Analysis[];
  addAnalysis: (a: Analysis) => void;
  setAnalyses: (a: Analysis[]) => void;
  pendingAnalysisIds: Set<string>;
  setPendingAnalysis: (eventId: string, pending: boolean) => void;

  // Settings
  settings: AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;

  // UI state
  selectedEventId: string | null;
  setSelectedEvent: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterRisk: string;
  setFilterRisk: (r: string) => void;
  ipcConnected: boolean;
  setIpcConnected: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: "timeline",
  setActiveView: (v) => set({ activeView: v }),

  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),

  events: [],
  addEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 500) })),
  setEvents: (events) => set({ events }),
  updateEvent: (id, patch) =>
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),

  fileChanges: [],
  addFileChange: (f) => set((s) => ({ fileChanges: [f, ...s.fileChanges] })),
  setFileChanges: (fileChanges) => set({ fileChanges }),

  analyses: [],
  addAnalysis: (a) => set((s) => ({ analyses: [a, ...s.analyses] })),
  setAnalyses: (analyses) => set({ analyses }),
  pendingAnalysisIds: new Set(),
  setPendingAnalysis: (eventId, pending) =>
    set((s) => {
      const next = new Set(s.pendingAnalysisIds);
      pending ? next.add(eventId) : next.delete(eventId);
      return { pendingAnalysisIds: next };
    }),

  settings: {
    gemini_api_key_set: false,
    claude_api_key_set: false,
    active_provider: "gemini",
    gemini_model: "gemini-2.5-flash-lite",
    claude_model: "claude-sonnet-4-6",
    ipc_port: 7878,
    watch_path: null,
    watch_paths: [],
    excluded_paths: [".git", "node_modules", "target", "dist", ".venv"],
    auto_analyze_risk: "High",
    notifications_enabled: true,
  },
  setSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),

  selectedEventId: null,
  setSelectedEvent: (id) => set({ selectedEventId: id }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  filterRisk: "all",
  setFilterRisk: (r) => set({ filterRisk: r }),
  ipcConnected: false,
  setIpcConnected: (v) => set({ ipcConnected: v }),
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}));
