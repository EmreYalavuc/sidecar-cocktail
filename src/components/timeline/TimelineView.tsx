import { Activity, FolderOpen, Trash2 } from "lucide-react";
import { EventItem } from "./EventItem";
import { EventDetail } from "./EventDetail";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";

function shortPath(p: string | null | undefined): string {
  if (!p) return "";
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/");
  return "…/" + parts.slice(-2).join("/");
}

export function TimelineView() {
  const { events, searchQuery, filterRisk, selectedEventId, setEvents, setSelectedEvent, settings } = useAppStore();

  // Prefer the first configured watch path; fall back to Claude Code's reported cwd
  const currentDir =
    settings.watch_paths[0] ??
    settings.watch_path ??
    events.find((e) => e.working_dir)?.working_dir ??
    null;

  const filtered = events.filter((e) => {
    if (filterRisk !== "all" && e.risk_level !== filterRisk) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.tool_name?.toLowerCase().includes(q) ||
      e.event_type.toLowerCase().includes(q) ||
      e.file_paths.some((p) => p.toLowerCase().includes(q))
    );
  });

  function clearEvents() {
    setSelectedEvent(null);
    setEvents([]);
  }

  return (
    <div className="flex h-full overflow-hidden flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-navy-700/60 bg-navy-900/50 shrink-0">
        {currentDir ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0" title={currentDir}>
            <FolderOpen size={12} className="text-amber-500 shrink-0" />
            <span className="text-xs font-mono text-cream-300 truncate">{shortPath(currentDir)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted flex-1">No active project</span>
        )}

        <span className="text-[10px] text-muted font-mono shrink-0">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>

        {events.length > 0 && (
          <button
            onClick={clearEvents}
            title="Clear timeline (memory only)"
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px]",
              "text-muted hover:text-red-400 hover:bg-red-950/30 border border-transparent",
              "hover:border-red-900 transition-all"
            )}
          >
            <Trash2 size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Event list + detail */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-navy-600">
          {filtered.length === 0 ? (
            <EmptyTimeline />
          ) : (
            filtered.map((e) => <EventItem key={e.id} event={e} />)
          )}
        </div>

        {selectedEventId && (
          <div className="w-[420px] border-l border-navy-700 overflow-y-auto">
            <EventDetail eventId={selectedEventId} />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyTimeline() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-navy-800 border border-navy-600 flex items-center justify-center">
        <Activity size={28} className="text-amber-600/50" />
      </div>
      <div>
        <p className="text-cream-200 font-medium mb-1">No events yet</p>
        <p className="text-sm text-muted leading-relaxed">
          Start a Claude Code session with hooks configured to see live activity here.
        </p>
      </div>
      <div className="mt-2 px-4 py-3 rounded-lg bg-navy-800 border border-navy-700 text-left">
        <p className="text-xs text-muted font-mono mb-1">Hook setup:</p>
        <code className="text-xs text-amber-400 font-mono">
          {"# Claude Code hooks → Settings → Hooks"}
        </code>
      </div>
    </div>
  );
}
