import {describe,it,expect} from 'vitest';
import {validateRuntime} from '../server/runtime';
const valid={NODE_ENV:'production',DATABASE_URL:'postgresql://test:test@db:5432/app',APP_ORIGIN:'https://care.example.org',COOKIE_SECURE:'true',SCHEMA_READY:'true'};
describe('production startup gates',()=>{
 it('allows explicit secure PostgreSQL configuration',()=>expect(validateRuntime(valid).production).toBe(true));
 it.each(['DATABASE_URL','APP_ORIGIN','COOKIE_SECURE','SCHEMA_READY'])('rejects missing %s',key=>{const env={...valid,[key]:''};expect(()=>validateRuntime(env)).toThrow();});
 it.each(['http://care.example.org','https://care.example.org/path','https://user:pass@care.example.org'])('rejects insecure or ambiguous origin %s',APP_ORIGIN=>expect(()=>validateRuntime({...valid,APP_ORIGIN})).toThrow());
 it('never accepts embedded storage as production',()=>expect(()=>validateRuntime({...valid,DATABASE_URL:'file:///tmp/db'})).toThrow());
 it('allows local development without production claims',()=>expect(validateRuntime({}).production).toBe(false));
 it.each(['0','NaN','70000'])('rejects invalid port %s',PORT=>expect(()=>validateRuntime({PORT})).toThrow());
});