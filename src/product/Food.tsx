import { useEffect, useRef, useState } from 'react';
import { BookOpen, Camera, Edit3, ExternalLink, Plus, RotateCcw, Search, Utensils, X } from 'lucide-react';
import FoodCamera from './FoodCamera';
import Cookbook from './Cookbook';
import type { Entity, FoodResult, FoodsResponse, MealData, Nutrition, RecipeData, RecipeIngredient } from '../../shared/v2';
import { useProduct } from './context';
import { can, ConfirmButton, dataOf, Dialog, Empty, errorText, Field, FormActions, fromIST, istDate, istInput, Loading, Notice, Provenance, stamp, useAction, useClock } from './ui';

const nutrients = [['carbs', 'Carbohydrate', 'g'], ['fiber', 'Fibre', 'g'], ['protein', 'Protein', 'g'], ['kcal', 'Energy', 'kcal']] as const;
const unknown: Nutrition = { carbs: null, fiber: null, protein: null, kcal: null };
function scale(n: Nutrition, factor: number): Nutrition { return { carbs: n.carbs === null ? null : n.carbs * factor, fiber: n.fiber === null ? null : n.fiber * factor, protein: n.protein === null ? null : n.protein * factor, kcal: n.kcal === null ? null : n.kcal * factor }; }
function totals(ingredients: RecipeIngredient[]): Nutrition {
  const result: Nutrition = { ...unknown };
  for (const [key] of nutrients) result[key] = !ingredients.length || ingredients.some(i => i[key] === null) ? null : ingredients.reduce((sum, i) => sum + (i[key] as number), 0);
  return result;
}
function NutrientSummary({ value }: { value: Nutrition }) { return <dl className="card-grid">{nutrients.map(([key, label, unit]) => <div key={key}><dt className="muted small">{label}</dt><dd>{value[key] === null ? 'Unknown' : `${Number(value[key].toFixed(2))} ${unit}`}</dd></div>)}</dl>; }
function NutrientFields({ value, onChange }: { value: Nutrition; onChange: (value: Nutrition) => void }) { return <>{nutrients.map(([key, label, unit]) => <Field key={key} label={`${label} (${unit}, optional)`}><input type="number" min="0" max="100000" step="any" value={value[key] ?? ''} placeholder="Unknown" onChange={e => onChange({ ...value, [key]: e.target.value === '' ? null : Number(e.target.value) })} /></Field>)}</>; }
function mealNow(): MealData { return { ...unknown, name: '', meal: 'Meal', at: new Date().toISOString(), grams: 0, source: 'User-entered' }; }
function blankIngredient(): RecipeIngredient { return { ...unknown, name: '', grams: 0, source: 'User-entered' }; }

export default function Food() { const { spaceId } = useProduct(); return <FoodWorkspace key={spaceId} />; }

