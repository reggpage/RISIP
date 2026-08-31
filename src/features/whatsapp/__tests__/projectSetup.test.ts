import { describe, expect, it } from 'vitest';
import {
  canCreateProject,
  isProjectSetupState,
  parseProjectSetupChoice,
  parseProjectSetupConfirmation,
  projectSetupConfirmation,
  projectSetupCreatedReply,
  projectSetupPrompt,
  sanitizeProjectName,
} from '../../../../supabase/functions/_shared/whatsappProjectSetup';

describe('WhatsApp project setup', () => {
  it('offers the first project choices in the selected language', () => {
    expect(projectSetupPrompt('sw', 'St. Ritha bookshop')).toContain('Tengeneza project "General"');
    expect(projectSetupPrompt('sw', 'St. Ritha bookshop')).toContain('Andika jina lingine');
    expect(projectSetupPrompt('en', 'St. Ritha bookshop')).toContain('Create project "St. Ritha bookshop"');
  });

  it('parses only the numbered choices', () => {
    expect(parseProjectSetupChoice('1')).toBe(1);
    expect(parseProjectSetupChoice('3')).toBe(3);
    expect(parseProjectSetupChoice('project-id')).toBeNull();
  });

  it('sanitizes and bounds a custom project name', () => {
    expect(sanitizeProjectName('  Site\n  One  ')).toBe('Site One');
    expect(sanitizeProjectName('x'.repeat(200))).toHaveLength(80);
    expect(sanitizeProjectName(' ')).toBeNull();
  });

  it('requires explicit confirmation and validates setup state', () => {
    expect(parseProjectSetupConfirmation('NDIYO')).toBe(true);
    expect(parseProjectSetupConfirmation('hapana')).toBe(false);
    expect(parseProjectSetupConfirmation('maybe')).toBeNull();
    expect(projectSetupConfirmation('sw', 'General')).toContain('Thibitisha');
    expect(isProjectSetupState({ kind: 'project_setup', stage: 'choose', mediaMessageId: 'wamid-1' })).toBe(true);
    expect(isProjectSetupState({ kind: 'project_setup', stage: 'choose', mediaMessageId: '' })).toBe(false);
  });

  it('allows only owner and accountant to create a project', () => {
    expect(canCreateProject('owner')).toBe(true);
    expect(canCreateProject('accountant')).toBe(true);
    expect(canCreateProject('worker')).toBe(false);
  });

  it('uses the polished Kiswahili processing copy', () => {
    expect(projectSetupCreatedReply('sw', 'General')).toContain('Nachambua rekodi yako sasa');
    expect(projectSetupCreatedReply('sw', 'General')).not.toContain('Ninasindika');
  });
});
