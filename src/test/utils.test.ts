import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  riskColor,
  riskBadgeClass,
  formatTime,
  formatRelative,
  truncatePath,
  eventTypeIcon,
} from "@/lib/utils";

describe("riskColor", () => {
  it("returns red for Critical", () => {
    expect(riskColor("Critical")).toBe("text-red-400");
  });
  it("returns orange for High", () => {
    expect(riskColor("High")).toBe("text-orange-400");
  });
  it("returns amber for Medium", () => {
    expect(riskColor("Medium")).toBe("text-amber-400");
  });
  it("returns emerald for Low", () => {
    expect(riskColor("Low")).toBe("text-emerald-400");
  });
  it("returns muted for null", () => {
    expect(riskColor(null)).toBe("text-muted");
  });
});

describe("riskBadgeClass", () => {
  it("contains red for Critical", () => {
    expect(riskBadgeClass("Critical")).toContain("red");
  });
  it("contains orange for High", () => {
    expect(riskBadgeClass("High")).toContain("orange");
  });
  it("contains amber for Medium", () => {
    expect(riskBadgeClass("Medium")).toContain("amber");
  });
  it("contains emerald for Low", () => {
    expect(riskBadgeClass("Low")).toContain("emerald");
  });
  it("falls back for null", () => {
    expect(riskBadgeClass(null)).toContain("navy");
  });
});

describe("formatTime", () => {
  it("returns HH:MM:SS format", () => {
    const iso = "2026-10-24T12:34:56.000Z";
    const result = formatTime(iso);
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows seconds for very recent", () => {
    const recent = new Date(Date.now() - 5000).toISOString();
    expect(formatRelative(recent)).toBe("5s ago");
  });
  it("shows minutes for 2 minutes ago", () => {
    const twoMin = new Date(Date.now() - 2 * 60_000).toISOString();
    expect(formatRelative(twoMin)).toBe("2m ago");
  });
  it("shows hours for 3 hours ago", () => {
    const threeHr = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelative(threeHr)).toBe("3h ago");
  });
});

describe("truncatePath", () => {
  it("returns short path unchanged", () => {
    expect(truncatePath("src/main.rs")).toBe("src/main.rs");
  });
  it("truncates long path keeping filename", () => {
    const long = "C:/Users/Pc/Desktop/projeler/SomeLongProject/src/components/ui/Button.tsx";
    const result = truncatePath(long);
    expect(result).toContain("Button.tsx");
    expect(result.startsWith("…/")).toBe(true);
    expect(result.length).toBeLessThan(long.length);
  });
  it("respects custom max length", () => {
    const path = "a/b/c/d/e/file.ts";
    const result = truncatePath(path, 10);
    expect(result.length).toBeLessThanOrEqual(10 + 2); // "…/" prefix
  });
});

describe("eventTypeIcon", () => {
  it("returns gear for PreToolUse", () => {
    expect(eventTypeIcon("PreToolUse")).toBe("⚙️");
  });
  it("returns check for PostToolUse", () => {
    expect(eventTypeIcon("PostToolUse")).toBe("✅");
  });
  it("returns lock for PermissionRequest", () => {
    expect(eventTypeIcon("PermissionRequest")).toBe("🔐");
  });
  it("returns bullet for unknown type", () => {
    expect(eventTypeIcon("unknown")).toBe("•");
  });
});
