import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db';
it('retains records through a clean database close and reopen',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'diabeatit-restart-'));
  try {
    const first=await openDatabase(false,path.join(dir,'db'));
    await first.query('INSERT INTO demo_sessions(token_hash,state,expires_at) VALUES ($1,$2,$3)',['restart-test',JSON.stringify({marker:'retained'}),new Date(Date.now()+86400000).toISOString()]);
    await first.close();
    const second=await openDatabase(false,path.join(dir,'db'));
    const result=await second.query<{state:{marker:string}}>('SELECT state FROM demo_sessions WHERE token_hash=$1',['restart-test']);
    expect(result.rows[0].state.marker).toBe('retained');
    await second.close();
  } finally { await rm(dir,{recursive:true,force:true}); }
},120000);