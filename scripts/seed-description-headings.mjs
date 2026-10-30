// One-off: upload the new description H2s from the SEO sheet
// (scripts/data/description-headings.json) into Products.Description_Heading
// and Acessories.Description_Heading.
//
//   node scripts/seed-description-headings.mjs           <- dry run: prints what WOULD change
//   node scripts/seed-description-headings.mjs --apply   <- writes the changes
//   add --force to also overwrite rows that already have a heading saved
//
// Each row is matched by its page URL:
//   /{category RecallUrl}/{subcategory}/{product}  -> Products
//   /accessories/{accessory}                       -> Acessories
// Rows that already have a heading are skipped by default, so edits made in
// the dashboard are never lost. Nothing else on the row is touched.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const { rows } = JSON.parse(
  readFileSync(new URL('./data/description-headings.json', import.meta.url), 'utf8'),
);
const norm = (s) => (s || '').trim().toLowerCase();

async function main() {
  const report = { update: [], unchanged: [], skip: [], missing: [] };

  const products = await prisma.products.findMany({
    select: {
      id: true,
      name: true,
      custom_url: true,
      Description_Heading: true,
      category: { select: { RecallUrl: true, custom_url: true } },
      subcategory: { select: { custom_url: true } },
    },
  });
  const accessories = await prisma.acessories.findMany({
    select: { id: true, name: true, custom_url: true, Description_Heading: true },
  });

  for (const { url, heading } of rows) {
    const seg = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const isAccessory = seg[0] === 'accessories' && seg.length === 2;

    const matches = isAccessory
      ? accessories.filter((a) => norm(a.custom_url) === norm(seg[1]))
      : seg.length === 3
        ? products.filter(
            (p) =>
              norm(p.custom_url) === norm(seg[2]) &&
              norm(p.subcategory?.custom_url) === norm(seg[1]) &&
              [p.category?.RecallUrl, p.category?.custom_url].map(norm).includes(norm(seg[0])),
          )
        : [];

    if (matches.length !== 1) {
      report.missing.push(`${url} (${matches.length} matches)`);
      continue;
    }
    const row = matches[0];
    const label = `${isAccessory ? 'accessory' : 'product'} #${row.id} ${row.name.trim()}`;

    if (row.Description_Heading?.trim() === heading) {
      report.unchanged.push(label);
      continue;
    }
    if (row.Description_Heading?.trim() && !FORCE) {
      report.skip.push(`${label} already has "${row.Description_Heading}"`);
      continue;
    }
    report.update.push(`${label} <- "${heading}"`);
    if (APPLY) {
      const model = isAccessory ? prisma.acessories : prisma.products;
      await model.update({ where: { id: row.id }, data: { Description_Heading: heading } });
    }
  }

  console.log(APPLY ? '== APPLIED ==' : '== DRY RUN (pass --apply to write) ==');
  for (const [k, list] of Object.entries(report)) {
    console.log(`\n${k.toUpperCase()} (${list.length})`);
    list.forEach((r) => console.log('  ' + r));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
