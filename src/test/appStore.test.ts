import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/stores/appStore";
import type { ClaudeEvent, Analysis } from "@/types";

function makeEvent(id: string, overrides: Partial<ClaudeEvent> = {}): ClaudeEvent {
  return {
    id,
    session_id: "sess-1",
    event_type: "PreToolUse",
    tool_name: "Bash",
    tool_input: null,
    tool_output: null,
    working_dir: null,
    file_paths: [],
    timestamp: new Date().toISOString(),
    risk_level: "Low",
    is_bookmarked: false,
    annotation: null,
    ...overrides,
  };
}

function makeAnalysis(id: string, eventId: string): Analysis {
  return {
    id,
    event_id: eventId,
    session_id: "sess-1",
    mode: "permission",
    provider: "gemini",
    risk_level: "Low",
    content: "test analysis",
    tokens_used: 100,
    cost_usd: 0.001,
    secrets_redacted: 0,
    created_at: new Date().toISOString(),
  };
}

describe("appStore — events", () => {
  beforeEach(() => {
    useAppStore.setState({ events: [], analyses: [], pendingAnalysisIds: new Set() });
  });

  it("addEvent prepends new events", () => {
    const { addEvent } = useAppStore.getState();
    addEvent(makeEvent("e1"));
    addEvent(makeEvent("e2"));
    const { events } = useAppStore.getState();
    expect(events[0].id).toBe("e2");
    expect(events[1].id).toBe("e1");
  });

  it("addEvent caps at 500", () => {
    const { addEvent } = useAppStore.getState();
    for (let i = 0; i < 510; i++) addEvent(makeEvent(`e${i}`));
    expect(useAppStore.getState().events.length).toBe(500);
  });

  it("updateEvent patches in-place", () => {
    const { addEvent, updateEvent } = useAppStore.getState();
    addEvent(makeEvent("e1"));
    updateEvent("e1", { is_bookmarked: true, annotation: "hello" });
    const ev = useAppStore.getState().events.find((e) => e.id === "e1");
    expect(ev?.is_bookmarked).toBe(true);
    expect(ev?.annotation).toBe("hello");
  });

  it("setEvents replaces the list", () => {
    const { addEvent, setEvents } = useAppStore.getState();
    addEvent(makeEvent("e1"));
    setEvents([makeEvent("e99")]);
    const { events } = useAppStore.getState();
    expect(events.length).toBe(1);
    expect(events[0].id).toBe("e99");
  });
});

describe("appStore — analyses", () => {
  beforeEach(() => {
    useAppStore.setState({ analyses: [], pendingAnalysisIds: new Set() });
  });

  it("addAnalysis prepends", () => {
    const { addAnalysis } = useAppStore.getState();
    addAnalysis(makeAnalysis("a1", "e1"));
    addAnalysis(makeAnalysis("a2", "e2"));
    expect(useAppStore.getState().analyses[0].id).toBe("a2");
  });

  it("setPendingAnalysis adds and removes", () => {
    const { setPendingAnalysis } = useAppStore.getState();
    setPendingAnalysis("e1", true);
    expect(useAppStore.getState().pendingAnalysisIds.has("e1")).toBe(true);
    setPendingAnalysis("e1", false);
    expect(useAppStore.getState().pendingAnalysisIds.has("e1")).toBe(false);
  });
});

describe("appStore — UI state", () => {
  it("setSelectedEvent updates selection", () => {
    useAppStore.getState().setSelectedEvent("e42");
    expect(useAppStore.getState().selectedEventId).toBe("e42");
    useAppStore.getState().setSelectedEvent(null);
    expect(useAppStore.getState().selectedEventId).toBeNull();
  });

  it("setFilterRisk updates filter", () => {
    useAppStore.getState().setFilterRisk("Critical");
    expect(useAppStore.getState().filterRisk).toBe("Critical");
  });

  it("setSettings merges partial update", () => {
    const { setSettings } = useAppStore.getState();
    const before = useAppStore.getState().settings.ipc_port;
    setSettings({ gemini_model: "gemini-3.8-flash" });
    const after = useAppStore.getState().settings;
    expect(after.gemini_model).toBe("gemini-3.8-flash");
    expect(after.ipc_port).toBe(before); // unchanged
  });
});
