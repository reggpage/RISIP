import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Archive, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  NewProjectInput,
  setProjectStatus,
  updateProject,
  useProject,
} from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { sw } from '@/i18n/sw';

export default function EditProject() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { state, refresh } = useProject(id);
  const confirm = useConfirm();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'toggle' | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<NewProjectInput>();

  // Hydrate the form once the project loads.
  useEffect(() => {
    if (state.status === 'ready' && state.project) {
      const p = state.project;
      reset({
        name: p.name,
        site_location: p.site_location ?? '',
        client_name: p.client_name ?? '',
        start_date: p.start_date ?? '',
        description: p.description ?? '',
      });
    }
  }, [state, reset]);

  const isOwner = auth.status === 'signed-in' && auth.profile?.role === 'owner';

  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-xl p-6">
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-surface-muted" />
        <div className="mb-6 h-8 w-64 animate-pulse rounded-lg bg-surface-muted" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      </div>
    );
  }
  if (state.status === 'error') return <div className="p-8 text-red-600">{state.message}</div>;
  if (!state.project) return <div className="p-8 text-ink-muted">{sw.common.empty}</div>;
  if (!isOwner) return <div className="p-8 text-ink-muted">Only the admin can edit projects.</div>;

  const project = state.project;
  const archived = project.status === 'archived';

  async function onSubmit(values: NewProjectInput) {
    if (!id) return;
    setSubmitError(null);
    setBusy('save');
    try {
      await updateProject(id, values);
      navigate(`/projects/${id}`, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    if (!id) return;
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
      await setProjectStatus(id, archived ? 'active' : 'archived');
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <Card>
        <h1 className="mb-4 text-xl font-semibold text-ink">{sw.projects.edit}</h1>

        {archived && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {sw.projects.archivedNotice}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label={sw.projects.name}
            {...register('name', { required: true })}
            error={errors.name && sw.common.error}
          />
          <Input label={sw.projects.siteLocation} {...register('site_location')} />
          <Input label={sw.projects.clientName} {...register('client_name')} />
          <Input type="date" label={sw.projects.startDate} {...register('start_date')} />
          <Input label={sw.projects.description} {...register('description')} />

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="submit" tint="admin" disabled={busy === 'save' || !isDirty}>
              {busy === 'save' ? sw.common.loading : sw.projects.saveChanges}
            </Button>
            <Button
              type="button"
              variant="secondary"
              tint="admin"
              disabled={busy === 'toggle'}
              onClick={() => void toggleArchive()}
            >
              {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {busy === 'toggle'
                ? sw.common.loading
                : archived
                  ? sw.projects.unarchive
                  : sw.projects.archive}
            </Button>
            <Link to={`/projects/${id}`}>
              <Button type="button" variant="ghost">
                {sw.common.cancel}
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
