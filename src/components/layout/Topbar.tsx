import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Sun, Moon, Command, Plus, LogOut, Menu } from 'lucide-react';
import { useUIStore, useNotificationStore, useAuthStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { timeAgo, formatNumber } from '@/utils';

export function Topbar() {
  const { theme, toggleTheme, setCommandOpen, setMobileNavOpen } = useUIStore();
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
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:h-16 sm:gap-3 sm:px-4 lg:bg-background/80 lg:px-6 lg:backdrop-blur-xl">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Button
        variant="outline"
        onClick={() => setCommandOpen(true)}
        className="h-9 min-w-0 flex-1 justify-start gap-2 px-2 text-muted-foreground sm:px-3 lg:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm">Search...</span>
        <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium md:flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </Button>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')} aria-label="Add job">
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu open={bellOpen} onOpenChange={setBellOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(100vw-2rem,20rem)] p-0">
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
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{n.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{n.message}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hidden items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 sm:flex md:px-3 md:py-1.5"
            >
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                {formatNumber(user?.aiTokensUsed ?? 0)}
              </Badge>
              <span className="hidden text-xs text-muted-foreground md:inline">tokens</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            Tokens used this month across resume tailoring, ATS scoring, and Copilot.
            No usage cap — see Dashboard for Gemini vs Groq breakdown.
          </TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="text-muted-foreground hover:text-destructive sm:hidden"
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="hidden gap-1.5 text-muted-foreground hover:text-destructive sm:flex"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline">Log out</span>
        </Button>
      </div>
    </header>
  );
}
