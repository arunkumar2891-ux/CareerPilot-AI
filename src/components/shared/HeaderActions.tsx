import { Loader2, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface HeaderAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  /** Swaps the icon for a spinner and shows `busyLabel` while a task runs. */
  busy?: boolean;
  busyLabel?: string;
}

function ActionButton({ action, className }: { action: HeaderAction; className?: string }) {
  const Icon = action.icon;
  return (
    <Button
      variant={action.variant ?? 'outline'}
      onClick={action.onClick}
      disabled={action.disabled || action.busy}
      className={cn('gap-2', className)}
    >
      {action.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {action.busy ? action.busyLabel ?? action.label : action.label}
    </Button>
  );
}

interface HeaderActionsProps {
  /** Always visible at every breakpoint — the one thing the user came to do. */
  primary?: HeaderAction;
  /** Inline buttons from `sm` up; collapsed into an overflow menu below `sm`. */
  secondary?: HeaderAction[];
  /** Accessible name for the mobile overflow trigger. */
  menuLabel?: string;
  className?: string;
}

/**
 * Page-header action row that survives small viewports.
 *
 * Pages used to pass a bare `<div className="flex gap-2">` of buttons into
 * `PageHeader`. With no `flex-wrap`, a row of four or five buttons is wider than
 * a phone viewport, and `AppLayout`'s `<main>` has `overflow-x-hidden` — so the
 * trailing buttons were clipped rather than scrollable. They were not just
 * cramped, they were *unreachable*.
 *
 * Wrapping alone would fix reachability but stack five buttons into three rows
 * above the content, so instead the primary action stays visible and the rest
 * collapse into an overflow menu below `sm`.
 */
export function HeaderActions({
  primary,
  secondary = [],
  menuLabel = 'More actions',
  className,
}: HeaderActionsProps) {
  const hasSecondary = secondary.length > 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {hasSecondary && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 sm:hidden"
                aria-label={menuLabel}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {secondary.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onSelect={() => action.onClick()}
                  disabled={action.disabled || action.busy}
                  className="gap-2"
                >
                  {action.busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <action.icon className="h-4 w-4" />
                  )}
                  {action.busy ? action.busyLabel ?? action.label : action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* `flex-wrap` so mid-size viewports wrap instead of overflowing. */}
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            {secondary.map((action) => (
              <ActionButton key={action.label} action={action} />
            ))}
          </div>
        </>
      )}

      {primary && <ActionButton action={primary} className="shrink-0" />}
    </div>
  );
}
