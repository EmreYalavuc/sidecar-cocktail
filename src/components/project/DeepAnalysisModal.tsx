import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Loader2, FolderOpen, Cpu, Code2, Layers, ArrowRight, Lightbulb, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";

interface DeepAnalysisResult {
  path:         string;
  file_count:   number;
  lang_counts:  Record<string, number>;
  tree_preview: string;
  analysis:     string;
  provider:     string;
  model:        string;
  tokens_used:  number;
  cost_usd:     number;
}

interface Parsed {
  title?:             string;
  purpose?:           string;
  tech_stack?:        string[];
  architecture?:      string;
  key_modules?:       { name: string; role: string }[];
  entry_points?:      string[];
  data_flow?:         string;
  notable_patterns?:  string[];
  recommendations?:   string[];
}

interface Props {
  path: string;
  onClose: () => void;
}

export function DeepAnalysisModal({ path, onClose }: Props) {
  const { settings } = useAppStore();
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<DeepAnalysisResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [showTree, setShowTree] = useState(false);

  const apiReady = settings.gemini_api_key_set || settings.claude_api_key_set;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<DeepAnalysisResult>("deep_analyze_project", {
        path,
        provider: settings.active_provider,
        model: settings.active_provider === "gemini" ? settings.gemini_model : settings.claude_model,
      });
      setResult(res);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  let parsed: Parsed | null = null;
  if (result) {
    try { parsed = JSON.parse(result.analysis); } catch {}
  }

  const shortPath = (() => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.length <= 2 ? parts.join("/") : "…/" + parts.slice(-2).join("/");
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[680px] max-h-[88vh] bg-navy-900 border border-navy-600 rounded-2xl shadow-panel overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700 shrink-0">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-amber-500" />
            <span className="text-sm font-semibold text-cream-100">Deep Project Analysis</span>
            <span className="text-xs text-muted font-mono bg-navy-800 px-2 py-0.5 rounded">{shortPath}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-cream-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {!result && !loading && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="w-20 h-20 rounded-2xl bg-navy-800 border border-navy-600 flex items-center justify-center">
                <Layers size={36} className="text-amber-500/60" />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-cream-200 font-medium mb-2">Analyze Project Structure</p>
                <p className="text-sm text-muted leading-relaxed">
                  Scans all source files, reads configuration, samples key modules, and asks {settings.active_provider === "gemini" ? "Gemini" : "Claude"} to produce an architecture overview.
                </p>
                <p className="text-xs text-muted mt-2 font-mono">{path}</p>
              </div>

              {!apiReady ? (
                <p className="text-sm text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-2">
                  Save a Gemini or Claude API key in Settings first.
                </p>
              ) : (
                <button onClick={run}
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-navy-900 font-semibold text-sm transition-all flex items-center gap-2">
                  <Cpu size={14} /> Start Deep Analysis
                </button>
              )}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 size={32} className="animate-spin text-amber-500" />
              <p className="text-sm text-muted">Scanning files and calling AI…</p>
              <p className="text-xs text-muted/60">This may take 20–60 seconds for large projects.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {result && parsed && (
            <div className="space-y-5">

              {/* Title + purpose */}
              <div>
                <h2 className="text-lg font-bold text-cream-100 mb-1">{parsed.title ?? shortPath}</h2>
                <p className="text-sm text-cream-200 leading-relaxed">{parsed.purpose}</p>
              </div>

              {/* Tech stack pills */}
              {parsed.tech_stack && parsed.tech_stack.length > 0 && (
                <div>
                  <SectionLabel icon={<Code2 size={11} />} label="Tech Stack" />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {parsed.tech_stack.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950/50 border border-amber-800/60 text-amber-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Architecture */}
              {parsed.architecture && (
                <div>
                  <SectionLabel icon={<Layers size={11} />} label="Architecture" />
                  <p className="text-sm text-cream-200 leading-relaxed mt-1">{parsed.architecture}</p>
                </div>
              )}

              {/* Key modules */}
              {parsed.key_modules && parsed.key_modules.length > 0 && (
                <div>
                  <SectionLabel icon={<FolderOpen size={11} />} label="Key Modules" />
                  <div className="mt-1.5 space-y-1.5">
                    {parsed.key_modules.map((m) => (
                      <div key={m.name} className="flex gap-2 bg-navy-800 rounded-lg px-3 py-2">
                        <span className="text-xs font-mono text-amber-400 shrink-0 min-w-[120px]">{m.name}</span>
                        <span className="text-xs text-muted">{m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entry points */}
              {parsed.entry_points && parsed.entry_points.length > 0 && (
                <div>
                  <SectionLabel icon={<ArrowRight size={11} />} label="Entry Points" />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {parsed.entry_points.map((f) => (
                      <span key={f} className="text-[11px] font-mono px-2 py-0.5 rounded bg-navy-800 border border-navy-600 text-cream-300">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Data flow */}
              {parsed.data_flow && (
                <div>
                  <SectionLabel icon={<ArrowRight size={11} />} label="Data Flow" />
                  <p className="text-sm text-cream-200 leading-relaxed mt-1">{parsed.data_flow}</p>
                </div>
              )}

              {/* Notable patterns */}
              {parsed.notable_patterns && parsed.notable_patterns.length > 0 && (
                <div>
                  <SectionLabel icon={<Layers size={11} />} label="Notable Patterns" />
                  <ul className="mt-1.5 space-y-1">
                    {parsed.notable_patterns.map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-cream-200">
                        <span className="text-amber-500 mt-0.5 shrink-0">·</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {parsed.recommendations && parsed.recommendations.length > 0 && (
                <div>
                  <SectionLabel icon={<Lightbulb size={11} />} label="Recommendations" />
                  <ul className="mt-1.5 space-y-1">
                    {parsed.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-cream-200">
                        <span className="text-emerald-400 mt-0.5 shrink-0">✓</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stats + File tree toggle */}
              <div className="border-t border-navy-700 pt-4 space-y-3">
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1"><FolderOpen size={10} /> {result.file_count} files scanned</span>
                  <span>{result.tokens_used.toLocaleString()} tokens</span>
                  <span className="flex items-center gap-1"><DollarSign size={10} className="text-emerald-400" />${result.cost_usd.toFixed(4)}</span>
                  <span>{result.provider} / {result.model}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(result.lang_counts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([lang, count]) => (
                      <span key={lang} className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 border border-navy-600 text-muted">
                        {lang} {count}
                      </span>
                    ))}
                </div>
                <button onClick={() => setShowTree(!showTree)}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  {showTree ? "▲ Hide" : "▼ Show"} directory tree
                </button>
                {showTree && (
                  <pre className="text-[10px] font-mono text-muted bg-navy-950 rounded-lg p-3 overflow-x-auto max-h-64 scrollbar-thin">
                    {result.tree_preview}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Raw JSON fallback if parse fails */}
          {result && !parsed && (
            <pre className="text-xs text-cream-200 font-mono bg-navy-950 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
              {result.analysis}
            </pre>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div className="px-6 py-4 border-t border-navy-700 flex justify-between items-center shrink-0">
            <button onClick={run} disabled={loading}
              className={cn("text-xs text-muted hover:text-amber-400 transition-colors flex items-center gap-1",
                loading && "opacity-40 cursor-not-allowed")}>
              <Loader2 size={11} className={loading ? "animate-spin" : ""} /> Re-analyze
            </button>
            <button onClick={onClose}
              className="px-4 py-2 text-xs rounded-lg bg-navy-800 text-muted hover:text-cream-100 border border-navy-600 transition-all">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
      {icon} {label}
    </p>
  );
}
