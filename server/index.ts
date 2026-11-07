import { openDatabase } from './db';
import { createApp } from './app';
import { createV2Router } from './v2';
import { requiredSchemaVersion, validateRuntime } from './runtime';
const runtime = validateRuntime();
const db = await openDatabase();
if(runtime.production){
 const schema=await db.query<{version:number}>('SELECT version FROM app_schema_versions WHERE version=$1',[requiredSchemaVersion]);
 if(!schema.rows.length)throw new Error(`Required database schema version ${requiredSchemaVersion} is absent. Run npm run db:migrate before starting.`);
}
const router = await createV2Router(db, { initializeSchema: !runtime.production });
const server = createApp(db, router).listen(runtime.port, runtime.host, () => console.log(`DiabeatIT listening on port ${runtime.port} · ${runtime.production ? 'production configuration' : 'development'}`));
let stopping=false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
 if(stopping)return;stopping=true;
 const timer=setTimeout(()=>{console.error('Shutdown deadline exceeded. Database recovery may be required.');process.exit(1);},15000);timer.unref();
 server.close(()=>{void db.close().then(()=>{clearTimeout(timer);process.exit(0);}).catch(()=>process.exit(1));});
 server.closeIdleConnections();
});