import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { createProject, type NewProjectInput } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { sw } from '@/i18n/sw';

export default function NewProject() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewProjectInput>();

  async function onSubmit(values: NewProjectInput) {
    if (auth.status !== 'signed-in' || !auth.profile) return;
    setSubmitError(null);
    try {
      const project = await createProject(values, {
        company_id: auth.profile.company_id,
        created_by: auth.profile.id,
      });
      navigate(`/projects/${project.id}`, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : sw.common.error);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {sw.projects.detailBack}
      </Link>

      <Card>
        <h1 className="mb-4 text-xl font-semibold text-ink">{sw.projects.create}</h1>

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

          <div className="mt-2 flex gap-2">
            <Button type="submit" tint="admin" disabled={isSubmitting}>
              {isSubmitting ? sw.common.loading : sw.common.save}
            </Button>
            <Link to="/projects">
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
