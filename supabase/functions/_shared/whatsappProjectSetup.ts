import type { Lang } from './whatsappIntent.ts';

export type ProjectSetupStage = 'choose' | 'confirm' | 'name';

export type ProjectSetupState = {
  kind: 'project_setup';
  stage: ProjectSetupStage;
  mediaMessageId: string;
  projectName?: string;
};

export function projectSetupPrompt(lang: Lang, companyName: string): string {
  const safeCompany = sanitizeProjectName(companyName) ?? 'your business';
  return lang === 'sw'
    ? `Biashara yako bado haina project ya kuhifadhi risiti.\nChagua:\n1. Tengeneza project "General"\n2. Tengeneza project "${safeCompany}"\n3. Andika jina lingine`
    : `Your business does not have a project for storing receipts yet.\nChoose:\n1. Create project "General"\n2. Create project "${safeCompany}"\n3. Type another name`;
}

export function projectSetupNamePrompt(lang: Lang): string {
  return lang === 'sw'
    ? 'Andika jina la project.'
    : 'Type the project name.';
}

export function projectSetupConfirmation(lang: Lang, projectName: string): string {
  return lang === 'sw'
    ? `Umechagua project "${projectName}". Thibitisha kwa kuandika NDIYO, au andika HAPANA kubadilisha.`
    : `You chose project "${projectName}". Reply YES to confirm, or NO to choose again.`;
}

export function projectSetupCreatedReply(lang: Lang, projectName: string): string {
  return lang === 'sw'
    ? `Project "${projectName}" iko tayari. Ninasindika risiti yako sasa.`
    : `Project "${projectName}" is ready. I am processing your receipt now.`;
}

export function projectSetupWorkerReply(lang: Lang): string {
  return lang === 'sw'
    ? 'Biashara yako bado haina project ya kuhifadhi risiti. Muombe owner au accountant atengeneze project kwanza.'
    : 'Your business does not have a project for storing receipts yet. Ask the owner or accountant to create one first.';
}

export function canCreateProject(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'accountant';
}

export function parseProjectSetupChoice(text: string | null | undefined): 1 | 2 | 3 | null {
  const value = String(text ?? '').trim();
  return value === '1' || value === '2' || value === '3' ? Number(value) as 1 | 2 | 3 : null;
}

export function parseProjectSetupConfirmation(text: string | null | undefined): boolean | null {
  const value = String(text ?? '').trim().toLowerCase();
  if (/^(yes|ndiyo|ndio|confirm|thibitisha|sawa)$/.test(value)) return true;
  if (/^(no|hapana|cancel|ghairi|badilisha)$/.test(value)) return false;
  return null;
}

export function sanitizeProjectName(text: string | null | undefined): string | null {
  const value = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return value.length >= 2 ? value : null;
}

export function isProjectSetupState(value: unknown): value is ProjectSetupState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ProjectSetupState>;
  return state.kind === 'project_setup'
    && (state.stage === 'choose' || state.stage === 'confirm' || state.stage === 'name')
    && typeof state.mediaMessageId === 'string'
    && state.mediaMessageId.length > 0;
}
