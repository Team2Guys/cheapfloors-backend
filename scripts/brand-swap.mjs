// One-off migration cleanup: swap the Easy Floors brand for Cheap Floors in
// CMS content (titles, meta, OG text, descriptions, whatami copy, image URLs).
//
//   node scripts/brand-swap.mjs           <- dry run: prints what WOULD change
//   node scripts/brand-swap.mjs --apply   <- writes the changes
//
// Only content tables are touched. Admins/Users/orders are never read, so
// real email addresses and account data cannot be rewritten. Slug/route
// fields are excluded so no URL structure changes.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Longest / most specific first. Lowercase "easy floors" (with space) is
// intentionally absent: it appears in generic copy ("easy floors to clean").
const PAIRS = [
  ['EASYFLOORS', 'CHEAPFLOORS'],
  ['EasyFloors', 'CheapFloors'],
  ['Easyfloors', 'Cheapfloors'],
  ['easyFloors', 'cheapFloors'],
  ['easyfloors', 'cheapfloors'],
  ['EASY FLOORS', 'CHEAP FLOORS'],
  ['Easy Floors', 'Cheap Floors'],
  ['Easy floors', 'Cheap floors']
];

// Route/identity fields that must never be rewritten.
const EXCLUDE_KEYS = new Set([
  'id',
  'custom_url',
  'RecallUrl',
  'Recall_Cat',
  'whatIamEndpoint',
  'last_editedBy',
  'sku',
  'status',
  'createdAt',
  'updatedAt'
]);

const swap = (s) => PAIRS.reduce((acc, [from, to]) => acc.split(from).join(to), s);

const transform = (value) => {
  if (typeof value === 'string') return swap(value);
  if (Array.isArray(value)) return value.map(transform);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, transform(v)])
    );
  }
  return value;
};

const TABLES = ['category', 'subCategories', 'products', 'acessories', 'reviews'];

let totalRows = 0;
let totalFields = 0;

for (const table of TABLES) {
  const rows = await prisma[table].findMany();
  let changedRows = 0;

  for (const row of rows) {
    const patch = {};
    for (const [key, value] of Object.entries(row)) {
      if (EXCLUDE_KEYS.has(key) || value == null) continue;
      if (typeof value !== 'string' && typeof value !== 'object') continue;
      const next = transform(value);
      if (JSON.stringify(next) !== JSON.stringify(value)) {
        patch[key] = next;
        totalFields++;
        if (!APPLY) {
          const before = JSON.stringify(value);
          console.log(
            `  [${table}#${row.id}] ${key}: ${before.length > 160 ? before.slice(0, 160) + '…' : before}`
          );
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      changedRows++;
      if (APPLY) {
        await prisma[table].update({ where: { id: row.id }, data: patch });
      }
    }
  }

  totalRows += changedRows;
  console.log(`${table}: ${rows.length} rows scanned, ${changedRows} with brand remnants`);
}

console.log(
  `\n${APPLY ? 'UPDATED' : 'DRY RUN — would update'}: ${totalRows} rows / ${totalFields} fields.` +
    (APPLY ? '' : ' Re-run with --apply to write.')
);

await prisma.$disconnect();
