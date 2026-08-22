import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useUIStore, useAuthStore, useNotificationStore } from '@/store';
import { supabase } from '@/lib/supabase';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { JobsPage } from '@/pages/JobsPage';
import { ApplicationsPage } from '@/pages/ApplicationsPage';
import { ResumesPage } from '@/pages/ResumesPage';
import { CoverLettersPage } from '@/pages/CoverLettersPage';
import { CopilotPage } from '@/pages/CopilotPage';
import { AutomationsPage } from '@/pages/AutomationsPage';
import { WorkflowsPage } from '@/pages/WorkflowsPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { KnowledgeBasePage } from '@/pages/KnowledgeBasePage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { ExecutionsPage } from '@/pages/ExecutionsPage';
import { IntegrationsPage } from '@/pages/IntegrationsPage';
import { PromptsPage } from '@/pages/PromptsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SetupPage } from '@/pages/SetupPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, refetchOnWindowFocus: false, retry: 1 } },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuthStore();
  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading CareerPilot AI...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function App() {
  const theme = useUIStore((s) => s.theme);
  const { initializing, setInitializing, setUser, refresh } = useAuthStore();
  const loadNotifications = useNotificationStore((s) => s.load);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          await refresh();
          await loadNotifications();
        }
      } catch { /* ignore */ }
      if (mounted) setInitializing(false);
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) { await refresh(); await loadNotifications(); }
        else { setUser(null); }
      })();
    });
    return () => { mounted = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/applications" element={<ApplicationsPage />} />
              <Route path="/resumes" element={<ResumesPage />} />
              <Route path="/cover-letters" element={<CoverLettersPage />} />
              <Route path="/copilot" element={<CopilotPage />} />
              <Route path="/automations" element={<AutomationsPage />} />
              <Route path="/workflows" element={<WorkflowsPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/knowledge" element={<KnowledgeBasePage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/executions" element={<ExecutionsPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/prompts" element={<PromptsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
