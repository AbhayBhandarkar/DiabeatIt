// Creates a synthetic showcase patient (and a family companion) through the public API.
// Usage: node scripts/seed-showcase.mjs [baseUrl]   e.g. node scripts/seed-showcase.mjs https://diabeatit.onrender.com
// All people and values are fictional. Re-running creates nothing if the account already exists.
const base = (process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/, '');
const patient = { name: 'Sunita Sharma', email: process.env.SHOWCASE_EMAIL || 'sunita.sharma@example.com', password: process.env.SHOWCASE_PASSWORD || 'Showcase-Sunita-2026!' };
const carer = { name: 'Priya Sharma', email: process.env.CARER_EMAIL || 'priya.sharma@example.com', password: process.env.CARER_PASSWORD || 'Showcase-Priya-2026!' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client() {
  let cookie = '';
  return async function api(path, method = 'GET', body) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${base}/api/v2${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Diabeatit-Client': 'web', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      if (res.status === 429) { await sleep(15000); continue; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${data.error ?? ''}`), { status: res.status });
      await sleep(350);
      return data;
    }
    throw new Error(`${method} ${path} rate limited`);
  };
}
const ist = (offsetDays, time = '08:00') => { const d = new Date(Date.now() + 330 * 60000 + offsetDays * 86400000); return `${d.toISOString().slice(0, 10)}T${time}:00+05:30`; };
const day = offsetDays => ist(offsetDays).slice(0, 10);

async function account(api, who) {
  try { const r = await api('/auth/register', 'POST', { ...who, consent: true }); return { me: r, created: true }; }
  catch (e) { if (e.status !== 409) throw e; return { me: await api('/auth/login', 'POST', { email: who.email, password: who.password }), created: false }; }
}

const P = client(), C = client();
const { me, created } = await account(P, patient);
const space = `/spaces/${me.spaceId}`;
const existing = await P(space);
if (!created && existing.entities.medicines.length) { console.log(`Showcase account already populated: ${patient.email}`); process.exit(0); }
const add = (kind, data) => P(`${space}/entities`, 'POST', { kind, data });
const everyday = [0, 1, 2, 3, 4, 5, 6];
const start = day(-150);

const meds = {};
for (const [key, m] of Object.entries({
  metformin: { name: 'Glycomet SR 500', ingredient: 'Metformin', strength: '500 mg', form: 'Tablet', route: 'Oral', instructions: 'After breakfast and after dinner', times: ['08:30', '20:30'], days: everyday, startDate: start, status: 'active', source: 'Prescription · Dr. Anil Mehta · Diabetologist' },
  glimepiride: { name: 'Amaryl 1', ingredient: 'Glimepiride', strength: '1 mg', form: 'Tablet', route: 'Oral', instructions: 'Before breakfast', times: ['08:00'], days: everyday, startDate: day(-62), status: 'active', source: 'Prescription · Dr. Anil Mehta · Diabetologist' },
  telmisartan: { name: 'Telma 40', ingredient: 'Telmisartan', strength: '40 mg', form: 'Tablet', route: 'Oral', instructions: 'Morning', times: ['08:00'], days: everyday, startDate: start, status: 'active', source: 'Prescription · Dr. Kavita Iyer · Cardiologist' },
  atorvastatin: { name: 'Atorva 10', ingredient: 'Atorvastatin', strength: '10 mg', form: 'Tablet', route: 'Oral', instructions: 'At night', times: ['21:30'], days: everyday, startDate: day(-40), status: 'active', source: 'Prescription · Dr. Kavita Iyer · Cardiologist' },
  dolo: { name: 'Dolo 650', ingredient: 'Paracetamol', strength: '650 mg', form: 'Tablet', route: 'Oral', instructions: 'When needed for knee pain, as advised by GP', times: [], days: everyday, startDate: day(-10), status: 'active', source: 'Prescription · Dr. Rao · General physician' },
  coldMix: { name: 'Cold & flu tablet (combination)', ingredient: 'Paracetamol; Phenylephrine; Chlorpheniramine', strength: '325 mg / 5 mg / 2 mg', form: 'Tablet', route: 'Oral', instructions: 'Bought at pharmacy for a cold', times: ['14:00'], days: everyday, startDate: day(-3), status: 'active', source: 'Pharmacy purchase, no prescription' },
})) meds[key] = (await add('medicines', m)).id;
console.log('medicines added');

