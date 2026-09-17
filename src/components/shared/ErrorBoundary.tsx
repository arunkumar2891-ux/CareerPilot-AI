import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Changing this value resets the boundary. Pass the route key so navigating
   * away from a crashed screen clears the error instead of stranding the user
   * on the fallback.
   */
  resetKey?: string;
  /** Rendered instead of the default fallback. Receives the caught error. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-phase exceptions so one bad component does not white-screen the
 * whole SPA.
 *
 * Must be a class: there is no hook equivalent of `componentDidCatch`.
 *
 * Note the deliberate limits — this catches errors thrown while *rendering*. It
 * does not catch async rejections, event-handler throws, or errors in effects
 * that escape to the microtask queue; those still need local handling
 * (`ErrorState` + query error flags).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack — React's default console output omits it in prod builds.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            This screen hit an unexpected error. Your data is safe — reloading usually clears it.
          </p>
        </div>
        {/* The message is developer-facing detail, not the headline: shown, but de-emphasised. */}
        <p className="max-w-md break-words font-mono text-xs text-muted-foreground/80">
          {error.message}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={this.reset} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </Button>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}
