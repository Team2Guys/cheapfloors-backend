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
      // "Physical Box available in stock" - stock is stored in boxes, not SQM
      const stockCol = header.findIndex(
        (h) => h.includes('box') && h.includes('stock'),
      );

      if (skuCol === -1 || stockCol === -1)
        throw new Error('Stock sheet is missing the SKU or box stock column');

      const updatedAt = new Date();
      const result = {
        products: 0,
        accessories: 0,
        notFound: [] as string[],
        invalid: [] as string[],
        conflicting: [] as string[],
      };

      const stockBySku = new Map<string, number>();
      for (const row of rows.slice(1)) {
        const sku = row[skuCol]?.trim();
        if (!sku) continue; // spacer and "TOTAL ..." rows

        const rawStock = (row[stockCol] ?? '').trim().replace(/,/g, '');
        // Stock never goes below zero
        const stock =
          rawStock === '' ? 0 : Math.max(0, Math.trunc(Number(rawStock)));

        if (Number.isNaN(stock)) {
          result.invalid.push(sku);
          continue;
        }

        // Same SKU listed twice with different stock is ambiguous - skip it rather than guess
        if (stockBySku.has(sku) && stockBySku.get(sku) !== stock) {
          if (!result.conflicting.includes(sku)) result.conflicting.push(sku);
          continue;
        }
        stockBySku.set(sku, stock);
      }
      for (const sku of result.conflicting) stockBySku.delete(sku);

      for (const [sku, stock] of stockBySku) {
        // First try products, then fall back to accessories
        const product = await this.prisma.products.updateMany({
          where: { sku },
          data: { stock, stockUpdateDate: updatedAt },
        });

        if (product.count > 0) {
          result.products += product.count;
          continue;
        }

        const accessory = await this.prisma.acessories.updateMany({
          where: { sku },
          data: { stock },
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
