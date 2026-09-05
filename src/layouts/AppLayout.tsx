import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar, MobileNav } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { useUIStore } from '@/store';
import { services } from '@/services';
import { useMediaQuery } from '@/hooks/use-media-query';

export function AppLayout() {
  const { commandOpen, setCommandOpen, setMobileNavOpen } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduceMotion = useMediaQuery('(max-width: 1023px), (prefers-reduced-motion: reduce)');

  useEffect(() => {
    services.bootstrap.ensure()
      .then(() => {
        qc.invalidateQueries({ queryKey: ['workflows'] });
        qc.invalidateQueries({ queryKey: ['automations'] });
        qc.invalidateQueries({ queryKey: ['settings'] });
        qc.invalidateQueries({ queryKey: ['resumes'] });
        qc.invalidateQueries({ queryKey: ['knowledge'] });
      })
      .catch(() => { /* non-blocking */ });
  }, [qc]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
      if (e.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandOpen, setCommandOpen]);

  const pageContent = <Outlet />;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin overscroll-y-contain">
          {reduceMotion ? (
            <div key={location.pathname} className="min-h-full">
              {pageContent}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="min-h-full"
              >
                {pageContent}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} onNavigate={navigate} />
    </div>
  );
}
