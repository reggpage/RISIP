import { describe, expect, it } from 'vitest';
import { buildKnowledgeReply, retrieveRisipKnowledge } from '../../../../supabase/functions/_shared/risipKnowledge';

describe('Risip knowledge retrieval', () => {
  it('retrieves daily-record guidance in Swahili', () => {
    const rows = retrieveRisipKnowledge('rekodi za mauzo na matumizi', 'sw');
    expect(rows.some((row) => row.topic === 'daily_records')).toBe(true);
    expect(buildKnowledgeReply('rekodi za mauzo', 'sw')).toContain('NDIYO');
  });

  it('retrieves permissions and receipt guidance in English', () => {
    expect(buildKnowledgeReply('worker permissions for receipt photo', 'en')).toContain('authorised project');
    expect(retrieveRisipKnowledge('worker permission', 'en')[0]?.topic).toBe('permissions');
  });

  it('does not expose a database or user-data action', () => {
    const reply = buildKnowledgeReply('help', 'sw');
    expect(reply).toContain('Risip');
    expect(reply).not.toMatch(/insert|update|delete|database/i);
  });
});
