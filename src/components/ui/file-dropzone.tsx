import { useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { assertResumeUploadFile } from '@/utils/upload-sanitize';

const ACCEPT = '.pdf,.docx,.md,.txt,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function FileDropzone({
  disabled,
  uploading,
  error,
  onFile,
}: {
  disabled?: boolean;
  uploading?: boolean;
  error?: string;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [localError, setLocalError] = useState('');
  const busy = disabled || uploading;
  const shownError = error || localError;

  const takeFile = (file?: File) => {
    if (!file || busy) return;
    try {
      assertResumeUploadFile(file);
    } catch (err) {
      setFileName('');
      setLocalError(err instanceof Error ? err.message : 'Unsupported file');
      return;
    }
    setLocalError('');
    setFileName(file.name);
    onFile(file);
  };

  return (
    <div>
      <label
        className={cn(
          'block cursor-pointer rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
          busy && 'pointer-events-none opacity-50',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          takeFile(e.dataTransfer.files[0]);
        }}
      >
        <Upload className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm text-muted-foreground">
          {uploading
            ? 'Extracting text from your resume…'
            : 'Drop a PDF, DOCX, Markdown, or TXT file, or click to browse'}
        </p>
        {fileName && <p className="mt-1 text-xs text-foreground">{fileName}</p>}
        <input
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={busy}
          aria-label="Upload resume file"
          onChange={(e) => takeFile(e.target.files?.[0])}
        />
      </label>
      {shownError && (
        <p className="mt-2 text-sm text-destructive" role="alert">{shownError}</p>
      )}
    </div>
  );
}
