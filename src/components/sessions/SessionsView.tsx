import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitCompareArrows, Download, Folder, Clock, Zap, FileText } from "lucide-react";
import { cn, formatRelative } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";
import type { Session } from "@/types";
import { ExportModal } from "@/components/export/ExportModal";
import { SessionCompare } from "./SessionCompare";

export function SessionsView() {
  const { sessions, setSessions, activeSessionId, setActiveSession } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [exportSession, setExportSession] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const data = await invoke<Session[]>("list_sessions");
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectForCompare(id: string) {
    if (!selectedA) {
      setSelectedA(id);
    } else if (!selectedB && id !== selectedA) {
      setSelectedB(id);
    } else {
      setSelectedA(id);
      setSelectedB(null);
    }
  }

  function startCompare() {
    if (selectedA && selectedB) setShowCompare(true);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-700 shrink-0">
        <h2 className="text-sm font-semibold text-cream-100">Sessions</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCompareMode(!compareMode); setSelectedA(null); setSelectedB(null); }}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all",
              compareMode
                ? "bg-amber-950 text-amber-400 border-amber-800"
                : "bg-navy-800 text-muted border-navy-700 hover:border-amber-700"
            )}
          >
            <GitCompareArrows size={12} />
            Compare
          </button>
          {compareMode && selectedA && selectedB && (
            <button
              onClick={startCompare}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-navy-900 font-medium transition-colors"
            >
              Go →
            </button>
          )}
        </div>
      </div>

      {compareMode && (
        <div className="px-4 py-2 bg-navy-800 border-b border-navy-700 text-xs text-muted">
          Select 2 sessions to compare.
          {selectedA && <span className="text-amber-400 ml-1">A selected.</span>}
          {selectedB && <span className="text-amber-400 ml-1">B selected.</span>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="p-8 text-center text-xs text-muted">Loading sessions…</div>
        )}
        {!loading && sessions.length === 0 && (
          <div className="p-8 text-center text-xs text-muted">
            No sessions yet. Start Claude Code in a project directory.
          </div>
        )}
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            isActive={s.id === activeSessionId}
            compareMode={compareMode}
            isA={selectedA === s.id}
            isB={selectedB === s.id}
            onSelect={() => {
              if (compareMode) handleSelectForCompare(s.id);
              else setActiveSession(s.id);
            }}
            onExport={() => setExportSession(s.id)}
          />
        ))}
      </div>

      {exportSession && (
        <ExportModal sessionId={exportSession} onClose={() => setExportSession(null)} />
      )}
      {showCompare && selectedA && selectedB && (
        <SessionCompare
          sessionA={selectedA}
          sessionB={selectedB}
          onClose={() => { setShowCompare(false); setCompareMode(false); setSelectedA(null); setSelectedB(null); }}
        />
      )}
    </div>
  );
}

interface CardProps {
  session: Session;
  isActive: boolean;
  compareMode: boolean;
  isA: boolean;
  isB: boolean;
  onSelect: () => void;
  onExport: () => void;
}

function SessionCard({ session: s, isActive, compareMode, isA, isB, onSelect, onExport }: CardProps) {
  const label = isA ? "A" : isB ? "B" : null;
  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-b border-navy-700 cursor-pointer transition-colors",
        isActive && !compareMode && "bg-navy-800",
        (isA || isB) && "bg-amber-950/20",
        !isActive && !isA && !isB && "hover:bg-navy-800/50"
      )}
    >
      {label && (
        <div className="mt-0.5 w-5 h-5 rounded bg-amber-600 text-navy-900 text-[10px] font-bold flex items-center justify-center shrink-0">
          {label}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Folder size={11} className="text-amber-500 shrink-0" />
          <span className="text-xs text-cream-100 font-mono truncate">{s.project_path.split(/[\\/]/).at(-1) ?? s.project_path}</span>
          {!s.ended_at && (
            <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950 text-emerald-400 rounded font-medium">LIVE</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1"><Clock size={9} />{formatRelative(s.started_at)}</span>
          <span className="flex items-center gap-1"><Zap size={9} />{s.tool_count} events</span>
          <span className="flex items-center gap-1"><FileText size={9} />{s.file_count} files</span>
        </div>
        <p className="text-[10px] text-muted mt-0.5 font-mono truncate">{s.project_path}</p>
      </div>
      {!compareMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onExport(); }}
          className="shrink-0 text-muted hover:text-amber-400 transition-colors p-1"
          title="Export session"
        >
          <Download size={12} />
        </button>
      )}
    </div>
  );
}
