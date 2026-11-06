import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { openDatabase, type Database } from '../server/db';
import type { Express } from 'express';
let db:Database;let app:Express;
beforeAll(async()=>{db=await openDatabase(true);app=createApp(db);});
beforeEach(()=>{app=createApp(db);});
afterAll(async()=>{await db.close();});
const hdr={'X-Diabeatit-Client':'web','Origin':'http://127.0.0.1:5173'};
async function demo(){const a=request.agent(app);await a.post('/api/demo').set(hdr).expect(201);return a;}
describe('persistent demo API',()=>{
  it('health check identifies demo, not clinical operation',async()=>{const r=await request(app).get('/api/health').set('X-Request-Id','trace-local-01').expect(200);expect(r.body.realPatientUse).toBe(false);expect(r.headers['x-request-id']).toBe('trace-local-01');const generated=await request(app).get('/api/health').expect(200);expect(generated.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);});
  it('requires a valid session',async()=>{await request(app).get('/api/state').expect(401);});
  it('rejects cross-origin mutations',async()=>{await request(app).post('/api/demo').set({...hdr,Origin:'https://attacker.invalid'}).expect(403);});
  it('requires custom client header',async()=>{await request(app).post('/api/demo').expect(403);});
  it('sets HttpOnly SameSite cookie',async()=>{const r=await request(app).post('/api/demo').set(hdr).expect(201);expect(r.headers['set-cookie'][0]).toContain('HttpOnly');expect(r.headers['set-cookie'][0]).toContain('SameSite=Strict');});
  it('persists mutations and isolates other demo sessions',async()=>{const a=await demo(),b=await demo();const s=(await a.get('/api/state')).body;await a.post('/api/actions').set(hdr).send({version:s.version,action:{type:'question.add',text:'My isolated question'}}).expect(200);expect((await a.get('/api/state')).body.state.questions).toContain('My isolated question');expect((await b.get('/api/state')).body.state.questions).not.toContain('My isolated question');});
  it('rejects stale writes without losing the newer record',async()=>{const a=await demo();const payload={version:1,action:{type:'question.add',text:'Only once'}};await a.post('/api/actions').set(hdr).send(payload).expect(200);await a.post('/api/actions').set(hdr).send(payload).expect(409);expect((await a.get('/api/state')).body.state.questions.filter((q:string)=>q==='Only once')).toHaveLength(1);});
  it('denies review resolution from patient role',async()=>{const a=await demo();await a.post('/api/actions').set(hdr).send({version:1,action:{type:'review.update',id:'overlap',status:'resolved',note:'No'}}).expect(403);});
  it('rejects mismatched document signatures',async()=>{const a=await demo();await a.post('/api/actions').set(hdr).send({version:1,action:{type:'document.add',name:'fake.pdf',mime:'application/pdf',data:Buffer.from('<script>bad</script>').toString('base64')}}).expect(400);});
  it('rejects unknown catalog items',async()=>{const a=await demo();await a.post('/api/actions').set(hdr).send({version:1,action:{type:'meal.add',foodId:'invented',portions:1,meal:'Lunch',at:new Date().toISOString()}}).expect(400);});
  it('supports patient export and prevents API caching',async()=>{const a=await demo();const r=await a.get('/api/export').expect(200);expect(r.headers['cache-control']).toBe('no-store');expect(r.body.mode).toContain('Fictional');});
  it('supports revocation and refuses switching to revoked companion',async()=>{const a=await demo();await a.post('/api/actions').set(hdr).send({version:1,action:{type:'permissions.update',active:false,glucose:false,medicines:false,meals:false,documents:false}}).expect(200);await a.post('/api/role').set(hdr).send({role:'companion'}).expect(403);});
  it('accepts and downloads a valid demo PDF without exposing data in state',async()=>{const a=await demo();await a.post('/api/actions').set(hdr).send({version:1,action:{type:'document.add',name:'fictional.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}}).expect(200);const s=(await a.get('/api/state')).body;expect(s.state.documents[0].data).toBe('');const id=s.state.documents[0].id;await a.get(`/api/documents/${id}`).expect(200);await a.post('/api/role').set(hdr).send({role:'companion'}).expect(200);await a.get(`/api/documents/${id}`).expect(404);await a.get('/api/export').expect(403);});
  it('deletes stored session and rejects further requests',async()=>{const a=await demo();await a.delete('/api/session').set(hdr).expect(200);await a.get('/api/state').expect(401);});
});