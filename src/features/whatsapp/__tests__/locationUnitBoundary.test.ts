import { describe, expect, it } from 'vitest';
import { validateToolValue, validateToolRound } from '../../../../supabase/functions/_shared/whatsappToolBoundary';

describe('structured unit validation', () => {
  it('rejects location labels but does not parse product names or sentences', () => {
    const schema = { type: ['string', 'null'] };
    for (const unit of ['sto', ' STO ', 'stoo', ' Stoo ', 'dukani', 'stock', 'store', 'warehouse']) {
      expect(validateToolValue(unit, schema, '$.lines[0].unit_wording')?.code).toBe('location_is_not_measurement_unit');
      expect(validateToolValue(unit, schema, '$.product_name')).toBeNull();
    }
    for (const unit of [null, 'kilo', 'lita', 'vipande', 'ndoo']) {
      expect(validateToolValue(unit, schema, '$.lines[0].unit_wording')).toBeNull();
    }
  });
  it('rejects a location in a unit clarification without rejecting the same product name', () => {
    const contract = { name: 'resolve_pending_clarification', input_schema: { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, canonical_value: { type: 'string' } } } } } } };
    const check = (field: string, value: string) => validateToolRound([{ id: 'one', name: contract.name, input: { answers: [{ field, canonical_value: value }] } }], [contract]);
    expect(check('unit', 'sto')?.code).toBe('location_is_not_measurement_unit');
    expect(check('unit', 'kilo')).toBeNull();
    expect(check('product', 'sto')).toBeNull();
  });
});
