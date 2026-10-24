import {
  Activity,
  FileCode2,
  Sparkles,
  Clock,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";

type View = "timeline" | "files" | "analysis" | "sessions" | "settings";

const NAV_ITEMS: { id: View; icon: React.ElementType; label: string }[] = [
  { id: "timeline",  icon: Activity,   label: "Timeline"  },
  { id: "files",     icon: FileCode2,  label: "Files"     },
  { id: "analysis",  icon: Sparkles,   label: "Analysis"  },
  { id: "sessions",  icon: Clock,      label: "Sessions"  },
];

export function Sidebar() {
  const { activeView, setActiveView, ipcConnected, setSettingsOpen } =
    useAppStore();

  return (
    <aside className="w-16 flex flex-col items-center py-4 gap-1 bg-navy-900 border-r border-navy-700 shrink-0">
      {/* Logo */}
      <div className="mb-4 p-2">
        <img src="/icon.png" alt="Sidecar" className="w-9 h-9 rounded-lg shadow-amber-sm" />
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            title={label}
            onClick={() => setActiveView(id)}
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
              "hover:bg-navy-700 hover:text-amber-500",
              activeView === id
                ? "bg-amber-600/20 text-amber-500 shadow-amber-sm"
                : "text-muted"
            )}
          >
            <Icon size={18} />
          </button>
        ))}
      </nav>

      {/* Bottom: IPC status + settings */}
      <div className="flex flex-col items-center gap-2">
        <div
          title={ipcConnected ? "Hook receiver connected" : "Waiting for Claude Code hooks"}
          className={cn(
            "w-2 h-2 rounded-full",
            ipcConnected ? "bg-emerald-400 shadow-[0_0_6px_#4ade80]" : "bg-navy-600"
          )}
        />
        {ipcConnected ? (
          <Wifi size={14} className="text-emerald-400" />
        ) : (
          <WifiOff size={14} className="text-muted" />
        )}
        <button
          title="Settings"
          onClick={() => setSettingsOpen(true)}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-muted hover:text-amber-500 hover:bg-navy-700 transition-all"
        >
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
}
