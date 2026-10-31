import pg from 'pg';
import { readFileSync } from 'node:fs';
const url=process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if(!url) throw new Error('Set DATABASE_URL_UNPOOLED or DATABASE_URL before migrating.');
const client=new pg.Client({connectionString:url});
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(716284103)');
  await client.query(readFileSync(new URL('./postgres-schema.sql',import.meta.url),'utf8'));
  const tables=['communities','profiles','posts','comments','votes','comment_votes','saves','memberships','notifications','sessions','recovery_codes','rate_limits','reports','moderation_log'];
  const source=process.argv.find(a=>a.startsWith('--import-sqlite='))?.split('=').slice(1).join('=');
  let data;
  if(source){
    // Import is intentionally restricted to an empty target, never an upsert.
    for(const table of tables){if((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)throw new Error('Import requires an empty destination. Existing data was not changed.');}
    const {DatabaseSync}=await import('node:sqlite');const local=new DatabaseSync(source,{readOnly:true});
    data=Object.fromEntries(tables.map(t=>[t,local.prepare(`SELECT * FROM ${t} ORDER BY ${t==='comments'?'id':'1'}`).all()]));local.close();
  }else if(!(await client.query('SELECT 1 FROM communities LIMIT 1')).rowCount){
    data=JSON.parse(readFileSync(new URL('./seed-data.json',import.meta.url),'utf8'));
  }
  if(data){
    for(const table of tables)for(const original of data[table]||[]){
      const row={...original};if(table==='posts')row.accepted_comment_id=null;
      const columns=Object.keys(row);const values=Object.values(row);
      await client.query(`INSERT INTO ${table} (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${values.map((_,i)=>`$${i+1}`).join(',')})`,values);
    }
    for(const post of data.posts||[])if(post.accepted_comment_id)await client.query('UPDATE posts SET accepted_comment_id=$1 WHERE id=$2',[post.accepted_comment_id,post.id]);
    for(const table of ['posts','comments','notifications','reports','moderation_log'])await client.query(`SELECT setval(pg_get_serial_sequence('${table}','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM ${table}`);
  }
  await client.query('COMMIT');
  console.log('Postgres schema ready. Existing data preserved.');
} catch(error) {await client.query('ROLLBACK');console.error('Migration rolled back:',error.code||error.name);process.exitCode=1;}
finally {await client.end();}
