import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionSummary {
  session_id: string;
  project_path: string;
  started_at: string;
  event_count: number;
  file_count: number;
  total_tokens: number;
  total_cost: number;
  risk_critical: number;
  risk_high: number;
  risk_medium: number;
  risk_low: number;
  top_tools: [string, number][];
}

interface CompareData { a: SessionSummary; b: SessionSummary; }

interface Props {
  sessionA: string;
  sessionB: string;
  onClose: () => void;
}

export function SessionCompare({ sessionA, sessionB, onClose }: Props) {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<CompareData>("compare_sessions", { sessionA, sessionB })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sessionA, sessionB]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[780px] max-h-[85vh] bg-navy-900 border border-navy-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
          <h2 className="text-sm font-semibold text-cream-100">Session Comparison</h2>
          <button onClick={onClose} className="text-muted hover:text-cream-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {loading && <div className="text-center text-xs text-muted py-8">Loading…</div>}
          {error && <div className="text-center text-xs text-red-400 py-8">{error}</div>}
          {data && <CompareTable a={data.a} b={data.b} />}
        </div>
      </div>
    </div>
  );
}

function CompareTable({ a, b }: { a: SessionSummary; b: SessionSummary }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted text-center">
        <div className="text-left">Metric</div>
        <div className="bg-navy-800 rounded-lg px-3 py-2 text-amber-400">
          Session A
          <div className="text-[10px] text-muted font-normal mt-0.5 truncate">
            {a.project_path.split(/[\\/]/).at(-1)}
          </div>
        </div>
        <div className="bg-navy-800 rounded-lg px-3 py-2 text-amber-400">
          Session B
          <div className="text-[10px] text-muted font-normal mt-0.5 truncate">
            {b.project_path.split(/[\\/]/).at(-1)}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <MetricRow label="Events" a={a.event_count} b={b.event_count} />
      <MetricRow label="File Changes" a={a.file_count} b={b.file_count} />
      <MetricRow label="Tokens Used" a={a.total_tokens} b={b.total_tokens} />
      <MetricRow label="AI Cost (USD)" a={a.total_cost} b={b.total_cost} format={(v) => `$${v.toFixed(4)}`} />

      {/* Risk */}
      <div>
        <p className="text-xs text-muted mb-2 font-semibold">Risk Breakdown</p>
        <RiskRow label="Critical" a={a.risk_critical} b={b.risk_critical} danger />
        <RiskRow label="High" a={a.risk_high} b={b.risk_high} warn />
        <RiskRow label="Medium" a={a.risk_medium} b={b.risk_medium} />
        <RiskRow label="Low" a={a.risk_low} b={b.risk_low} />
      </div>

      {/* Top Tools */}
      <div className="grid grid-cols-2 gap-4">
        <ToolList label="A — Top Tools" tools={a.top_tools} />
        <ToolList label="B — Top Tools" tools={b.top_tools} />
      </div>
    </div>
  );
}

function MetricRow({
  label, a, b,
  format = (v: number) => v.toString(),
}: { label: string; a: number; b: number; format?: (v: number) => string }) {
  const diff = b - a;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const iconColor = diff === 0 ? "text-muted" : diff > 0 ? "text-orange-400" : "text-emerald-400";

  return (
    <div className="grid grid-cols-3 gap-2 items-center text-xs">
      <span className="text-muted">{label}</span>
      <span className="text-center text-cream-100 font-mono bg-navy-800 rounded-lg px-3 py-1.5">{format(a)}</span>
      <span className="text-center text-cream-100 font-mono bg-navy-800 rounded-lg px-3 py-1.5 flex items-center justify-center gap-1">
        {format(b)}
        <Icon size={10} className={cn("shrink-0", iconColor)} />
      </span>
    </div>
  );
}

function RiskRow({ label, a, b, danger, warn }: { label: string; a: number; b: number; danger?: boolean; warn?: boolean }) {
  const color = danger ? "text-red-400" : warn ? "text-orange-400" : "text-amber-400";
  return (
    <div className="grid grid-cols-3 gap-2 items-center text-xs mb-1">
      <span className={cn("text-xs", color)}>{label}</span>
      <span className="text-center font-mono bg-navy-800 rounded px-2 py-1 text-cream-100">{a}</span>
      <span className="text-center font-mono bg-navy-800 rounded px-2 py-1 text-cream-100">{b}</span>
    </div>
  );
}

function ToolList({ label, tools }: { label: string; tools: [string, number][] }) {
  return (
    <div className="bg-navy-800 rounded-lg p-3">
      <p className="text-[10px] text-muted mb-2 font-semibold">{label}</p>
      {tools.length === 0 && <p className="text-[10px] text-muted">No data</p>}
      {tools.map(([name, count]) => (
        <div key={name} className="flex items-center justify-between text-xs py-0.5">
          <span className="text-cream-200">{name}</span>
          <span className="text-amber-400 font-mono">{count}</span>
        </div>
      ))}
    </div>
  );
}
