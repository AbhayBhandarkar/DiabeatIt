import pg from 'pg';
import { requiredSchemaVersion } from './runtime';
import { initializeV2 } from './v2/storage';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL to the intended PostgreSQL database before migrating.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try{
 await client.query('SELECT pg_advisory_lock(87324011)');
 await client.query('BEGIN');
 await initializeV2({query:async<T>(sql:string,params?:unknown[])=>({rows:(await client.query(sql,params)).rows as T[]}),close:async()=>{}});
 await client.query('CREATE TABLE IF NOT EXISTS app_schema_versions(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 const versions = Array.from({ length: requiredSchemaVersion }, (_, index) => index + 1);
 await client.query(`INSERT INTO app_schema_versions(version) VALUES ${versions.map((_, index) => `($${index + 1})`).join(',')} ON CONFLICT DO NOTHING`, versions);
 await client.query('COMMIT');
 console.log(`Schema version ${requiredSchemaVersion} applied. No patient records seeded.`);
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.query('SELECT pg_advisory_unlock(87324011)');client.release();await pool.end();}