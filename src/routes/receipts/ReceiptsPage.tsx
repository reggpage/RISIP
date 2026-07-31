import { useMemo, useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ReceiptCard from '@/components/receipts/ReceiptCard';
import { uploadReceipt } from '@/features/receipts/uploadReceipt';
import { useReceipts } from '@/features/receipts/useReceipts';
import { useProjects } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { sw } from '@/i18n/sw';

export default function ReceiptsPage() {
  const auth = useAuth();
  const { state: projectsState } = useProjects();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const isWorker = profile?.role === 'worker';

  // Compute the target project for a new upload:
  //   - If the user picked one, use it.
  //   - Else, if only one active project is visible, auto-select it.
  //   - Else, force a chooser.
  const activeProjects = useMemo(() => {
    if (projectsState.status !== 'ready') return [];
    return projectsState.projects.filter((p) => p.status === 'active');
  }, [projectsState]);
  const effectiveProjectId = selectedProjectId ?? (activeProjects.length === 1 ? activeProjects[0].id : null);

  // Workers see only their own project's stream; owner/accountant see whatever project
  // is selected (or all when none selected).
  const streamProjectId = isWorker
    ? effectiveProjectId ?? undefined
    : selectedProjectId ?? undefined;
  const { state: receiptsState } = useReceipts(streamProjectId);

  async function handleFile(file: File | null) {
    if (!file || !profile || !effectiveProjectId) return;
    setUploadError(null);
    setUploading(true);
    try {
      await uploadReceipt(file, { project_id: effectiveProjectId, user_id: profile.id });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setUploading(false);
    }
  }

  if (projectsState.status === 'loading') {
    return <div className="p-8 text-ink-muted">{sw.common.loading}</div>;
  }
  if (isWorker && activeProjects.length === 0) {
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState title={sw.receipts.empty} description={sw.receipts.noProjectsAssigned} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-ink">{sw.nav.receipts}</h1>

      {activeProjects.length > 1 && (
        <Card className="mb-4">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            {sw.receipts.chooseProject}
          </label>
          <select
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-worker/30"
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
          >
            <option value="">{isWorker ? sw.receipts.chooseProject : '—'}</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Card>
      )}

      {isWorker && effectiveProjectId && (
        <Card className="mb-6">
          <p className="mb-3 text-sm text-ink-muted">{sw.receipts.uploadHint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              tint="worker"
              fullWidth
              disabled={uploading}
              onClick={() => cameraInput.current?.click()}
            >
              <Camera className="h-4 w-4" />
              {uploading ? sw.common.loading : sw.receipts.capture}
            </Button>
            <Button
              variant="secondary"
              tint="worker"
              fullWidth
              disabled={uploading}
              onClick={() => galleryInput.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {sw.receipts.upload}
            </Button>
          </div>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          {uploadError && <p className="mt-3 text-sm text-red-600">{uploadError}</p>}
        </Card>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink-muted">{sw.receipts.recent}</h2>

      {receiptsState.status === 'loading' && (
        <div className="text-sm text-ink-muted">{sw.common.loading}</div>
      )}
      {receiptsState.status === 'error' && (
        <div className="text-sm text-red-600">{receiptsState.message}</div>
      )}
      {receiptsState.status === 'ready' && receiptsState.receipts.length === 0 && (
        <EmptyState title={sw.receipts.empty} description={isWorker ? sw.receipts.uploadHint : undefined} />
      )}
      {receiptsState.status === 'ready' && receiptsState.receipts.length > 0 && (
        <div className="flex flex-col gap-3">
          {receiptsState.receipts.map((r) => (
            <ReceiptCard key={r.id} receipt={r} />
          ))}
        </div>
      )}
    </div>
  );
}
