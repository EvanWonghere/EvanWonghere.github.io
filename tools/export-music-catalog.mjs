// Usage: node tools/export-music-catalog.mjs [path/to/InterviewQuestionBank]
// Writes static/music/catalog-versions.mjs here and, when a quiz checkout is given,
// supabase/functions/ai-tutor/musicCatalog.json there. Run after any lesson change.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCatalog, versionsModule } from './music-catalog.mjs';

const catalog = buildCatalog();
const here = new URL('../static/music/catalog-versions.mjs', import.meta.url);
await writeFile(here, versionsModule(catalog));
console.log(`wrote ${here.pathname} (${catalog.lessons.length} lessons)`);
const quiz = process.argv[2];
if (quiz) {
    const target = join(quiz, 'supabase/functions/ai-tutor/musicCatalog.json');
    await writeFile(target, `${JSON.stringify(catalog, null, 1)}\n`);
    console.log(`wrote ${target}`);
}
