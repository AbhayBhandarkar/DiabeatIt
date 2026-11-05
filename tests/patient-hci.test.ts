import {describe,it,expect} from 'vitest';
import {referenceName,overlappingIngredients} from '../shared/medicineNames';
describe('medicine identity for India-facing search',()=>{
 it('maps paracetamol with a source and keeps formulation separate',()=>{const n=referenceName(' Paracetamol ');expect(n.searched).toBe('acetaminophen');expect(n.sourceUrl).toContain('medlineplus.gov');expect(n.explanation).toContain('formulation');});
 it('does not guess brand names or salt substitutions',()=>{expect(referenceName('Dolo 650').searched).toBe('Dolo 650');expect(referenceName('metformin').searched).toBe('metformin');});
 it('detects synonymous ingredients across entered products',()=>expect(overlappingIngredients([{id:'1',name:'A',ingredient:'Paracetamol'},{id:'2',name:'B',ingredient:'acetaminophen; caffeine'}])).toEqual([{ingredient:'acetaminophen',products:[{id:'1',name:'A'},{id:'2',name:'B'}]}]));
 it('unknown identities are not a shared ingredient',()=>expect(overlappingIngredients([{id:'1',name:'A',ingredient:'Unknown'},{id:'2',name:'B',ingredient:'Unknown'}])).toEqual([]));
});