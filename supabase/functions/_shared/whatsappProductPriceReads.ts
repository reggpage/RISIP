export type ProductPriceRead = {
  productName: string;
  retailPrice: number | null;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
};

export function priceComparisonRows(
  rows: ProductPriceRead[],
  direction: 'lowest' | 'highest',
): ProductPriceRead[] {
  const ranked = rows
    .filter((row) => row.retailPrice !== null && Number.isFinite(row.retailPrice) && row.retailPrice >= 0)
    .sort((a, b) => direction === 'lowest'
      ? (a.retailPrice! - b.retailPrice!) || a.productName.localeCompare(b.productName)
      : (b.retailPrice! - a.retailPrice!) || a.productName.localeCompare(b.productName))
    .slice(0, 5);
  const winner = ranked[0]?.retailPrice;
  return winner === undefined ? [] : ranked.filter((row) => row.retailPrice === winner);
}

export function missingSellingPriceRows(rows: ProductPriceRead[]): ProductPriceRead[] {
  return rows.filter((row) => row.retailPrice === null || !Number.isFinite(row.retailPrice));
}

function money(value: number): string {
  return `TSh ${Math.round(value).toLocaleString('en-US')}`;
}

export function productPriceComparisonReply(
  rows: ProductPriceRead[],
  direction: 'lowest' | 'highest',
  lang: 'sw' | 'en',
): string {
  const ranked = priceComparisonRows(rows, direction);
  if (ranked.length === 0) {
    return lang === 'sw' ? 'Bado hakuna bei ya kuuza iliyowekwa.' : 'No selling prices are configured yet.';
  }
  const title = direction === 'lowest'
    ? (lang === 'sw' ? 'Bei ya chini zaidi ya kuuza:' : 'Lowest selling price:')
    : (lang === 'sw' ? 'Bei ya juu zaidi ya kuuza:' : 'Highest selling price:');
  return `${title}\n${ranked.map((row) => `• ${row.productName} — ${money(row.retailPrice!)}`).join('\n')}`;
}

export function missingSellingPriceReply(rows: ProductPriceRead[], lang: 'sw' | 'en'): string {
  const missing = missingSellingPriceRows(rows);
  if (missing.length === 0) {
    return lang === 'sw' ? 'Bidhaa zote zina bei ya kuuza iliyowekwa.' : 'Every product has a configured selling price.';
  }
  const title = lang === 'sw' ? 'Bidhaa zisizo na bei ya kuuza:' : 'Products missing a selling price:';
  return `${title}\n${missing.slice(0, 30).map((row) => `• ${row.productName}`).join('\n')}`;
}
