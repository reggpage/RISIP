import { describe, expect, it } from 'vitest';
import { validateToolValue } from '../../../../supabase/functions/_shared/whatsappToolBoundary';

describe('structured unit validation', () => {
  it('rejects location labels but does not parse product names or sentences', () => {
    const schema = { type: ['string', 'null'] };
    for (const unit of ['stoo', ' Stoo ', 'dukani', 'stock', 'store', 'warehouse']) {
      expect(validateToolValue(unit, schema, '$.lines[0].unit_wording')?.code).toBe('location_is_not_measurement_unit');
      expect(validateToolValue(unit, schema, '$.product_name')).toBeNull();
    }
    for (const unit of [null, 'kilo', 'lita', 'vipande', 'ndoo']) {
      expect(validateToolValue(unit, schema, '$.lines[0].unit_wording')).toBeNull();
    }
  });
});
