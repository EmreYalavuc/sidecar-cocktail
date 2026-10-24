import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { TimelineView } from "@/components/timeline/TimelineView";
import { EmptyView } from "@/components/EmptyView";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useAppStore } from "@/stores/appStore";
import { useEventStream } from "@/hooks/useEventStream";
import { useFileStream } from "@/hooks/useFileStream";
import { useAnalysisStream } from "@/hooks/useAnalysisStream";
import { useSettings } from "@/hooks/useSettings";
import { FilesView } from "@/components/files/FilesView";
import { AnalysisView } from "@/components/analysis/AnalysisView";
import { SessionsView } from "@/components/sessions/SessionsView";

export default function App() {
  const { activeView } = useAppStore();
  useEventStream();
  useFileStream();
  useAnalysisStream();
  useSettings();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-navy-900 text-cream-100 font-sans select-none">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-hidden">
          <ErrorBoundary fallbackLabel="Timeline error">
            {activeView === "timeline" && <TimelineView />}
          </ErrorBoundary>
          <ErrorBoundary fallbackLabel="Files error">
            {activeView === "files" && <FilesView />}
          </ErrorBoundary>
          <ErrorBoundary fallbackLabel="Analysis error">
            {activeView === "analysis" && <AnalysisView />}
          </ErrorBoundary>
          <ErrorBoundary fallbackLabel="Sessions error">
            {activeView === "sessions" && <SessionsView />}
          </ErrorBoundary>
          {activeView === "settings" && <EmptyView view="settings" />}
        </main>
      </div>

      <SettingsModal />
    </div>
  );
}
