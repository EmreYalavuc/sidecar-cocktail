import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskLevel } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function riskColor(level: RiskLevel | null): string {
  switch (level) {
    case "Critical": return "text-red-400";
    case "High":     return "text-orange-400";
    case "Medium":   return "text-amber-400";
    case "Low":      return "text-emerald-400";
    default:         return "text-muted";
  }
}

export function riskBadgeClass(level: RiskLevel | null): string {
  switch (level) {
    case "Critical": return "bg-red-950 text-red-400 border border-red-800";
    case "High":     return "bg-orange-950 text-orange-400 border border-orange-800";
    case "Medium":   return "bg-amber-950 text-amber-400 border border-amber-800";
    case "Low":      return "bg-emerald-950 text-emerald-400 border border-emerald-800";
    default:         return "bg-navy-700 text-muted border border-navy-600";
  }
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function eventTypeIcon(type: string): string {
  const map: Record<string, string> = {
    PreToolUse:        "⚙️",
    PostToolUse:       "✅",
    PostToolUseFailure:"❌",
    PermissionRequest: "🔐",
    UserPromptSubmit:  "💬",
    Stop:              "⏹️",
    SessionStart:      "▶️",
    SessionEnd:        "⏹️",
  };
  return map[type] ?? "•";
}

export function truncatePath(p: string, max = 40): string {
  if (p.length <= max) return p;
  const parts = p.replace(/\\/g, "/").split("/");
  const file = parts.at(-1) ?? p;
  return `…/${file}`;
}
