import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, MessageSquare, Sparkles, X, Loader2 } from "lucide-react";
import { cn, riskBadgeClass, formatTime } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAppStore } from "@/stores/appStore";
import type { RiskLevel } from "@/types";

interface Props { eventId: string; }

export function EventDetail({ eventId }: Props) {
  const { events, analyses, pendingAnalysisIds, setSelectedEvent, updateEvent, settings } = useAppStore();
  const [savingNote, setSavingNote] = useState(false);
  const [togglingBookmark, setTogglingBookmark] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const event = events.find((e) => e.id === eventId);
  if (!event) return null;

  const eventAnalyses = analyses.filter((a) => a.event_id === eventId);
  const isPending = pendingAnalysisIds.has(eventId);
  const apiReady = settings.gemini_api_key_set || settings.claude_api_key_set;

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await invoke("analyze_event", {
        eventId,
        mode: "permission",
        provider: settings.active_provider,
        model: settings.active_provider === "gemini" ? settings.gemini_model : settings.claude_model,
      });
    } catch (e: unknown) {
      setAnalyzeError(typeof e === "string" ? e : "Analysis failed. Check your API key.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function toggleBookmark() {
    setTogglingBookmark(true);
    try {
      await invoke("toggle_bookmark", { eventId });
      updateEvent(eventId, { is_bookmarked: !event!.is_bookmarked });
    } finally {
      setTogglingBookmark(false);
    }
  }

  async function saveAnnotation() {
    const note = noteRef.current?.value ?? "";
    setSavingNote(true);
    try {
      await invoke("set_annotation", { eventId, note });
      updateEvent(eventId, { annotation: note || null });
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-cream-100">
            {event.tool_name ?? event.event_type}
          </span>
          {event.risk_level && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", riskBadgeClass(event.risk_level))}>
              {event.risk_level}
            </span>
          )}
        </div>
        <button onClick={() => setSelectedEvent(null)} className="text-muted hover:text-cream-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-navy-800 rounded-lg p-3">
            <p className="text-muted mb-1">Time</p>
            <p className="text-cream-100 font-mono">{formatTime(event.timestamp)}</p>
          </div>
          <div className="bg-navy-800 rounded-lg p-3">
            <p className="text-muted mb-1">Type</p>
            <p className="text-cream-100">{event.event_type}</p>
          </div>
          {event.working_dir && (
            <div className="col-span-2 bg-navy-800 rounded-lg p-3">
              <p className="text-muted mb-1">Working Directory</p>
              <p className="text-cream-100 font-mono text-[11px] break-all">{event.working_dir}</p>
            </div>
          )}
        </div>

        {/* Tool input */}
        {event.tool_input && (
          <div>
            <p className="text-xs text-muted mb-2">Tool Input</p>
            <pre className="text-[11px] text-cream-200 font-mono bg-navy-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-48 scrollbar-thin">
              {JSON.stringify(event.tool_input, null, 2)}
            </pre>
          </div>
        )}

        {/* File paths */}
        {event.file_paths.length > 0 && (
          <div>
            <p className="text-xs text-muted mb-2">Files</p>
            <div className="space-y-1">
              {event.file_paths.map((p) => (
                <div key={p} className="text-[11px] font-mono text-amber-400 bg-navy-800 rounded px-2 py-1 truncate">{p}</div>
              ))}
            </div>
          </div>
        )}

        {/* Annotation */}
        <div>
          <p className="text-xs text-muted mb-2 flex items-center gap-1">
            <MessageSquare size={10} /> Note
          </p>
          <textarea
            ref={noteRef}
            defaultValue={event.annotation ?? ""}
            onBlur={saveAnnotation}
            placeholder="Add a note to this event…"
            rows={2}
            className={cn(
              "w-full text-xs font-mono bg-navy-800 border border-navy-600 rounded-lg px-3 py-2",
              "text-cream-100 placeholder:text-muted resize-none",
              "focus:outline-none focus:border-amber-600 transition",
              savingNote && "opacity-60"
            )}
          />
          {savingNote && <p className="text-[10px] text-muted mt-1">Saving…</p>}
        </div>

        {/* Bookmark */}
        <button
          onClick={toggleBookmark}
          disabled={togglingBookmark}
          className={cn(
            "flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all w-full disabled:opacity-60",
            event.is_bookmarked
              ? "bg-amber-950 text-amber-400 border-amber-800"
              : "bg-navy-800 text-muted border-navy-600 hover:border-amber-700"
          )}
        >
          <Bookmark size={12} className={event.is_bookmarked ? "fill-amber-400" : ""} />
          {event.is_bookmarked ? "Bookmarked" : "Bookmark this event"}
        </button>

        {/* AI Analysis */}
        <div>
          <p className="text-xs text-muted mb-2 flex items-center gap-1">
            <Sparkles size={10} className="text-amber-500" /> AI Analysis
          </p>
          {isPending && <SkeletonCard />}
          {eventAnalyses.length === 0 && !isPending && (
            <div className="bg-navy-800 rounded-lg p-3 space-y-2">
              {apiReady ? (
                <>
                  <p className="text-xs text-muted text-center">No analysis yet for this event.</p>
                  <button
                    onClick={runAnalysis}
                    disabled={analyzing}
                    className={cn(
                      "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all",
                      "bg-amber-600 hover:bg-amber-500 text-navy-900 disabled:opacity-60 disabled:cursor-not-allowed"
                    )}
                  >
                    {analyzing
                      ? <><Loader2 size={11} className="animate-spin" /> Analyzing…</>
                      : <><Sparkles size={11} /> Analyze Now</>}
                  </button>
                  {analyzeError && (
                    <p className="text-[10px] text-red-400 text-center">{analyzeError}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted text-center">
                  No analysis yet.{" "}
                  <span className="text-amber-400">Configure API key in Settings.</span>
                </p>
              )}
            </div>
          )}
          {eventAnalyses.length > 0 && !isPending && (
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 rounded-lg text-xs font-medium transition-all border",
                "bg-navy-800 border-navy-600 text-muted hover:border-amber-700 hover:text-amber-400 disabled:opacity-40"
              )}
            >
              {analyzing
                ? <><Loader2 size={10} className="animate-spin" /> Analyzing…</>
                : <><Sparkles size={10} /> Re-analyze</>}
            </button>
          )}
          {eventAnalyses.map((a) => (
            <div key={a.id} className="bg-navy-800 rounded-lg p-3 border border-navy-700 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wide">
                  {a.mode.replace("_", " ")}
                </span>
                {a.risk_level && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", riskBadgeClass(a.risk_level as RiskLevel))}>
                    {a.risk_level}
                  </span>
                )}
              </div>
              <p className="text-xs text-cream-200 leading-relaxed line-clamp-4">{a.content}</p>
              <p className="text-[10px] text-muted mt-2">{a.tokens_used} tokens · ${a.cost_usd.toFixed(4)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
