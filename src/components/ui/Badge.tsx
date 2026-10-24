import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "amber" | "green" | "red" | "orange";
}

export function Badge({ children, className, variant = "default" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
        {
          "bg-navy-700 text-muted border border-navy-600": variant === "default",
          "bg-amber-950 text-amber-500 border border-amber-800": variant === "amber",
          "bg-emerald-950 text-emerald-400 border border-emerald-800": variant === "green",
          "bg-red-950 text-red-400 border border-red-800": variant === "red",
          "bg-orange-950 text-orange-400 border border-orange-800": variant === "orange",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
