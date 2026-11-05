/** Verified synonym, NOT brand/formulation equivalence or treatment substitution. */
export function referenceName(input: string) {
  const term = input.trim().replace(/\s+/g, ' ');
  if (/^(paracetamol|acetaminophen)$/i.test(term)) return {
    entered: term, searched: 'acetaminophen',
    explanation: 'Paracetamol and acetaminophen are names for the same active ingredient. US sources use acetaminophen. Check strength, formulation and other ingredients separately.',
    sourceUrl: 'https://medlineplus.gov/druginfo/meds/a681004.html',
  };
  return { entered: term, searched: term, explanation: '', sourceUrl: '' };
}
export function overlappingIngredients(entries: { id: string; name: string; ingredient: string }[]) {
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const entry of entries) {
    const names = new Set(entry.ingredient.split(/[;,]/).map(v => referenceName(v).searched.toLowerCase()).filter(v => v && !/^(unknown|unsure|not entered|n\/a)$/.test(v)));
    for (const name of names) groups.set(name, [...groups.get(name) ?? [], { id: entry.id, name: entry.name }]);
  }
  return [...groups].filter(([, products]) => products.length > 1).map(([ingredient, products]) => ({ ingredient, products }));
}