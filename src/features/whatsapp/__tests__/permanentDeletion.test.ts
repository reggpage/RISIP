import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  accountDeletionDone,
  accountDeletionWarning,
  isAccountDeletionConfirmation,
  isAccountDeletionRequest,
} from '../../../../supabase/functions/_shared/whatsappAccountDeletion';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('permanent deletion safeguards', () => {
  const migration = read('supabase/migrations/0138_permanent_deletion.sql');
  const webhook = read('supabase/functions/whatsapp-webhook/index.ts');
  const settings = read('src/routes/settings/SettingsPage.tsx');

  it('requires an exact two-step account command', () => {
    expect(isAccountDeletionRequest('futa account yangu')).toBe(true);
    expect(isAccountDeletionRequest('futa account ya mtu mwingine')).toBe(false);
    expect(isAccountDeletionConfirmation('FUTA KABISA')).toBe(true);
    expect(isAccountDeletionConfirmation('futa account yangu')).toBe(false);
  });

  it('names only owned businesses and leaves joined businesses alone', () => {
    const warning = accountDeletionWarning([{ id: 'owned', name: 'Bucha A' }], 'sw');
    expect(warning).toContain('Bucha A');
    expect(warning).toContain('FUTA KABISA');
    expect(accountDeletionDone('sw')).toContain('imefutwa kabisa');
    expect(webhook).toContain("db.rpc('delete_account_data'");
    expect(webhook).toContain('isAccountDeletionRequest(body)');
  });

  it('keeps account and business deletion as separate server operations', () => {
    expect(migration).toContain('create or replace function public.delete_company_data');
    expect(migration).toContain('create or replace function public.delete_account_data');
    expect(migration).toContain('p_allow_orphan_profiles boolean default false');
    expect(migration).toContain("provider backup retention is outside Risip control");
    expect(read('supabase/functions/delete-company/index.ts')).not.toContain('auth.admin.deleteUser');
    expect(read('supabase/functions/delete-account/index.ts')).toContain('auth.admin.deleteUser');
  });

  it('requires exact confirmations in the web UI and inventories storage', () => {
    expect(settings).toContain('deleteFirstConfirmationInput');
    expect(settings).toContain('deleteConfirmationInput');
    expect(settings).toContain("confirmation: sw.settings.deleteConfirmation");
    expect(read('supabase/functions/_shared/permanentDeletion.ts')).toContain("listPrefix(admin, plan, 'company-logos'");
    expect(read('supabase/functions/_shared/permanentDeletion.ts')).toContain("removeStoragePlan");
  });
});