function FoodWorkspace() {
  const { snapshot, busy, request, remove } = useProduct();
  const now = useClock();
  const [tab, setTab] = useState('search');
  const [camera, setCamera] = useState(false);
  const [mode, setMode] = useState<'text' | 'barcode'>('text');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<FoodsResponse | null>(null);
  const [searched, setSearched] = useState('');
  const sequence = useRef(0);
  const [mealEditor, setMealEditor] = useState<{ entity?: Entity; seed?: MealData; food?: FoodResult } | null>(null);
  const [recipeEditor, setRecipeEditor] = useState<{ entity?: Entity; seed?: RecipeData } | null>(null);
  const [portion, setPortion] = useState<Entity | null>(null);
  useEffect(() => () => { sequence.current++; }, []);
  function invalidate() { sequence.current++; setLoading(false); setResults(null); setSearched(''); setError(''); }
  async function search() {
    const id = ++sequence.current;
    const term = query.trim();
    setResults(null); setError(''); setSearched(term); setLoading(true);
    try { const response = await request<FoodsResponse>(`/foods/search?${mode === 'barcode' ? 'barcode' : 'q'}=${encodeURIComponent(term)}`); if (id === sequence.current) setResults(response); }
    catch (e) { if (id === sequence.current) setError(errorText(e)); }
    finally { if (id === sequence.current) setLoading(false); }
  }
  const journal = snapshot.entities.meals.filter(e => istDate(dataOf<'meals'>(e).at) === istDate(now)).sort((a, b) => dataOf<'meals'>(b).at.localeCompare(dataOf<'meals'>(a).at));
  const writeMeals = can(snapshot, 'meals');
  return <div className="stack"><header className="page-heading"><div><p className="eyebrow">LESS TYPING. MORE LIVING.</p><h1>What’s on your plate?</h1><p className="muted">Take a photo or find your food. Confirm the portion—we’ll do the arithmetic.</p></div><button className="btn primary" onClick={() => setCamera(true)}><Camera size={20} />Take a meal photo</button></header>
    <nav className="tabs" aria-label="Food views">{[['search', 'Find a food'], ['cookbook', 'What to cook'], ['journal', 'Today’s meals']].map(([key, label]) => <button className={`btn ${tab === key ? 'primary' : 'ghost'}`} key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === 'cookbook' && <Cookbook/>}
    {tab === 'search' && <div className="quick-foods" aria-label="Common food searches">{['Idli','Dosa','Dal','Roti','Rice','Poha','Curd','Banana'].map(name=><button className="btn secondary" key={name} onClick={()=>{invalidate();setQuery(name);setMode('text');}}>{name}</button>)}</div>}
    {tab === 'journal' && <div className="row"><button className="btn secondary" onClick={()=>setTab('search')}><Search size={18}/>Find food to add</button><details><summary>Something missing?</summary><button className="btn ghost" disabled={busy||!writeMeals} onClick={()=>setMealEditor({})}>Enter a food manually</button><button className="btn ghost" onClick={()=>setTab('recipes')}>Previously saved recipes</button></details></div>}
    {tab === 'search' && <section className="panel stack"><div><h2>Search a live food source</h2><p className="muted">Only your submitted search term or barcode is sent to the provider. Values are per 100 g, not a health score.</p></div><form className="stack" onSubmit={e => { e.preventDefault(); void search(); }}><div className="form-grid"><Field label="Search method"><select value={mode} onChange={e => { invalidate(); setMode(e.target.value as typeof mode); setQuery(''); }}><option value="text">Food name</option><option value="barcode">Barcode number</option></select></Field><Field label={mode === 'barcode' ? 'Barcode digits' : 'Food name'}><input className="search-field" required minLength={mode === 'barcode' ? 4 : 2} maxLength={mode === 'barcode' ? 24 : 100} inputMode={mode === 'barcode' ? 'numeric' : 'text'} pattern={mode === 'barcode' ? '[0-9]{4,24}' : undefined} value={query} onChange={e => { invalidate(); setQuery(e.target.value); }} /></Field></div><button className="btn primary" disabled={loading} type="submit"><Search size={18} />{loading ? 'Searching…' : 'Search source'}</button></form>{loading && <Loading>Looking up “{searched}”…</Loading>}{error && <Notice error>{error} Edit the query or search again to retry.</Notice>}{!loading && !results && !error && <Empty>Search for a food or enter a barcode. No built-in catalog is substituted.</Empty>}{results && <><p className="muted small">{results.provider} · {results.notice}</p><h3>Results for “{searched}”</h3>{!results.results.length && <Empty>No matching foods returned. Try another term, or log a custom meal with the details you have.</Empty>}<div className="card-grid">{results.results.map(food => <article className="panel stack" key={food.id}><div><h3>{food.name}</h3><p className="muted">{food.brand || 'Brand not supplied'}</p></div><span className="chip">Per 100 g</span><NutrientSummary value={food.per100g} /><p className="small">Source: {food.source}</p><div className="row"><a href={food.sourceUrl} target="_blank" rel="noreferrer" className="btn ghost">Source <ExternalLink size={16} /></a><button className="btn secondary" disabled={busy || !writeMeals} onClick={() => setMealEditor({ food })}><Plus size={16} />Use this food</button></div></article>)}</div></>}</section>}
    {tab === 'journal' && <section className="stack"><div className="row"><h2>Today · {istDate(now)} · IST</h2><span className="chip">{can(snapshot, 'meals', 'read') ? `${journal.length} entries` : 'Not shared'}</span></div>{!can(snapshot, 'meals', 'read') ? <Notice>Meal records have not been shared with you.</Notice> : !journal.length ? <Empty>No meals logged today. Add any food with the portion and details you know.</Empty> : journal.map(entity => { const d = dataOf<'meals'>(entity); return <article className="panel stack" key={entity.id}><div className="row"><div><h3>{d.name}</h3><p className="muted">{d.meal} · {stamp(d.at)} · {d.grams} g</p></div><Utensils size={24} aria-hidden="true" /></div><NutrientSummary value={d} /><p className="small">Nutrition for this logged portion · {d.source}{d.sourceUrl && <> · <a href={d.sourceUrl} target="_blank" rel="noreferrer">Source</a></>}</p><Provenance entity={entity} /><div className="row"><button className="btn secondary" disabled={busy || !writeMeals} onClick={() => setMealEditor({ entity })}><Edit3 size={16} />Edit</button><button className="btn ghost" disabled={busy || !writeMeals} onClick={() => setMealEditor({ seed: { ...d, at: new Date().toISOString() } })}><RotateCcw size={16} />Repeat</button><button className="btn ghost" disabled={busy || !can(snapshot, 'recipes')} onClick={() => setRecipeEditor({ seed: { name: d.name, servings: 1, instructions: '', ingredients: [{ name: d.name, grams: d.grams, carbs: d.carbs, fiber: d.fiber, protein: d.protein, kcal: d.kcal, source: d.source }] } })}><BookOpen size={16} />Save as favorite</button><ConfirmButton title="Delete meal entry?" disabled={busy || !writeMeals} onConfirm={() => remove(entity)}>Delete this journal entry? Saved recipes will not be changed.</ConfirmButton></div></article>; })}</section>}
    {tab === 'recipes' && <section className="stack"><div className="row"><div><h2>Recipes & favorites</h2><p className="muted">Your saved recipes, not a supplied catalog. Enter nutrient totals for each ingredient’s stated amount.</p></div><button className="btn primary" disabled={busy || !can(snapshot, 'recipes')} onClick={() => setRecipeEditor({})}><Plus size={18} />Build recipe</button></div>{!can(snapshot, 'recipes', 'read') ? <Notice>Recipes have not been shared with you.</Notice> : !snapshot.entities.recipes.length ? <Empty>No saved recipes yet. Build a recipe or save a meal as a favorite.</Empty> : <div className="card-grid">{snapshot.entities.recipes.map(entity => { const d = dataOf<'recipes'>(entity); return <article className="panel stack" key={entity.id}><h3>{d.name}</h3><p className="muted">{d.ingredients.length} ingredients · {d.servings} servings · {Number((d.ingredients.reduce((s, i) => s + i.grams, 0) / d.servings).toFixed(2))} g per serving</p><span className="chip">Per serving · entered amounts</span><NutrientSummary value={scale(totals(d.ingredients), 1 / d.servings)} /><details><summary>Ingredients & preparation</summary>{d.ingredients.map((i, index) => <p key={index}>{i.name} · {i.grams} g · {i.source}</p>)}<p>{d.instructions || 'No preparation notes.'}</p></details><Provenance entity={entity} /><div className="row"><button className="btn primary" disabled={busy || !writeMeals} onClick={() => setPortion(entity)}><Plus size={16} />Log portion</button><button className="btn secondary" disabled={busy || !can(snapshot, 'recipes')} onClick={() => setRecipeEditor({ entity })}><Edit3 size={16} />Edit</button><ConfirmButton title="Delete recipe?" disabled={busy || !can(snapshot, 'recipes')} onConfirm={() => remove(entity)}>Remove this saved recipe? Meals already logged from it remain unchanged.</ConfirmButton></div></article>; })}</div>}</section>}
    {camera && <FoodCamera onClose={()=>setCamera(false)} onSearch={name=>{invalidate();setQuery(name);setMode('text');setTab('search');}}/>}
    {mealEditor && <MealEditor {...mealEditor} onClose={() => setMealEditor(null)} />}{recipeEditor && <RecipeEditor {...recipeEditor} onClose={() => setRecipeEditor(null)} />}{portion && <RecipePortion entity={portion} onClose={() => setPortion(null)} />}
  </div>;
}

function MealEditor({ entity, seed, food, onClose }: { entity?: Entity; seed?: MealData; food?: FoodResult; onClose: () => void }) {
  const { create, update, busy } = useProduct();
  const action = useAction();
  const [d, setD] = useState<MealData>(() => entity ? { ...dataOf<'meals'>(entity) } : seed ?? (food ? { ...mealNow(), name: food.name, grams: 100, ...food.per100g, source: `${food.source}${food.brand ? ` · ${food.brand}` : ''}`.slice(0, 500), sourceUrl: food.sourceUrl, foodId: food.id } : mealNow()));
  const [at, setAt] = useState(istInput(d.at));
  const [customNutrition, setCustomNutrition] = useState(false);
  const [note, setNote] = useState('');
  const current = food && !customNutrition ? { ...d, ...scale(food.per100g, d.grams / 100) } : d;
  const invalidAmount = nutrients.some(([key]) => current[key] !== null && (!Number.isFinite(current[key]) || current[key]! > 100000));
  return <Dialog title={entity ? 'Edit meal entry' : food ? 'Set your portion' : seed ? 'Repeat meal' : 'Log a custom meal'} onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => {
    e.preventDefault();
    if (await action.run(async () => {
      const atISO = fromIST(at);
      if (Date.parse(atISO) > Date.now()) throw new Error('Choose a time that has already occurred.');
      const data: MealData = { ...current, at: atISO, ...(customNutrition ? { source: `User-entered nutrition${note.trim() ? ` · ${note.trim()}` : ''}`.slice(0, 500) } : {}) };
      return entity ? update(entity, data) : create('meals', data);
    })) onClose();
  }}><div className="form-grid"><Field label="Food / meal name"><input autoFocus required maxLength={200} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></Field><Field label="Meal category"><input required maxLength={100} value={d.meal} onChange={e => setD({ ...d, meal: e.target.value })} list="p-meal-types" /><datalist id="p-meal-types"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option></datalist></Field><Field label="Recorded at · IST"><input required type="datetime-local" value={at} max={istInput()} onChange={e => setAt(e.target.value)} /></Field><Field label="Portion weight (g)"><input required type="number" min="0" max="100000" step="any" value={d.grams} onChange={e => setD({ ...d, grams: Number(e.target.value) })} /></Field></div>
    {food && !customNutrition ? <><Notice>Calculated from the provider’s per-100-g values × your grams ÷ 100. Unknown nutrients remain unknown.</Notice><NutrientSummary value={current} /><button type="button" className="btn ghost" onClick={() => { setD(current); setCustomNutrition(true); }}>Enter my own nutrient totals instead</button></> : <><p className="muted">Enter totals for the entire portion above, not per 100 g. Changing grams does not rescale these manually entered totals. Blank means unknown; zero means a known zero.</p><div className="form-grid"><NutrientFields value={d} onChange={n => { setD({ ...d, ...n }); if (entity || seed) setCustomNutrition(true); }} /></div></>}
    {customNutrition ? <Field label="Nutrition source note (optional)"><input maxLength={450} value={note} onChange={e => setNote(e.target.value)} /></Field> : !food && !entity && !seed ? <Field label="Source note" hint="Saved as user-entered, not a verified provider result."><input maxLength={450} value={note} onChange={e => { setNote(e.target.value); setD({ ...d, source: `User-entered${e.target.value.trim() ? ` · ${e.target.value.trim()}` : ''}` }); }} /></Field> : null}
    <p className="muted small">{customNutrition ? 'User-entered nutrition' : d.source}{d.sourceUrl && <> · <a href={d.sourceUrl} target="_blank" rel="noreferrer">Original source</a></>}</p>{invalidAmount && <Notice error>This portion exceeds the service’s supported nutrient range. Check the weight and original values.</Notice>}{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} invalid={invalidAmount} onClose={onClose} label={entity ? 'Save changes' : 'Log meal'} />
  </form></Dialog>;
}

