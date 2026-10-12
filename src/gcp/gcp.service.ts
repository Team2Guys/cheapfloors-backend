import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleAuthService } from './services/google-auth.service';
import { timeStamp } from 'console';
import { PrismaService } from '../prisma/prisma.service';
import { customHttpException } from '../utils/helper';

@Injectable()
export class GoogleMerchantService {
  constructor(
    private readonly authService: GoogleAuthService,

    private prisma: PrismaService,
  ) { }

  // Stock sheet must stay shared as "Anyone with the link can view" for the CSV export to work
  private readonly STOCK_SHEET_URL =
    'https://docs.google.com/spreadsheets/d/1F5ztqf3veFWc5TUJRbAy605TOqOah4n5qXOZJxOXWeA/export?format=csv';

  async uploadProducts(merchantId: string) {
    const authClient = await this.authService.setStoredCredentials();
    const content = google.content({ version: 'v2.1', auth: authClient });

    const products = await this.prisma.products.findMany({
      include: { category: true, subcategory: true },
    });
    if (!products || products.length === 0) return 'No products found';

    const responses: any = [];

    for (const product of products) {
      let url = 'https://cheapfloors.ae/';

      if (product.subcategory) {
        url += `${product.category?.RecallUrl}/${product.subcategory.custom_url}/${product.custom_url}`;
      } else {
        url += `${product.category?.RecallUrl}/${product.custom_url}`;
      }
      try {
        const res = await content.products.insert({
          merchantId,
          requestBody: {
            offerId: product.id.toString(),
            title: product.name,
            description: product.description,
            link: url,
            // @ts-ignore
            imageLink: product?.posterImageUrl?.imageUrl as any,
            contentLanguage: 'en',
            targetCountry: 'AE',
            channel: 'online',
            availability: product.stock > 0 ? 'in stock' : 'out of stock',
            condition: 'new',
            price: {
              value: product.price.toString(),
              currency: 'AED',
            },
          },
        });

        responses.push({ productId: product.id, result: res.data });
      } catch (error) {
        console.error(`Error uploading product ${product.id}:`, error.message);
        responses.push({ productId: product.id, error: error.message });
      }
    }

    return responses;
  }

  async UpdateStock() {
    try {
      const response = await fetch(this.STOCK_SHEET_URL);
      const contentType = response.headers.get('content-type') ?? '';

      // A private sheet redirects to Google's HTML sign-in page instead of CSV
      if (!response.ok || !contentType.includes('text/csv'))
        throw new Error(
          `Stock sheet not readable (HTTP ${response.status}, ${contentType})`,
        );

      const rows = this.parseCsv(await response.text());
      const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
      const skuCol = header.indexOf('sku');
      // "Total SQM" - flooring stock is stored in SQM
      const sqmCol = header.findIndex(
        (h) => h.includes('total') && h.includes('sqm'),
      );
      // "Physical Box available in stock" - pieces for accessories, and a
      // fallback (boxes x per-box SQM) when the total column is blank
      const boxCol = header.findIndex(
        (h) => h.includes('box') && h.includes('stock'),
      );
      // "Per Box SQM" - carton coverage, used to fill in a missing boxCoverage
      const perBoxCol = header.findIndex(
        (h) => h.includes('per box') && h.includes('sqm'),
      );

      if (skuCol === -1 || (sqmCol === -1 && boxCol === -1))
        throw new Error('Stock sheet is missing the SKU or stock columns');

      const updatedAt = new Date();
      const result = {
        products: 0,
        accessories: 0,
        notFound: [] as string[],
        invalid: [] as string[],
        conflicting: [] as string[],
      };

      type SheetStock = { sqm: number; pieces: number; perBoxSqm: number | null };
      const stockBySku = new Map<string, SheetStock>();
      for (const row of rows.slice(1)) {
        const sku = row[skuCol]?.trim();
        if (!sku) continue; // spacer and "TOTAL ..." rows

        const boxes = this.parseNumber(row[boxCol]);
        const perBoxSqm = this.parseNumber(row[perBoxCol]);
        let sqm = this.parseNumber(row[sqmCol]);
        if (sqm === null && boxes !== null && perBoxSqm !== null)
          sqm = boxes * perBoxSqm;

        if (
          Number.isNaN(boxes) ||
          Number.isNaN(perBoxSqm) ||
          Number.isNaN(sqm)
        ) {
          result.invalid.push(sku);
          continue;
        }

        // Stock never goes below zero; SQM is kept at two decimals
        const entry: SheetStock = {
          sqm: Math.max(0, Math.round((sqm ?? 0) * 100) / 100),
          pieces: Math.max(0, Math.trunc(boxes ?? 0)),
          perBoxSqm: perBoxSqm !== null && perBoxSqm > 0 ? perBoxSqm : null,
        };

        // Same SKU listed twice with different stock is ambiguous - skip it rather than guess
        const existing = stockBySku.get(sku);
        if (
          existing &&
          (existing.sqm !== entry.sqm || existing.pieces !== entry.pieces)
        ) {
          if (!result.conflicting.includes(sku)) result.conflicting.push(sku);
          continue;
        }
        stockBySku.set(sku, entry);
      }
      for (const sku of result.conflicting) stockBySku.delete(sku);

      for (const [sku, { sqm, pieces, perBoxSqm }] of stockBySku) {
        // First try products (stock in SQM), then fall back to accessories (pieces)
        const product = await this.prisma.products.updateMany({
          where: { sku },
          data: { stock: sqm, stockUpdateDate: updatedAt },
        });

        if (product.count > 0) {
          result.products += product.count;
          // SQM-per-carton is no longer entered on the dashboard, so fill it in
          // from the sheet when a product has none. Existing values are kept.
          if (perBoxSqm !== null)
            await this.prisma.products.updateMany({
              where: { sku, OR: [{ boxCoverage: null }, { boxCoverage: '' }] },
              data: { boxCoverage: String(perBoxSqm) },
            });
          continue;
        }

        const accessory = await this.prisma.acessories.updateMany({
          where: { sku },
          data: { stock: pieces },
        });

        if (accessory.count > 0) result.accessories += accessory.count;
        else result.notFound.push(sku);
      }

      return result;
    } catch (error) {
      console.error('Error updating stock:', error.message);
      throw customHttpException('Failed to update stock');
    }
  }

  // A blank cell (or a missing column) is null; anything non-numeric is NaN
  private parseNumber(cell: string | undefined): number | null {
    const raw = (cell ?? '').trim().replace(/,/g, '');
    return raw === '' ? null : Number(raw);
  }

  // Minimal RFC 4180 parser: handles quoted fields containing commas, quotes and newlines
  private parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') inQuotes = false;
        else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch !== '\r') field += ch;
    }

    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }
}
