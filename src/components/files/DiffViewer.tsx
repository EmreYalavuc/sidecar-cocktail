import { cn } from "@/lib/utils";

interface Props {
  diff: string;
}

export function DiffViewer({ diff }: Props) {
  if (!diff) {
    return (
      <div className="text-xs text-muted text-center py-4">No diff available</div>
    );
  }

  const lines = diff.split("\n");

  return (
    <div className="font-mono text-[11px] overflow-x-auto">
      {lines.map((line, i) => {
        const isAdd    = line.startsWith("+") && !line.startsWith("+++");
        const isRemove = line.startsWith("-") && !line.startsWith("---");
        const isHeader = line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---");

        return (
          <div
            key={i}
            className={cn(
              "px-3 py-px whitespace-pre leading-5 border-l-2",
              isAdd    && "bg-emerald-950/40 text-emerald-300 border-l-emerald-600",
              isRemove && "bg-red-950/40 text-red-300 border-l-red-700",
              isHeader && "text-muted bg-navy-800/60 border-l-navy-600",
              !isAdd && !isRemove && !isHeader && "text-cream-200/70 border-l-transparent"
            )}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