function RecipeEditor({ entity, seed, onClose }: { entity?: Entity; seed?: RecipeData; onClose: () => void }) {
  const { create, update, busy } = useProduct();
  const action = useAction();
  const [d, setD] = useState<RecipeData>(() => entity ? { ...dataOf<'recipes'>(entity), ingredients: dataOf<'recipes'>(entity).ingredients.map(i => ({ ...i })) } : seed ?? { name: '', servings: 1, ingredients: [blankIngredient()], instructions: '' });
  function ingredient(index: number, value: Partial<RecipeIngredient>) { setD(previous => ({ ...previous, ingredients: previous.ingredients.map((i, n) => n === index ? { ...i, ...value } : i) })); }
  return <Dialog title={entity ? 'Edit recipe' : 'Build a saved recipe'} onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => { e.preventDefault(); if (await action.run(() => entity ? update(entity, d) : create('recipes', d))) onClose(); }}><div className="form-grid"><Field label="Recipe name"><input autoFocus required maxLength={200} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></Field><Field label="Number of servings in the whole recipe"><input required type="number" min="1" max="1000" step="1" value={d.servings} onChange={e => setD({ ...d, servings: Number(e.target.value) })} /></Field></div><Notice>Each ingredient’s nutrients are totals for its entered grams, not per 100 g. If any ingredient’s value is unknown, that nutrient stays unknown for the whole recipe and every serving.</Notice>
    {d.ingredients.map((i, index) => <fieldset className="panel stack" key={index}><legend>Ingredient {index + 1}</legend><div className="form-grid"><Field label="Ingredient name"><input required maxLength={200} value={i.name} onChange={e => ingredient(index, { name: e.target.value })} /></Field><Field label="Amount in the whole recipe (g)"><input required type="number" min="0" max="100000" step="any" value={i.grams} onChange={e => ingredient(index, { grams: Number(e.target.value) })} /></Field><NutrientFields value={i} onChange={n => ingredient(index, n)} /><Field label="Entered source"><input required maxLength={500} value={i.source} onChange={e => ingredient(index, { source: e.target.value })} /></Field></div><button type="button" className="btn ghost" disabled={d.ingredients.length === 1} onClick={() => setD({ ...d, ingredients: d.ingredients.filter((_, n) => n !== index) })}><X size={16} />Remove ingredient {index + 1}</button></fieldset>)}
    <button type="button" className="btn secondary" disabled={d.ingredients.length >= 100} onClick={() => setD({ ...d, ingredients: [...d.ingredients, blankIngredient()] })}><Plus size={16} />Add ingredient</button><Field label="Preparation / notes (optional)"><textarea rows={3} maxLength={10000} value={d.instructions} onChange={e => setD({ ...d, instructions: e.target.value })} /></Field><h3>Whole-recipe totals</h3><NutrientSummary value={totals(d.ingredients)} />{d.servings >= 1 && <><h3>Per serving</h3><NutrientSummary value={scale(totals(d.ingredients), 1 / d.servings)} /></>}{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} onClose={onClose} label="Save recipe" />
  </form></Dialog>;
}

