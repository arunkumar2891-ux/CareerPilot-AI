import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Sun, Moon, Command, Plus, LogOut } from 'lucide-react';
import { useUIStore, useNotificationStore, useAuthStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { timeAgo } from '@/utils';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { theme, toggleTheme, setCommandOpen } = useUIStore();
  const { notifications, unread, markAllRead, markRead } = useNotificationStore();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();
  const [bellOpen, setBellOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/70 px-6 backdrop-blur-xl">
      <div className="flex flex-1 items-center gap-4">
        <Button
          variant="outline"
          onClick={() => setCommandOpen(true)}
          className="w-full max-w-md justify-start gap-2 text-muted-foreground"
        >
          <Search className="h-4 w-4" />
          <span className="text-sm">Search or run a command...</span>
          <kbd className="ml-auto flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            <Command className="h-3 w-3" />K
          </kbd>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')} className="gap-1">
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu open={bellOpen} onOpenChange={setBellOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <DropdownMenuLabel className="p-0 text-sm">Notifications</DropdownMenuLabel>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                Mark all read
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn('flex flex-col items-start gap-1 px-3 py-2.5', !n.read && 'bg-primary/5')}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold">{n.title}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{n.message}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {user?.aiCreditsUsed} / {user?.aiCreditsTotal}
          </Badge>
          <span className="text-xs text-muted-foreground">credits</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="gap-1.5 text-muted-foreground hover:text-destructive"
          title="Log out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      </div>
    </header>
  );
}
