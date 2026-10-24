import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, AlertTriangle, DollarSign, RefreshCw } from "lucide-react";
import { cn, riskBadgeClass, formatTime } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAppStore } from "@/stores/appStore";
import type { Analysis, RiskLevel } from "@/types";

export function AnalysisView() {
  const { analyses, activeSessionId, settings, pendingAnalysisIds } = useAppStore();
  const [runningId, setRunningId] = useState<string | null>(null);

  const sessionAnalyses = activeSessionId
    ? analyses.filter((a) => a.session_id === activeSessionId)
    : analyses;

  if (sessionAnalyses.length === 0 && pendingAnalysisIds.size === 0) {
    return <EmptyAnalysis />;
  }

  async function rerun(eventId: string) {
    setRunningId(eventId);
    try {
      await invoke("analyze_event", {
        eventId,
        mode: "permission",
        provider: settings.active_provider,
        model: settings.active_provider === "gemini" ? settings.gemini_model : settings.claude_model,
      });
    } catch (e) {
      console.error("Analysis failed:", e);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cost header */}
      <CostBar analyses={sessionAnalyses} />

      {/* Analysis cards */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {pendingAnalysisIds.size > 0 && <SkeletonCard />}

        {sessionAnalyses.map((a) => (
          <AnalysisCard
            key={a.id}
            analysis={a}
            running={runningId === a.event_id}
            onRerun={() => rerun(a.event_id)}
          />
        ))}
      </div>
    </div>
  );
}

function CostBar({
  analyses,
}: {
  analyses: Analysis[];
}) {
  const totalTokens = analyses.reduce((s, a) => s + a.tokens_used, 0);
  const totalCost   = analyses.reduce((s, a) => s + a.cost_usd, 0);

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-navy-700 bg-navy-900">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Sparkles size={12} className="text-amber-500" />
        <span>{analyses.length} analyses</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>{totalTokens.toLocaleString()} tokens</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <DollarSign size={12} className="text-emerald-400" />
        <span className="text-emerald-400">${totalCost.toFixed(4)}</span>
      </div>
    </div>
  );
}

function AnalysisCard({
  analysis,
  running,
  onRerun,
}: {
  analysis: Analysis;
  running: boolean;
  onRerun: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Try to parse JSON content for structured display
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(analysis.content); } catch {}

  return (
    <div className="rounded-xl border border-navy-600 bg-navy-800/50 overflow-hidden">
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-navy-700/30 transition-colors"
      >
        <Sparkles size={14} className="text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-amber-400 uppercase tracking-wide">
              {analysis.mode.replace("_", " ")}
            </span>
            <span className="text-[10px] text-muted">· {analysis.provider}</span>
            {analysis.risk_level && (
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", riskBadgeClass(analysis.risk_level as RiskLevel))}>
                {analysis.risk_level}
              </span>
            )}
            {analysis.secrets_redacted > 0 && (
              <span className="text-[10px] text-orange-400 bg-orange-950 border border-orange-800 px-1.5 py-0.5 rounded">
                {analysis.secrets_redacted} secret{analysis.secrets_redacted > 1 ? "s" : ""} redacted
              </span>
            )}
          </div>

          {parsed?.summary || parsed?.headline ? (
            <p className="text-xs text-cream-200 leading-relaxed line-clamp-2">
              {String(parsed.summary ?? parsed.headline)}
            </p>
          ) : (
            <p className="text-xs text-cream-200 leading-relaxed line-clamp-2">
              {analysis.content.slice(0, 120)}…
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted font-mono">{formatTime(analysis.created_at)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRerun(); }}
            disabled={running}
            className="p-1 rounded hover:bg-navy-600 text-muted hover:text-amber-400 transition-colors disabled:opacity-40"
            title="Re-run analysis"
          >
            <RefreshCw size={11} className={running ? "animate-spin" : ""} />
          </button>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-navy-700 p-4 space-y-3">
          {parsed ? (
            <StructuredContent data={parsed} />
          ) : (
            <pre className="text-xs text-cream-200 font-mono whitespace-pre-wrap bg-navy-950 rounded-lg p-3 overflow-x-auto">
              {analysis.content}
            </pre>
          )}
          <div className="flex gap-3 text-[10px] text-muted pt-1 border-t border-navy-700">
            <span>{analysis.tokens_used} tokens</span>
            <span>${analysis.cost_usd.toFixed(5)}</span>
            <span>{analysis.model ?? analysis.provider}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StructuredContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {data.explanation != null && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Explanation</p>
          <p className="text-xs text-cream-200 leading-relaxed">{String(data.explanation)}</p>
        </div>
      )}
      {data.headline != null && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Summary</p>
          <p className="text-xs text-cream-200 leading-relaxed">{String(data.headline)}</p>
        </div>
      )}
      {data.summary != null && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Summary</p>
          <p className="text-xs text-cream-200 leading-relaxed">{String(data.summary)}</p>
        </div>
      )}
      {Array.isArray(data.side_effects) && data.side_effects.length > 0 && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Side Effects</p>
          <ul className="space-y-1">
            {data.side_effects.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-cream-200">
                <span className="text-amber-500 mt-0.5">·</span> {String(s)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(data.potential_issues) && data.potential_issues.length > 0 && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Potential Issues</p>
          <ul className="space-y-1">
            {data.potential_issues.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-red-300">
                <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {String(s)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(data.milestones) && data.milestones.length > 0 && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Milestones</p>
          <ul className="space-y-1">
            {data.milestones.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-300">
                <span className="mt-0.5">✓</span> {String(s)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.recommendation != null && (
        <div className="bg-navy-900 rounded-lg p-3 border border-navy-600">
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Recommendation</p>
          <p className="text-xs text-cream-200 leading-relaxed">{String(data.recommendation)}</p>
        </div>
      )}
    </div>
  );
}

function EmptyAnalysis() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-navy-800 border border-navy-600 flex items-center justify-center">
        <Sparkles size={28} className="text-amber-600/50" />
      </div>
      <div>
        <p className="text-cream-200 font-medium mb-1">No analyses yet</p>
        <p className="text-sm text-muted leading-relaxed max-w-xs">
          Save your Gemini or Claude API key in Settings. High/Critical events will be analyzed automatically.
        </p>
      </div>
    </div>
  );
}