function RecipePortion({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  const { create, busy } = useProduct();
  const d = dataOf<'recipes'>(entity);
  const action = useAction();
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState('Meal');
  const [at, setAt] = useState(istInput());
  const portion = scale(totals(d.ingredients), servings / d.servings);
  const grams = d.ingredients.reduce((sum, i) => sum + i.grams, 0) * servings / d.servings;
  const invalid = !Number.isFinite(grams) || grams > 100000 || nutrients.some(([key]) => portion[key] !== null && (!Number.isFinite(portion[key]) || portion[key]! > 100000));
  return <Dialog title={`Log a portion · ${d.name}`} onClose={onClose} busy={busy || action.pending}><form className="stack" onSubmit={async e => { e.preventDefault(); if (await action.run(async () => { const time = fromIST(at); if (Date.parse(time) > Date.now()) throw new Error('Choose a time that has already occurred.'); return create('meals', { ...portion, name: d.name, meal, at: time, grams, source: `User-entered recipe: ${d.name} · ${servings} of ${d.servings} servings` } satisfies MealData); })) onClose(); }}><Field label="Servings eaten"><input autoFocus required type="number" min="0.01" max="1000" step="any" value={servings} onChange={e => setServings(Number(e.target.value))} /></Field><Field label="Meal category"><input required maxLength={100} value={meal} onChange={e => setMeal(e.target.value)} /></Field><Field label="Recorded at · IST"><input type="datetime-local" required max={istInput()} value={at} onChange={e => setAt(e.target.value)} /></Field><p className="muted">{Number(grams.toFixed(2))} g from the entered ingredient weights. Nutrients = whole-recipe totals ÷ {d.servings} × {servings}. Cooking-related weight changes are not inferred.</p><NutrientSummary value={portion} />{invalid && <Notice error>This portion exceeds the supported recording range. Check servings and ingredient values.</Notice>}{action.error && <Notice error>{action.error}</Notice>}<FormActions busy={busy || action.pending} invalid={invalid} onClose={onClose} label="Log portion" /></form></Dialog>;
}