import { Search, Filter, Bell } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";

const VIEW_TITLES: Record<string, string> = {
  timeline: "Activity Timeline",
  files:    "File Changes",
  analysis: "AI Analysis",
  sessions: "Sessions",
  settings: "Settings",
};

export function Header() {
  const {
    activeView,
    searchQuery,
    setSearchQuery,
    filterRisk,
    setFilterRisk,
    ipcConnected,
    activeSessionId,
    settings,
  } = useAppStore();

  const apiReady = settings.gemini_api_key_set || settings.claude_api_key_set;

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-navy-700 bg-navy-900 shrink-0">
      <h1 className="text-sm font-semibold text-cream-100 min-w-max">
        {VIEW_TITLES[activeView]}
      </h1>

      {activeSessionId && (
        <span className="text-xs text-muted font-mono truncate max-w-[160px]">
          {activeSessionId.slice(0, 8)}
        </span>
      )}

      <div className="flex-1" />

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search events, files…"
          className={cn(
            "h-8 w-52 pl-8 pr-3 rounded-lg text-xs",
            "bg-navy-800 border border-navy-600 text-cream-100 placeholder:text-muted",
            "focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600/30 transition"
          )}
        />
      </div>

      {/* Risk filter */}
      <div className="relative">
        <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <select
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value)}
          className={cn(
            "h-8 pl-8 pr-6 rounded-lg text-xs appearance-none",
            "bg-navy-800 border border-navy-600 text-cream-100",
            "focus:outline-none focus:border-amber-600 transition"
          )}
        >
          <option value="all">All risk</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Connection indicator */}
      <div
        title={
          !apiReady
            ? "No API key — open Settings to add Gemini or Claude key"
            : ipcConnected
            ? "API key set · receiving live hook events"
            : "API key set · waiting for Claude Code hooks"
        }
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs",
          apiReady
            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
            : "bg-navy-800 text-muted border border-navy-600"
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            !apiReady
              ? "bg-navy-500"
              : ipcConnected
              ? "bg-emerald-400 animate-pulse"
              : "bg-emerald-600"
          )}
        />
        {!apiReady ? "Offline" : ipcConnected ? "Live" : "Online"}
      </div>

      <button
        title="Notifications"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-amber-500 hover:bg-navy-700 transition-all"
      >
        <Bell size={16} />
      </button>
    </header>
  );
}
