// One-off: copy the FAQ lists that used to be hard-coded in the frontend
// (data/data.ts) into the new Category.FAQS / subCategories.FAQS columns.
//
//   node scripts/seed-category-faqs.mjs           <- dry run: prints what WOULD change
//   node scripts/seed-category-faqs.mjs --apply   <- writes the changes
//   add --force to also overwrite rows that already have FAQs saved
//
// Rows that already have FAQs are skipped by default, so edits made in the
// dashboard are never lost. Nothing else on the row is touched.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const data = JSON.parse(
  readFileSync(new URL('./data/category-faqs.json', import.meta.url), 'utf8'),
);
const norm = (s) => (s || '').trim().toLowerCase();

// The old frontend key for Versailles never matched its real URL
// (/woodvail/versailles-spc-eco), so its FAQs were never shown.
const SUB_KEY_ALIASES = { 'woodvail-versailles': 'woodvail-versailles-spc-eco' };

async function main() {
  const report = { update: [], skip: [], missing: [] };

  // Categories: keyed by custom_url.
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, custom_url: true, RecallUrl: true, FAQS: true },
  });
  for (const [key, faqs] of Object.entries(data.categories)) {
    const cat = categories.find((c) => norm(c.custom_url) === key);
    if (!cat) {
      report.missing.push(`category "${key}"`);
      continue;
    }
    if (cat.FAQS?.length && !FORCE) {
      report.skip.push(`category "${key}" (#${cat.id}) already has ${cat.FAQS.length} FAQs`);
      continue;
    }
    report.update.push(`category "${key}" (#${cat.id} ${cat.name}) <- ${faqs.length} FAQs`);
    if (APPLY) {
      await prisma.category.update({ where: { id: cat.id }, data: { FAQS: faqs } });
    }
  }

  // Subcategories: keyed by the page URL `${category RecallUrl}-${custom_url}`,
  // the same key the frontend used.
  const subs = await prisma.subCategories.findMany({
    select: {
      id: true,
      name: true,
      custom_url: true,
      FAQS: true,
      category: { select: { RecallUrl: true, custom_url: true } },
    },
  });
  for (const [rawKey, faqs] of Object.entries(data.subcategories)) {
    const key = SUB_KEY_ALIASES[rawKey] || rawKey;
    const matches = subs.filter((s) =>
      [s.category?.RecallUrl, s.category?.custom_url]
        .filter(Boolean)
        .some((prefix) => `${norm(prefix)}-${norm(s.custom_url)}` === key),
    );
    if (matches.length !== 1) {
      report.missing.push(
        `subcategory "${key}" (${matches.length ? `${matches.length} matches: ${matches.map((s) => '#' + s.id).join(', ')}` : 'no match'})`,
      );
      continue;
    }
    const sub = matches[0];
    if (sub.FAQS?.length && !FORCE) {
      report.skip.push(`subcategory "${key}" (#${sub.id}) already has ${sub.FAQS.length} FAQs`);
      continue;
    }
    report.update.push(`subcategory "${key}" (#${sub.id} ${sub.name}) <- ${faqs.length} FAQs`);
    if (APPLY) {
      await prisma.subCategories.update({ where: { id: sub.id }, data: { FAQS: faqs } });
    }
  }

  console.log(APPLY ? '== APPLIED ==' : '== DRY RUN (pass --apply to write) ==');
  for (const [k, rows] of Object.entries(report)) {
    console.log(`\n${k.toUpperCase()} (${rows.length})`);
    rows.forEach((r) => console.log('  ' + r));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
