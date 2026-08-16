import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Products portion and rename UI', () => {
  it('shows set selling prices by unit instead of labelling achieved average as the set price', () => {
    const page = read('src/routes/products/ProductsPage.tsx');
    expect(page).toContain("selling: 'Bei ya kuuza'");
    expect(page).toContain("avgSelling: 'Wastani uliopatikana'");
    expect(page).toContain('sellingPriceText(prices)');
    expect(page).toContain('useCurrentSellingPrices');
  });

  it('keeps Edit in the three-dot menu and exposes portions and audited rename in the dialog', () => {
    const page = read('src/routes/products/ProductsPage.tsx');
    const menu = read('src/components/products/ProductRowMenu.tsx');
    const dialog = read('src/components/products/ProductEditDialog.tsx');
    expect(page).not.toContain('<Pencil');
    expect(menu).toContain('onEdit(product)');
    expect(dialog).toContain("value: 'rename'");
    expect(dialog).toContain('sellingRows.map');
    expect(dialog).toContain('unitBaseQuantity');
  });

  it('still shows Daily Records skeletons while the grouped day list loads', () => {
    const page = read('src/routes/dailyRecords/DailyRecordsPage.tsx');
    expect(page).toContain("state.status === 'loading'");
    expect(page.match(/<Skeleton/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('asks how a new product is measured and saves explicit checked portions transactionally', () => {
    const dialog = read('src/components/products/AddProductDialog.tsx');
    const feature = read('src/features/products/products.ts');
    expect(dialog).toContain("type ProductMode = 'standard' | 'weight' | 'liquid'");
    expect(dialog).toContain("{ key: 'robo'");
    expect(dialog).toContain("{ key: 'nusu'");
    expect(dialog).toContain('type="checkbox"');
    expect(dialog).toContain('purchaseSizeHint');
    expect(dialog).toContain('configureProductUnits({');
    expect(feature).toContain("rpc('configure_product_units'");
    expect(feature).toContain('base_quantity: unit.baseQuantity');
  });
});
