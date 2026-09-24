// Usage: node tools/export-music-catalog.mjs [path/to/InterviewQuestionBank]
// Writes static/music/catalog-versions.mjs here and, when a quiz checkout is given,
// supabase/functions/ai-tutor/musicCatalog.json there, plus copies of the arrangement modules
// the server uses to validate AI proposals. Run after any lesson or arrangement-model change.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ARRANGEMENT_MODULES, arrangementCopy, buildCatalog, versionsModule } from './music-catalog.mjs';

const catalog = buildCatalog();
const here = new URL('../static/music/catalog-versions.mjs', import.meta.url);
await writeFile(here, versionsModule(catalog));
console.log(`wrote ${here.pathname} (${catalog.lessons.length} lessons)`);
const quiz = process.argv[2];
if (quiz) {
    const target = join(quiz, 'supabase/functions/ai-tutor/musicCatalog.json');
    await writeFile(target, `${JSON.stringify(catalog, null, 1)}\n`);
    console.log(`wrote ${target}`);
    const dir = join(quiz, 'supabase/functions/ai-tutor/arrangement');
    await mkdir(dir, { recursive: true });
    for (const file of ARRANGEMENT_MODULES) {
        const source = await readFile(new URL(`../static/music/${file}`, import.meta.url), 'utf8');
        await writeFile(join(dir, file), arrangementCopy(file, source));
    }
    console.log(`copied ${ARRANGEMENT_MODULES.length} arrangement modules to ${dir}`);
}
