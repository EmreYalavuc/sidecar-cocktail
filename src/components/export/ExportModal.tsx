import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { X, Download, FileJson, FileText, Globe, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Format = "json" | "markdown" | "html";

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function ExportModal({ sessionId, onClose }: Props) {
  const [format, setFormat] = useState<Format>("markdown");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      let content: string;
      let ext: string;
      if (format === "json") {
        content = await invoke<string>("export_json", { sessionId });
        ext = "json";
      } else if (format === "markdown") {
        content = await invoke<string>("export_markdown", { sessionId });
        ext = "md";
      } else {
        content = await invoke<string>("export_html", { sessionId });
        ext = "html";
      }

      const path = await save({
        defaultPath: `sidecar-report-${sessionId.slice(0, 8)}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });

      if (path) {
        await writeTextFile(path, content);
        setDone(true);
        setTimeout(() => { setDone(false); onClose(); }, 1500);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-96 bg-navy-900 border border-navy-600 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
          <h2 className="text-sm font-semibold text-cream-100">Export Session</h2>
          <button onClick={onClose} className="text-muted hover:text-cream-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted">Choose a format to export this session's events, file changes, and AI analyses.</p>

          <div className="space-y-2">
            {([
              { id: "markdown" as Format, icon: FileText, label: "Markdown", desc: "Readable report with tables" },
              { id: "html"     as Format, icon: Globe,    label: "HTML",     desc: "Print-ready web page" },
              { id: "json"     as Format, icon: FileJson, label: "JSON",     desc: "Raw structured data" },
            ] as const).map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                onClick={() => setFormat(id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                  format === id
                    ? "bg-amber-950/40 border-amber-700 text-cream-100"
                    : "bg-navy-800 border-navy-700 text-muted hover:border-navy-600"
                )}
              >
                <Icon size={16} className={format === id ? "text-amber-400" : "text-muted"} />
                <div>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-[10px] text-muted">{desc}</p>
                </div>
                {format === id && (
                  <div className="ml-auto w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                    <Check size={10} className="text-navy-900" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2 border border-red-900">{error}</div>
          )}

          <button
            onClick={handleExport}
            disabled={loading || done}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all",
              done
                ? "bg-emerald-700 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-navy-900",
              (loading || done) && "cursor-not-allowed opacity-80"
            )}
          >
            {loading ? (
              <><Loader2 size={13} className="animate-spin" /> Generating…</>
            ) : done ? (
              <><Check size={13} /> Saved!</>
            ) : (
              <><Download size={13} /> Save File</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
