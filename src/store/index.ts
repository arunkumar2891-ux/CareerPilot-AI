import { create } from 'zustand';
import type { UserProfile, Notification } from '@/types';
import { supabase } from '@/lib/supabase';
import { services } from '@/services';

interface UIState {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  notificationsOpen: boolean;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: (localStorage.getItem('cp-theme') as 'light' | 'dark') || 'dark',
  sidebarCollapsed: false,
  commandOpen: false,
  notificationsOpen: false,
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('cp-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    set({ theme: next });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
}));

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'google') => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setInitializing: (v: boolean) => void;
  setUser: (u: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initializing: true,
  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { set({ loading: false }); return { error: error.message }; }
    try {
      const profile = await services.user.profile();
      set({ user: profile, loading: false });
    } catch { set({ loading: false }); }
    return { error: null };
  },
  signUp: async (email, password, fullName) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) { set({ loading: false }); return { error: error.message }; }
    try {
      const profile = await services.user.profile();
      set({ user: profile, loading: false });
    } catch { set({ loading: false }); }
    return { error: null };
  },
  signInWithOAuth: async (provider) => { await supabase.auth.signInWithOAuth({ provider }); },
  signInWithMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error: error?.message || null };
  },
  signOut: async () => { await supabase.auth.signOut(); set({ user: null }); },
  refresh: async () => {
    try { const profile = await services.user.profile(); set({ user: profile }); }
    catch { set({ user: null }); }
  },
  setInitializing: (initializing) => set({ initializing }),
  setUser: (user) => set({ user }),
}));

interface NotificationState {
  notifications: Notification[];
  unread: number;
  load: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unread: 0,
  load: async () => {
    try {
      const n = await services.notification.list();
      set({ notifications: n, unread: n.filter((x) => !x.read).length });
    } catch { set({ notifications: [], unread: 0 }); }
  },
  markRead: async (id) => {
    try { await services.notification.markRead(id); } catch { /* ignore */ }
    const n = get().notifications.map((x) => (x.id === id ? { ...x, read: true } : x));
    set({ notifications: n, unread: n.filter((x) => !x.read).length });
  },
  markAllRead: async () => {
    try { await services.notification.markAllRead(); } catch { /* ignore */ }
    const n = get().notifications.map((x) => ({ ...x, read: true }));
    set({ notifications: n, unread: 0 });
  },
}));
