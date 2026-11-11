import { useQuery } from '@tanstack/react-query';
import { InlineLoader } from '@/components/motion';
import { ErrorState } from '@/components/shared/ErrorState';
import { services } from '@/services';

/**
 * The compiled PDF from Upload to Storage. Signs a fresh URL from the object
 * path so a seven-day link that has already expired still opens.
 */
export function StoredPdfFrame({
  storagePath,
  pdfUrl,
  title,
}: {
  storagePath?: string;
  pdfUrl?: string;
  title: string;
}) {
  const enabled = Boolean(storagePath || pdfUrl);
  const { data: url, isLoading, error, refetch } = useQuery({
    queryKey: ['stored-pdf', storagePath, pdfUrl],
    queryFn: () => services.resume.resolveStoredPdfUrl({ storagePath, pdfUrl }),
    enabled,
    staleTime: 10 * 60 * 1000,
  });

  if (!enabled) return null;
  if (isLoading) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-lg border border-border bg-muted/30">
        <InlineLoader />
      </div>
    );
  }
  if (error || !url) {
    return (
      <ErrorState
        title="Could not open the stored PDF"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <iframe
      title={title}
      src={url}
      className="h-[240px] w-full rounded-lg border border-border bg-white"
    />
  );
}
