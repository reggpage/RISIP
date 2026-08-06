import { useEffect, useState } from 'react';
import { Archive, Loader2, RotateCcw, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  type NewProjectInput,
  setProjectStatus,
  updateProject,
} from '@/features/projects/useProjects';
import { sw } from '@/i18n/sw';
import type { Project } from '@/types/db';

export default function EditProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: (project: Project) => void;
}) {
  const confirm = useConfirm();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'toggle' | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<NewProjectInput>({
    defaultValues: {
      name: project.name,
      site_location: project.site_location ?? '',
      client_name: project.client_name ?? '',
      start_date: project.start_date ?? '',
      description: project.description ?? '',
    },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  async function onSubmit(values: NewProjectInput) {
    setSubmitError(null);
    setBusy('save');
    try {
      const updated = await updateProject(project.id, values);
      onSaved(updated);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    const archived = project.status === 'archived';
    if (!archived) {
      const ok = await confirm({
        title: 'Archive this project?',
        message: sw.projects.archiveConfirm,
        confirmLabel: 'Archive',
        danger: true,
      });
      if (!ok) return;
    }
    setSubmitError(null);
    setBusy('toggle');
    try {
      const updated = await setProjectStatus(project.id, archived ? 'active' : 'archived');
      onSaved(updated);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-project-title"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
          <h2 id="edit-project-title" className="text-base font-semibold text-ink">{sw.projects.edit}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {project.status === 'archived' && (
            <div className="mb-4 rounded-lg border border-surface-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
              {sw.projects.archivedNotice}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input label={sw.projects.name} {...register('name', { required: true })} error={errors.name && sw.common.error} />
            <Input label={sw.projects.siteLocation} {...register('site_location')} />
            <Input label={sw.projects.clientName} {...register('client_name')} />
            <Input type="date" label={sw.projects.startDate} {...register('start_date')} />
            <Input label={sw.projects.description} {...register('description')} />

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="submit" tint="admin" disabled={busy === 'save' || !isDirty}>
                {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : sw.projects.saveChanges}
              </Button>
              <Button type="button" variant="secondary" tint="admin" disabled={busy === 'toggle'} onClick={() => void toggleArchive()}>
                {project.status === 'archived' ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {busy === 'toggle' ? sw.common.loading : project.status === 'archived' ? sw.projects.unarchive : sw.projects.archive}
              </Button>
              <Button type="button" variant="ghost" disabled={!!busy} onClick={onClose}>{sw.common.cancel}</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