await add('appointments', { date: day(-150), clinician: 'Dr. Anil Mehta', specialty: 'Diabetologist', facility: 'Sunrise Diabetes Clinic, Pune', reason: 'First consultation after high sugar at health camp', notes: 'Advised walking 30 minutes daily and less rice at dinner.', changes: 'Started Metformin 500 mg twice daily', followUp: day(-90) });
await add('appointments', { date: day(-120), clinician: 'Dr. Kavita Iyer', specialty: 'Cardiologist', facility: 'City Heart Centre', reason: 'Blood pressure check', notes: 'ECG normal according to doctor.', changes: 'Continue Telma 40 every morning' });
await add('appointments', { date: day(-62), clinician: 'Dr. Anil Mehta', specialty: 'Diabetologist', facility: 'Sunrise Diabetes Clinic, Pune', reason: 'Three-month review', notes: 'HbA1c still above my target. Discussed diet.', changes: 'Added Amaryl 1 mg before breakfast', followUp: day(28) });
await add('appointments', { date: day(-40), clinician: 'Dr. Kavita Iyer', specialty: 'Cardiologist', facility: 'City Heart Centre', reason: 'Cholesterol report review', notes: '', changes: 'Started Atorva 10 at night' });
await add('appointments', { date: day(-10), clinician: 'Dr. S. Rao', specialty: 'General physician', facility: 'Neighbourhood clinic', reason: 'Knee pain', notes: 'Asked to avoid painkillers other than paracetamol.', changes: 'Dolo 650 when needed' });
await add('appointments', { date: day(28), clinician: 'Dr. Anil Mehta', specialty: 'Diabetologist', facility: 'Sunrise Diabetes Clinic, Pune', reason: 'Follow-up with new HbA1c', notes: '', changes: '' });
for (const [name, value, unit, offset] of [['HbA1c', 8.4, '%', -152], ['HbA1c', 7.9, '%', -64], ['HbA1c', 7.3, '%', -4], ['Fasting glucose', 168, 'mg/dL', -152], ['Fasting glucose', 138, 'mg/dL', -4], ['LDL cholesterol', 142, 'mg/dL', -45], ['Creatinine', 0.9, 'mg/dL', -64], ['Blood pressure (systolic)', 138, 'mmHg', -10], ['Weight', 71.5, 'kg', -10]])
  await add('labs', { name, value, unit, takenOn: day(offset), notes: '' });
console.log('visits and labs added');

const contexts = [['Fasting', '07:15', 132], ['After meal', '14:30', 186], ['Before meal', '19:45', 141], ['Bedtime', '22:30', 152]];
for (let i = 0; i < 36; i++) {
  const offset = -Math.round((35 - i) * 2.4) - 1, [context, time, baseValue] = contexts[i % contexts.length];
  const drift = Math.round((35 - i) * 0.9), wobble = [6, -9, 12, -4, 3, -11, 8][i % 7];
  await add('glucose', { value: baseValue + drift + wobble, unit: 'mg/dL', measuredAt: new Date(ist(offset, time)).toISOString(), context });
}
console.log('glucose added');
for (let offset = -6; offset <= 0; offset++) {
  for (const [key, time] of [['metformin', '08:30'], ['metformin', '20:30'], ['telmisartan', '08:00'], ['glimepiride', '08:00']]) {
    if (offset === 0 && time === '20:30') continue;
    const status = offset === -3 && time === '20:30' ? 'not-taken' : offset === -5 && key === 'telmisartan' ? 'unsure' : 'taken';
    await add('intakes', { medicineId: meds[key], date: day(offset), scheduledTime: time, status, reason: status === 'not-taken' ? 'Fell asleep early after a wedding function' : status === 'unsure' ? 'Could not remember if I took it before the walk' : '' });
  }
}
console.log('intakes added');
await add('symptoms', { text: 'Felt shaky and sweaty around 11 am before lunch; better after eating a banana.', at: new Date(ist(-8, '11:10')).toISOString() });
await add('symptoms', { text: 'Tingling in both feet at night, on and off for two weeks.', at: new Date(ist(-14, '22:00')).toISOString() });
await add('questions', { text: 'Is the shaky feeling before lunch related to the new Amaryl tablet?' });
await add('questions', { text: 'Can I take the cold tablet together with Dolo 650?' });
await add('questions', { text: 'Should I get my feet and eyes checked this year?' });
for (const [name, meal, grams, carbs, fiber, protein, kcal, offset, time] of [['Moong dal chilla', 'Breakfast', 150, 24, 5, 12, 210, -1, '08:45'], ['Rice, dal and bhindi', 'Lunch', 350, 62, 9, 14, 420, -1, '13:30'], ['Roti with paneer bhurji', 'Dinner', 280, 38, 6, 22, 390, -1, '20:15'], ['Vegetable oats upma', 'Breakfast', 180, 30, 6, 8, 230, 0, '08:40']])
  await add('meals', { name, meal, at: new Date(Math.min(Date.parse(ist(offset, time)), Date.now() - 300000)).toISOString(), grams, carbs, fiber, protein, kcal, source: 'Entered by me from the recipe card' });
console.log('symptoms, questions and meals added');

const invite = await P(`${space}/invitations`, 'POST', { label: 'Priya (daughter)', scopes: ['medicines:read', 'intakes:read', 'intakes:write', 'glucose:read', 'appointments:read', 'labs:read', 'questions:read', 'questions:write'] });
await account(C, carer);
await C('/invitations/accept', 'POST', { token: invite.token });
console.log(`Done. Patient: ${patient.email} / ${patient.password} · Companion: ${carer.email} / ${carer.password}`);
