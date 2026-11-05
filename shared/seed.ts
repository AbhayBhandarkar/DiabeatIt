import type { State } from './domain';
export function seed(now = new Date()): State {
  const at = now.toISOString();
  return {
    profile: { name: 'Meena', age: 62, city: 'Pune', language: 'en' },
    medicines: [
      { id: 'met', name: 'Metformin', ingredient: 'Metformin', strength: '500 mg', instructions: 'Fictional plan: one tablet after breakfast', time: '08:30', active: true, source: 'Demo prescription A' },
      { id: 'ator', name: 'Atorvastatin', ingredient: 'Atorvastatin', strength: '10 mg', instructions: 'Fictional plan: one tablet at bedtime', time: '21:00', active: true, source: 'Demo prescription A' },
    ],
    glucose: [132, 148, 126, 141, 136, 154, 129].map((value, i) => ({ id: `g${i}`, value, unit: 'mg/dL', measuredAt: new Date(now.getTime() - (i * 24 + 2) * 3600000).toISOString(), context: 'Fasting', source: 'Fictional demo reading', author: 'Demo seed' })),
    intakes: [], meals: [], documents: [],
    reviews: [{ id: 'overlap', title: 'Two prescriptions. One ingredient to clarify.', description: 'Fictional prescription A lists metformin 500 mg. Fictional prescription B lists a metformin-containing combination. It is not clear whether B replaces A. Neither the combination nor a treatment change has been activated.', status: 'submitted', note: '', createdAt: at, author: 'Meena · patient' }],
    permissions: { active: true, glucose: true, medicines: true, meals: true, documents: false },
    plan: { version: 1, approvedAt: at, approvedBy: 'Fictional demonstration plan', acknowledged: true, note: 'Example only. Not a prescription for any real person. Clinical interaction screening is not connected.' },
    completedLessons: [], questions: ['Does the new prescription replace any part of my current list?'],
    audit: [{ id: 'created', at, actor: 'System', action: 'Isolated fictional demo created' }],
  };
}