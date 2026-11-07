/** Production refuses to start until `npm run db:migrate` has recorded this version. */
export const requiredSchemaVersion = 3;

export function validateRuntime(env:NodeJS.ProcessEnv=process.env){
 const production=env.NODE_ENV==='production';
 const port=Number(env.PORT||3001);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535.');
 if(production){
  if(!env.DATABASE_URL)throw new Error('Production requires DATABASE_URL. Embedded development storage is not permitted.');
  let database:URL;try{database=new URL(env.DATABASE_URL);}catch{throw new Error('DATABASE_URL is invalid.');}
  if(!['postgres:','postgresql:'].includes(database.protocol))throw new Error('Production requires a PostgreSQL connection.');
  let origin:URL;try{origin=new URL(env.APP_ORIGIN||'');}catch{throw new Error('Production requires APP_ORIGIN.');}
  if(origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN||origin.username||origin.password)throw new Error('APP_ORIGIN must be an exact HTTPS origin without path or credentials.');
  if(env.COOKIE_SECURE!=='true')throw new Error('Production requires COOKIE_SECURE=true.');
  if(env.SCHEMA_READY!=='true')throw new Error('Run the schema migration with an administrative credential first, then set SCHEMA_READY=true.');
 }
 return {production,port,host:env.HOST||'127.0.0.1'};
}