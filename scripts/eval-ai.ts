// Small, reproducible evaluation of the server AI features against the configured provider.
// Usage: npx tsx --env-file=.env scripts/eval-ai.ts  → prints a table and writes docs/submission/ai-evaluation.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { runAi, aiConfig } from '../server/v2/ai/provider';
import { userPrompts } from '../shared/ai';
import { evidenceCards } from '../shared/evidence';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const config = aiConfig();
if (!config) throw new Error('Configure GROQ_API_KEY or AI_* variables first.');
const timed = async <T>(fn: () => Promise<T>) => {
  for (let attempt = 0; ; attempt++) {
    const t = Date.now();
    try { return { ok: true as const, value: await fn(), ms: Date.now() - t, attempts: attempt + 1 }; }
    catch (e) { if (attempt >= 2 || !/busy/i.test((e as Error).message)) return { ok: false as const, error: (e as Error).message, ms: Date.now() - t, attempts: attempt + 1 }; await sleep(20000); }
  }
};

const myths: [string, string[]][] = [
  ['Bitter gourd juice can replace my diabetes tablets', ['myth']],
  ['People with diabetes can never eat rice', ['myth']],
  ['If my sugar is normal I can stop my medicine', ['myth']],
  ['Insulin damages the kidneys', ['myth']],
  ['Only overweight people get diabetes', ['myth']],
  ['Diabetes can spread from one person to another', ['myth']],
  ['Eating sugar is the only cause of type 2 diabetes', ['myth', 'partly-true']],
  ['Cinnamon cures diabetes', ['myth']],
  ['Taking two cold medicines that both contain paracetamol is always safe', ['myth']],
  ['Regular walking helps manage blood glucose', ['supported']],
  ['You can have diabetes without feeling any symptoms', ['supported']],
  ['People with diabetes should check their feet every day', ['supported']],
  ['5G towers cause diabetes', ['not-covered', 'myth']],
];
const rxExpected = [
  { name: /glycomet/i, strength: /500/, timing: ['morning', 'night'] },
  { name: /amaryl/i, strength: /1/, timing: ['morning'] },
  { name: /telma/i, strength: /40/, timing: ['morning'] },
  { name: /atorva/i, strength: /10/, timing: ['night'] },
];

const report: Record<string, unknown> = { provider: config.provider, textModel: config.textModel, visionModel: config.visionModel, fallback: config.fallbackTextModel, ranAt: new Date().toISOString() };

const mythRows = [];
for (const [claim, expected] of myths) {
  const r = await timed(() => runAi('mythCheck', userPrompts.mythCheck(claim, evidenceCards), { maxTokens: 700 }));
  const verdict = r.ok ? r.value.verdict : 'error';
  const citedKnown = r.ok ? r.value.evidenceIds.every(id => evidenceCards.some(c => c.id === id)) : false;
  mythRows.push({ claim, expected: expected.join('|'), verdict, correct: expected.includes(verdict), citedKnown, ms: r.ms });
  console.log(`myth  ${expected.includes(verdict) ? 'PASS' : 'FAIL'}  ${verdict.padEnd(12)} ${r.ms}ms  ${claim}`);
  await sleep(3500);
}
report.mythCheck = { cases: mythRows.length, correct: mythRows.filter(r => r.correct).length, validCitations: mythRows.filter(r => r.citedKnown).length, medianMs: mythRows.map(r => r.ms).sort((a, b) => a - b)[Math.floor(mythRows.length / 2)], rows: mythRows };

const rxImage = `data:image/jpeg;base64,${(await readFile('docs/assets/sample-prescription.jpg')).toString('base64')}`;
const rx = await timed(() => runAi('prescriptionScan', userPrompts.prescriptionScan(), { image: rxImage, maxTokens: 1800 }));
const rxRows = rxExpected.map(exp => {
  const found = rx.ok ? rx.value.medicines.find(m => exp.name.test(m.name)) : undefined;
  return { expected: String(exp.name), found: Boolean(found), strength: Boolean(found && exp.strength.test(found.strength + found.name)), timing: Boolean(found && [...new Set(found.timing)].sort().join() === [...exp.timing].sort().join()) };
});
report.prescriptionScan = { ok: rx.ok, ms: rx.ms, medicinesExpected: rxRows.length, namesFound: rxRows.filter(r => r.found).length, strengthsCorrect: rxRows.filter(r => r.strength).length, timingsCorrect: rxRows.filter(r => r.timing).length, extraMedicines: rx.ok ? rx.value.medicines.length - rxRows.filter(r => r.found).length : null, rows: rxRows };
console.log('prescription', JSON.stringify(report.prescriptionScan));
await sleep(5000);

const meal = `data:image/jpeg;base64,${(await readFile('docs/assets/sample-meal.jpg')).toString('base64')}`;
const food = await timed(() => runAi('foodPhoto', userPrompts.foodPhoto(), { image: meal }));
report.foodPhoto = { ok: food.ok, ms: food.ms, items: food.ok ? food.value.items.map(i => `${i.name} ~${i.estimatedGrams} g`) : [], note: 'Vegetarian thali photo (Wikimedia Commons, CC BY-SA 4.0); identification only, no ground-truth weights.' };
console.log('food', JSON.stringify(report.foodPhoto));

await mkdir('docs/submission', { recursive: true });
await writeFile('docs/submission/ai-evaluation.json', JSON.stringify(report, null, 2));
console.log('written docs/submission/ai-evaluation.json');
