import { Bookmark, MessageSquare, ChevronRight } from "lucide-react";
import { cn, riskBadgeClass, formatTime, eventTypeIcon } from "@/lib/utils";
import type { ClaudeEvent } from "@/types";
import { useAppStore } from "@/stores/appStore";

interface Props {
  event: ClaudeEvent;
}

function parseInput(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw) return null;
  // Handle case where tool_input was serialized as a JSON string
  if (typeof raw === "string") {
    try { return JSON.parse(raw as string); } catch { return null; }
  }
  return raw;
}

function eventSubtitle(event: ClaudeEvent): string | null {
  const input = parseInput(event.tool_input);
  if (!input) return null;

  if (event.tool_name === "Bash" || event.tool_name === "mcp__bash" ||
      event.tool_name === "PowerShell" || event.tool_name === "cmd") {
    const cmd = (input["command"] ?? input["script"] ?? input["code"]) as string | undefined;
    if (cmd) return cmd.trim().slice(0, 80);
  }
  if (event.tool_name === "Read") {
    const f = (input["file_path"] ?? input["path"]) as string | undefined;
    if (f) return f.split(/[\\/]/).slice(-2).join("/");
  }
  if (event.tool_name === "Edit" || event.tool_name === "Write") {
    const f = (input["file_path"] ?? input["path"]) as string | undefined;
    if (f) return f.split(/[\\/]/).slice(-2).join("/");
  }
  if (event.tool_name === "MultiEdit") {
    const edits = input["edits"] as Array<{ file_path?: string }> | undefined;
    if (edits?.length) return `${edits.length} file${edits.length > 1 ? "s" : ""}`;
  }
  if (event.tool_name === "Glob") {
    const p = input["pattern"] as string | undefined;
    if (p) return p;
  }
  if (event.tool_name === "Grep") {
    const pat = input["pattern"] as string | undefined;
    const p = (input["path"] ?? input["include"]) as string | undefined;
    return [pat, p].filter(Boolean).join(" in ").slice(0, 80) || null;
  }
  if (event.tool_name === "WebFetch" || event.tool_name === "WebSearch") {
    const url = (input["url"] ?? input["query"]) as string | undefined;
    if (url) return url.slice(0, 80);
  }
  if (event.tool_name === "LS") {
    const p = input["path"] as string | undefined;
    if (p) return p.split(/[\\/]/).slice(-2).join("/");
  }
  if (event.event_type === "UserPromptSubmit") {
    const prompt = (input["prompt"] ?? input["message"]) as string | undefined;
    if (prompt) return prompt.slice(0, 80);
  }

  if (event.file_paths.length > 0) return event.file_paths[0];
  return null;
}

export function EventItem({ event }: Props) {
  const { selectedEventId, setSelectedEvent } = useAppStore();
  const isSelected = selectedEventId === event.id;
  const subtitle = eventSubtitle(event);

  return (
    <button
      onClick={() => setSelectedEvent(isSelected ? null : event.id)}
      className={cn(
        "w-full text-left px-4 py-3 flex items-start gap-3 border-b border-navy-700/50",
        "hover:bg-navy-800/50 transition-colors group animate-slide-in",
        isSelected && "bg-navy-800 border-l-2 border-l-amber-600"
      )}
    >
      <span className="text-base mt-0.5 shrink-0">
        {eventTypeIcon(event.event_type)}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-cream-200">
            {event.tool_name ?? event.event_type}
          </span>
          {event.risk_level && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", riskBadgeClass(event.risk_level))}>
              {event.risk_level}
            </span>
          )}
          {event.is_bookmarked && <Bookmark size={10} className="text-amber-500 fill-amber-500" />}
          {event.annotation && <MessageSquare size={10} className="text-muted" />}
        </div>

        {subtitle && (
          <p className="text-[11px] text-muted font-mono truncate leading-tight">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-muted font-mono">{formatTime(event.timestamp)}</span>
        <ChevronRight size={12} className={cn("text-muted transition-transform", isSelected && "rotate-90 text-amber-500")} />
      </div>
    </button>
  );
}
