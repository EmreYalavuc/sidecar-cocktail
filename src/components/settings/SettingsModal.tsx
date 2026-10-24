import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { X, Key, Cpu, Radio, FolderOpen, Bell, Check, Plus, Trash2, Loader2, RefreshCw, AlertCircle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";
import { DeepAnalysisModal } from "@/components/project/DeepAnalysisModal";
import type { RiskLevel } from "@/types";

type KeyState = "idle" | "validating" | "valid" | "invalid_warn" | "saving" | "saved";

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen, settings, setSettings } = useAppStore();
  const [geminiKey, setGeminiKey]   = useState("");
  const [claudeKey, setClaudeKey]   = useState("");
  const [geminiKeyState, setGeminiKeyState] = useState<KeyState>("idle");
  const [claudeKeyState, setClaudeKeyState] = useState<KeyState>("idle");
  const [keyError, setKeyError]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [watchPaths, setWatchPaths] = useState<string[]>([]);
  const [newPath, setNewPath]       = useState("");

  // Gemini model fetch
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelError, setFetchModelError] = useState<string | null>(null);
  const [dynamicModels, setDynamicModels]   = useState<string[]>([]);

  // Deep analysis
  const [deepAnalyzePath, setDeepAnalyzePath] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsOpen) {
      setNewPath("");
      setGeminiKey("");
      setClaudeKey("");
      setGeminiKeyState("idle");
      setClaudeKeyState("idle");
      setKeyError(null);
      setDynamicModels([]);
      setFetchModelError(null);
      return;
    }
    invoke<{ watch_paths: string[] }>("get_settings")
      .then((s) => setWatchPaths(s.watch_paths))
      .catch(() => {});
  }, [settingsOpen]);

  async function saveKey(provider: "gemini" | "claude", key: string) {
    if (!key.trim()) return;
    setKeyError(null);

    if (provider === "gemini") {
      setGeminiKeyState("validating");
      let validationPassed = true;
      try {
        const valid = await invoke<boolean>("validate_api_key", { provider: "gemini", key: key.trim() });
        if (!valid) {
          validationPassed = false;
          setKeyError("Key could not be validated — saving anyway.");
          setGeminiKeyState("invalid_warn");
        }
      } catch (e: unknown) {
        validationPassed = false;
        setKeyError(typeof e === "string" ? e : "Validation failed (network?) — saving anyway.");
        setGeminiKeyState("invalid_warn");
      }
      // Save regardless — user might be offline or key might be region-restricted
      if (!validationPassed) await new Promise((r) => setTimeout(r, 1200));
      setGeminiKeyState("saving");
      try {
        await invoke("save_api_key", { provider: "gemini", key: key.trim() });
        setSettings({ gemini_api_key_set: true });
        setGeminiKey("");
        setKeyError(null);
        setGeminiKeyState("saved");
        setTimeout(() => setGeminiKeyState("idle"), 3000);
      } catch (e) {
        console.error("save_api_key failed:", e);
        setGeminiKeyState("idle");
      }
    } else {
      setClaudeKeyState("saving");
      try {
        await invoke("save_api_key", { provider: "claude", key: key.trim() });
        setSettings({ claude_api_key_set: true });
        setClaudeKey("");
        setClaudeKeyState("saved");
        setTimeout(() => setClaudeKeyState("idle"), 2000);
      } catch (e) {
        console.error("save_api_key failed:", e);
        setClaudeKeyState("idle");
      }
    }
  }

  async function fetchModels() {
    setFetchingModels(true);
    setFetchModelError(null);
    try {
      const models = await invoke<string[]>("fetch_gemini_models");
      // Strip the "models/" prefix that the Gemini API returns
      const names = models.map((m) => m.replace(/^models\//, ""));
      setDynamicModels(names);
    } catch (e: unknown) {
      setFetchModelError(typeof e === "string" ? e : "Failed to fetch models.");
    } finally {
      setFetchingModels(false);
    }
  }

  async function addPath() {
    const path = newPath.trim();
    if (!path || watchPaths.includes(path)) {
      setNewPath("");
      return;
    }
    setWatchPaths((p) => [...p, path]);
    setNewPath("");
  }

  async function browsePath() {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string" && selected) {
        setNewPath(selected);
      }
    } catch {}
  }

  async function removePath(path: string) {
    setWatchPaths((p) => p.filter((x) => x !== path));
    await invoke("stop_watching", { path }).catch(() => {});
  }

  async function handleSave() {
    setSaving(true);
    try {
      await invoke("save_settings", {
        settings: {
          active_provider:       settings.active_provider,
          gemini_model:          settings.gemini_model,
          claude_model:          settings.claude_model,
          auto_analyze_risk:     settings.auto_analyze_risk,
          ipc_port:              settings.ipc_port,
          notifications_enabled: settings.notifications_enabled,
          watch_paths:           watchPaths,
        },
      });

      for (const path of watchPaths) {
        await invoke("start_watching", { path }).catch(() => {});
        await invoke("add_watch_path", { path }).catch(() => {});
      }

      setSettings({ watch_path: watchPaths[0] ?? null, watch_paths: watchPaths });

      setSaved(true);
      setTimeout(() => { setSaved(false); setSettingsOpen(false); }, 1200);
    } catch (e) {
      console.error("save_settings failed:", e);
    } finally {
      setSaving(false);
    }
  }

  // Merge static + dynamic model lists (dynamic takes priority, no duplicates)
  const staticModels = [
    "gemini-4.0-flash","gemini-4.0-flash-lite","gemini-4.0-pro","gemini-4.0-ultra",
    "gemini-3.8-flash","gemini-3.8-flash-lite","gemini-3.8-pro",
    "gemini-3.7-flash","gemini-3.7-flash-lite","gemini-3.7-pro",
    "gemini-3.5-flash","gemini-3.5-flash-lite","gemini-3.5-pro",
    "gemini-3.0-flash","gemini-3.0-flash-lite","gemini-3.0-pro",
    "gemini-2.5-flash-lite","gemini-2.5-flash","gemini-2.5-flash-latest","gemini-2.5-pro","gemini-2.5-pro-latest",
    "gemini-2.0-flash","gemini-2.0-flash-lite","gemini-2.0-flash-latest","gemini-2.0-flash-thinking-exp",
    "gemini-1.5-flash","gemini-1.5-flash-latest","gemini-1.5-flash-8b","gemini-1.5-flash-8b-latest","gemini-1.5-pro","gemini-1.5-pro-latest",
    "gemini-1.0-pro","gemini-1.0-pro-latest",
  ];
  const allModels = dynamicModels.length > 0
    ? [...new Set([...dynamicModels, ...staticModels])]
    : staticModels;

  if (!settingsOpen) return null;

  return (
    <>
    {deepAnalyzePath && (
      <DeepAnalysisModal path={deepAnalyzePath} onClose={() => setDeepAnalyzePath(null)} />
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[560px] max-h-[82vh] bg-navy-900 border border-navy-600 rounded-2xl shadow-panel overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <h2 className="text-sm font-semibold text-cream-100">Settings</h2>
          <button onClick={() => setSettingsOpen(false)} className="text-muted hover:text-cream-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">

          {/* API Keys */}
          <section>
            <SectionTitle icon={<Key size={12} />} title="API Keys" />
            <div className="space-y-3">

              {/* Gemini Key */}
              <SettingRow label="Gemini API Key">
                <div className="flex gap-2">
                  <input type="password" value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); setKeyError(null); setGeminiKeyState("idle"); }}
                    onKeyDown={(e) => e.key === "Enter" && saveKey("gemini", geminiKey)}
                    placeholder={settings.gemini_api_key_set ? "••••••••••••" : "AIza…"}
                    className={cn(inputClass, "flex-1",
                      geminiKeyState === "invalid" && "border-red-500 focus:border-red-500")} />
                  <button onClick={() => saveKey("gemini", geminiKey)}
                    disabled={!geminiKey.trim() || geminiKeyState === "validating" || geminiKeyState === "saving"}
                    className={cn(btnClass, "min-w-[80px]",
                      geminiKeyState === "saved"        && "border-emerald-600 text-emerald-400",
                      geminiKeyState === "invalid_warn" && "border-orange-600 text-orange-400")}>
                    {geminiKeyState === "validating"   ? <><Loader2 size={11} className="animate-spin" /> Checking</> :
                     geminiKeyState === "saving"       ? <><Loader2 size={11} className="animate-spin" /> Saving</> :
                     geminiKeyState === "saved"        ? <><Check size={11} className="text-emerald-400" /> Saved!</> :
                     geminiKeyState === "invalid_warn" ? <><Loader2 size={11} className="animate-spin" /> Saving</> :
                     settings.gemini_api_key_set       ? "Update" : "Save"}
                  </button>
                </div>
                {keyError && geminiKeyState === "invalid_warn" && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertCircle size={11} className="text-orange-400 shrink-0" />
                    <p className="text-[10px] text-orange-400">{keyError}</p>
                  </div>
                )}
                {geminiKeyState === "saved" && (
                  <StatusText ok>Key validated and stored in OS credential vault</StatusText>
                )}
                {geminiKeyState !== "saved" && settings.gemini_api_key_set && (
                  <StatusText ok>Key stored in OS credential vault</StatusText>
                )}
              </SettingRow>

              {/* Claude Key */}
              <SettingRow label="Claude API Key (fallback)">
                <div className="flex gap-2">
                  <input type="password" value={claudeKey} onChange={(e) => setClaudeKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveKey("claude", claudeKey)}
                    placeholder={settings.claude_api_key_set ? "••••••••••••" : "sk-ant-…"}
                    className={cn(inputClass, "flex-1")} />
                  <button onClick={() => saveKey("claude", claudeKey)}
                    disabled={!claudeKey.trim() || claudeKeyState === "saving"}
                    className={cn(btnClass, "min-w-[60px]")}>
                    {claudeKeyState === "saving" ? "…" :
                     claudeKeyState === "saved"  ? <Check size={11} className="text-emerald-400" /> :
                     settings.claude_api_key_set ? "Update" : "Save"}
                  </button>
                </div>
                {settings.claude_api_key_set && <StatusText ok>Key stored in OS credential vault</StatusText>}
              </SettingRow>
            </div>
          </section>

          {/* AI Provider */}
          <section>
            <SectionTitle icon={<Cpu size={12} />} title="AI Provider" />
            <div className="space-y-3">
              <SettingRow label="Active Provider">
                <div className="flex gap-2">
                  {(["gemini", "claude"] as const).map((p) => (
                    <button key={p} onClick={() => setSettings({ active_provider: p })}
                      className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        settings.active_provider === p
                          ? "bg-amber-600/20 text-amber-400 border-amber-700"
                          : "bg-navy-800 text-muted border-navy-600 hover:border-navy-500")}>
                      {p === "gemini" ? "Gemini" : "Claude"}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow label="Gemini Model">
                <div className="flex gap-2">
                  <select value={allModels.includes(settings.gemini_model) ? settings.gemini_model : "__custom__"}
                    onChange={(e) => {
                      if (e.target.value !== "__custom__") setSettings({ gemini_model: e.target.value });
                    }}
                    className={cn(inputClass, "flex-1 cursor-pointer")}>
                    {/* Dynamic models (from API) first */}
                    {dynamicModels.length > 0 && (
                      <optgroup label="── From your Gemini account ──">
                        {dynamicModels.map((m) => <option key={m} value={m}>{m}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="── Gemini 4.x ──">
                      <option value="gemini-4.0-flash">gemini-4.0-flash</option>
                      <option value="gemini-4.0-flash-lite">gemini-4.0-flash-lite</option>
                      <option value="gemini-4.0-pro">gemini-4.0-pro</option>
                      <option value="gemini-4.0-ultra">gemini-4.0-ultra</option>
                    </optgroup>
                    <optgroup label="── Gemini 3.8 ──">
                      <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                      <option value="gemini-3.8-flash-lite">gemini-3.8-flash-lite</option>
                      <option value="gemini-3.8-pro">gemini-3.8-pro</option>
                    </optgroup>
                    <optgroup label="── Gemini 3.7 ──">
                      <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                      <option value="gemini-3.7-flash-lite">gemini-3.7-flash-lite</option>
                      <option value="gemini-3.7-pro">gemini-3.7-pro</option>
                    </optgroup>
                    <optgroup label="── Gemini 3.5 ──">
                      <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                      <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
                      <option value="gemini-3.5-pro">gemini-3.5-pro</option>
                    </optgroup>
                    <optgroup label="── Gemini 3.0 ──">
                      <option value="gemini-3.0-flash">gemini-3.0-flash</option>
                      <option value="gemini-3.0-flash-lite">gemini-3.0-flash-lite</option>
                      <option value="gemini-3.0-pro">gemini-3.0-pro</option>
                    </optgroup>
                    <optgroup label="── Gemini 2.5 ──">
                      <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                      <option value="gemini-2.5-flash-latest">gemini-2.5-flash-latest</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                      <option value="gemini-2.5-pro-latest">gemini-2.5-pro-latest</option>
                    </optgroup>
                    <optgroup label="── Gemini 2.0 ──">
                      <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                      <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
                      <option value="gemini-2.0-flash-latest">gemini-2.0-flash-latest</option>
                      <option value="gemini-2.0-flash-thinking-exp">gemini-2.0-flash-thinking-exp</option>
                    </optgroup>
                    <optgroup label="── Gemini 1.5 ──">
                      <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                      <option value="gemini-1.5-flash-latest">gemini-1.5-flash-latest</option>
                      <option value="gemini-1.5-flash-8b">gemini-1.5-flash-8b</option>
                      <option value="gemini-1.5-flash-8b-latest">gemini-1.5-flash-8b-latest</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                      <option value="gemini-1.5-pro-latest">gemini-1.5-pro-latest</option>
                    </optgroup>
                    <optgroup label="── Gemini 1.0 (legacy) ──">
                      <option value="gemini-1.0-pro">gemini-1.0-pro</option>
                      <option value="gemini-1.0-pro-latest">gemini-1.0-pro-latest</option>
                    </optgroup>
                    {/* Custom fallback */}
                    {!allModels.includes(settings.gemini_model) && (
                      <option value="__custom__">{settings.gemini_model} (custom)</option>
                    )}
                  </select>
                  <button onClick={fetchModels} disabled={fetchingModels || !settings.gemini_api_key_set}
                    title={settings.gemini_api_key_set ? "Load available models from your Gemini account" : "Save a Gemini API key first"}
                    className={cn(btnClass, "min-w-[72px]",
                      !settings.gemini_api_key_set && "opacity-40 cursor-not-allowed",
                      dynamicModels.length > 0 && !fetchingModels && "border-emerald-700 text-emerald-400")}>
                    {fetchingModels
                      ? <><Loader2 size={11} className="animate-spin" /> Loading</>
                      : dynamicModels.length > 0
                        ? <><Check size={11} /> {dynamicModels.length}</>
                        : <><RefreshCw size={11} /> Fetch</>}
                  </button>
                </div>
                {fetchModelError && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertCircle size={11} className="text-red-400 shrink-0" />
                    <p className="text-[10px] text-red-400">{fetchModelError}</p>
                  </div>
                )}
                {dynamicModels.length > 0 && !fetchModelError && (
                  <p className="text-[10px] text-emerald-400 mt-1">↑ Live models from your Gemini account — shown at top</p>
                )}
              </SettingRow>

              <SettingRow label="Claude Model">
                <input list="claude-models" value={settings.claude_model}
                  onChange={(e) => setSettings({ claude_model: e.target.value })}
                  placeholder="e.g. claude-sonnet-4-6" className={cn(inputClass, "w-full")} spellCheck={false} />
                <datalist id="claude-models">
                  {["claude-opus-4-8","claude-opus-4-7","claude-sonnet-4-6","claude-sonnet-4-5",
                    "claude-haiku-4-5-20251001","claude-fable-5","claude-opus-4-5",
                    "claude-3-5-sonnet-20241022","claude-3-5-haiku-20241022","claude-3-opus-20240229"
                  ].map((m) => <option key={m} value={m} />)}
                </datalist>
              </SettingRow>
            </div>
          </section>

          {/* File Watcher — multi-path */}
          <section>
            <SectionTitle icon={<FolderOpen size={12} />} title="File Watcher — Watched Paths" />
            <div className="space-y-2 mb-3">
              {watchPaths.length === 0 && (
                <p className="text-xs text-muted bg-navy-800 rounded-lg px-3 py-2">No paths watched. Add a project directory below.</p>
              )}
              {watchPaths.map((p) => (
                <div key={p} className="flex items-center gap-2 bg-navy-800 rounded-lg px-3 py-2">
                  <FolderOpen size={11} className="text-amber-500 shrink-0" />
                  <span className="flex-1 text-xs font-mono text-cream-200 truncate">{p}</span>
                  <button onClick={() => setDeepAnalyzePath(p)}
                    title="Deep Analyze — extract project structure with AI"
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-navy-600 text-muted hover:border-amber-700 hover:text-amber-400 transition-all">
                    <Layers size={10} /> Analyze
                  </button>
                  <button onClick={() => removePath(p)} className="text-muted hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newPath} onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPath()}
                placeholder="/path/to/project" className={cn(inputClass, "flex-1")} />
              <button onClick={browsePath} className={btnClass}>Browse</button>
              <button onClick={addPath} disabled={!newPath.trim()} className={cn(btnClass, "disabled:opacity-40")}>
                <Plus size={13} />
              </button>
            </div>
          </section>

          {/* IPC */}
          <section>
            <SectionTitle icon={<Radio size={12} />} title="Hook IPC" />
            <SettingRow label="Receiver Port">
              <input type="number" value={settings.ipc_port}
                onChange={(e) => setSettings({ ipc_port: Number(e.target.value) })}
                className={cn(inputClass, "w-28")} />
            </SettingRow>
          </section>

          {/* Notifications */}
          <section>
            <SectionTitle icon={<Bell size={12} />} title="Notifications" />
            <div className="space-y-3">
              <SettingRow label="Desktop Notifications">
                <Toggle
                  value={settings.notifications_enabled}
                  onChange={(v) => setSettings({ notifications_enabled: v })}
                  label={settings.notifications_enabled ? "Enabled" : "Disabled"}
                />
              </SettingRow>

              <SettingRow label="Auto-analyze at risk level">
                <select value={settings.auto_analyze_risk}
                  onChange={(e) => setSettings({ auto_analyze_risk: e.target.value as RiskLevel })}
                  className={cn(inputClass, "w-36")}>
                  <option value="Low">Low+</option>
                  <option value="Medium">Medium+</option>
                  <option value="High">High+</option>
                  <option value="Critical">Critical only</option>
                </select>
              </SettingRow>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-navy-700 flex justify-end gap-2">
          <button onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 text-xs rounded-lg bg-navy-800 text-muted hover:text-cream-100 border border-navy-600 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || saved}
            className={cn("px-5 py-2 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5",
              saved ? "bg-emerald-700 text-white" : "bg-amber-600 hover:bg-amber-500 text-navy-900",
              (saving || saved) && "opacity-80 cursor-not-allowed")}>
            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : saved ? <><Check size={12} /> Saved!</> : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-2">
      {icon} {title}
    </h3>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div onClick={() => onChange(!value)}
        className={cn("w-10 h-5 rounded-full transition-colors relative", value ? "bg-amber-600" : "bg-navy-600")}>
        <div className={cn("w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all", value ? "left-5" : "left-0.5")} />
      </div>
      <span className="text-xs text-cream-200">{label}</span>
    </label>
  );
}

function StatusText({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return <p className={cn("text-[10px] mt-1", ok ? "text-emerald-400" : "text-muted")}>✓ {children}</p>;
}

const inputClass = cn(
  "h-8 px-3 rounded-lg text-xs",
  "bg-navy-800 border border-navy-600 text-cream-100 placeholder:text-muted",
  "focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20 transition"
);

const btnClass = cn(
  "h-8 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1",
  "bg-navy-700 border border-navy-600 text-cream-200",
  "hover:border-amber-700 hover:text-amber-400 transition-all"
);
