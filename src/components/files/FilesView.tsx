import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FilePlus, FileEdit, FileX, ChevronRight, FolderOpen
} from "lucide-react";
import { cn, formatTime, truncatePath } from "@/lib/utils";
import { DiffViewer } from "./DiffViewer";
import { useAppStore } from "@/stores/appStore";
import type { FileChange } from "@/types";

const CHANGE_ICON: Record<string, React.ElementType> = {
  created:  FilePlus,
  modified: FileEdit,
  deleted:  FileX,
  renamed:  FileEdit,
};

const CONFIDENCE_CLASS: Record<string, string> = {
  High:     "bg-emerald-950 text-emerald-400 border border-emerald-800",
  Medium:   "bg-amber-950 text-amber-400 border border-amber-800",
  Low:      "bg-navy-700 text-muted border border-navy-600",
  External: "bg-navy-700 text-blue-400 border border-blue-800/50",
};

export function FilesView() {
  const { fileChanges, settings, setSettings, activeSessionId } = useAppStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [startingWatch, setStartingWatch] = useState(false);

  const filtered = activeSessionId
    ? fileChanges.filter((f) => f.session_id === activeSessionId)
    : fileChanges;

  async function handleStartWatch() {
    if (!settings.watch_path) return;
    setStartingWatch(true);
    try {
      await invoke("start_watching", { path: settings.watch_path });
    } finally {
      setStartingWatch(false);
    }
  }

  if (filtered.length === 0) {
    return <EmptyFiles onStartWatch={handleStartWatch} settings={settings} setSettings={setSettings} startingWatch={startingWatch} />;
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* File list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-3 py-2 border-b border-navy-700 flex items-center justify-between">
          <span className="text-xs text-muted">{filtered.length} changes</span>
          <div className="flex gap-3 text-[10px] text-muted">
            <span className="text-emerald-400">+{filtered.reduce((s, f) => s + f.lines_added, 0)}</span>
            <span className="text-red-400">-{filtered.reduce((s, f) => s + f.lines_removed, 0)}</span>
          </div>
        </div>

        {filtered.map((fc) => (
          <FileRow
            key={fc.id}
            fc={fc}
            expanded={expanded === fc.id}
            onToggle={() => setExpanded(expanded === fc.id ? null : fc.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FileRow({
  fc,
  expanded,
  onToggle,
}: {
  fc: FileChange;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = CHANGE_ICON[fc.change_type] ?? FileEdit;

  return (
    <div className={cn("border-b border-navy-700/50 animate-slide-in", expanded && "bg-navy-800/30")}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-navy-800/50 transition-colors text-left"
      >
        <Icon
          size={14}
          className={cn(
            fc.change_type === "created" && "text-emerald-400",
            fc.change_type === "modified" && "text-amber-400",
            fc.change_type === "deleted" && "text-red-400",
          )}
        />

        <div className="flex-1 min-w-0">
          <p className="text-xs text-cream-200 font-mono truncate">
            {truncatePath(fc.file_path, 50)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted">{formatTime(fc.timestamp)}</span>
            {fc.lines_added > 0 && (
              <span className="text-[10px] text-emerald-400">+{fc.lines_added}</span>
            )}
            {fc.lines_removed > 0 && (
              <span className="text-[10px] text-red-400">-{fc.lines_removed}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", CONFIDENCE_CLASS[fc.confidence] ?? CONFIDENCE_CLASS.Low)}>
            {fc.confidence}
          </span>
          <ChevronRight
            size={12}
            className={cn("text-muted transition-transform", expanded && "rotate-90 text-amber-500")}
          />
        </div>
      </button>

      {expanded && fc.diff && (
        <div className="border-t border-navy-700/50 bg-navy-950/50 max-h-96 overflow-y-auto scrollbar-thin">
          <DiffViewer diff={fc.diff} />
        </div>
      )}
    </div>
  );
}

function EmptyFiles({
  onStartWatch,
  settings,
  setSettings,
  startingWatch,
}: {
  onStartWatch: () => void;
  settings: { watch_path: string | null };
  setSettings: (p: { watch_path: string | null }) => void;
  startingWatch: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-navy-800 border border-navy-600 flex items-center justify-center">
        <FolderOpen size={28} className="text-amber-600/50" />
      </div>
      <div>
        <p className="text-cream-200 font-medium mb-1">No file changes yet</p>
        <p className="text-sm text-muted">Set a project directory to watch for real-time changes.</p>
      </div>
      <div className="flex gap-2 w-full max-w-sm">
        <input
          type="text"
          value={settings.watch_path ?? ""}
          onChange={(e) => setSettings({ watch_path: e.target.value || null })}
          placeholder="C:\Users\…\my-project"
          className="flex-1 h-8 px-3 text-xs rounded-lg bg-navy-800 border border-navy-600 text-cream-100 placeholder:text-muted focus:outline-none focus:border-amber-600 transition font-mono"
        />
        <button
          onClick={onStartWatch}
          disabled={!settings.watch_path || startingWatch}
          className="h-8 px-4 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition shadow-amber-sm"
        >
          {startingWatch ? "Starting…" : "Watch"}
        </button>
      </div>
    </div>
  );
}
