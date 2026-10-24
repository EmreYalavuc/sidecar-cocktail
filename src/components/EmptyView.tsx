import { FileCode2, Sparkles, Clock } from "lucide-react";

const CONFIG: Record<string, { icon: React.ElementType; title: string; desc: string }> = {
  files: {
    icon: FileCode2,
    title: "No file changes",
    desc: "File changes will appear here as Claude edits your project.",
  },
  analysis: {
    icon: Sparkles,
    title: "No analyses yet",
    desc: "Configure your Gemini API key and start a Claude session to see AI analysis.",
  },
  sessions: {
    icon: Clock,
    title: "No sessions yet",
    desc: "Claude Code sessions will be listed here once hooks are configured.",
  },
};

export function EmptyView({ view }: { view: string }) {
  const { icon: Icon, title, desc } = CONFIG[view] ?? CONFIG.sessions;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-navy-800 border border-navy-600 flex items-center justify-center">
        <Icon size={28} className="text-amber-600/50" />
      </div>
      <div>
        <p className="text-cream-200 font-medium mb-1">{title}</p>
        <p className="text-sm text-muted leading-relaxed max-w-xs">{desc}</p>
      </div>
    </div>
  );
}
