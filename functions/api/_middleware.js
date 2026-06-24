import { MAX_STATE_BYTES, STATE_KEY, TENANT_ID, canWriteState, ensureSchema, getOrCreateUser, json, rawStateResponse, requireActorEmail, verifyRequiredSchema, writeAudit } from "./_shared.js";

const MARKER = "v102-durable-state-journal";
const CHUNK = 180000;
const THRESHOLD = 700000;
const enc = (v) => new TextEncoder().encode(String(v || "")).byteLength;
const safe = (v) => String(v ?? "").replace(/[\r\n]/g, " ");
const mid = () => `m${Date.now()}${Math.random().toString(36).slice(2, 9)}`;

function cors() {
  return new Response(null, { status: 204, headers: {
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type,Accept,X-CWS-Base-Version,X-CWS-State-Payload,X-CWS-State-Response,X-CWS-Client-Mutation-Id",
    "Access-Control-Expose-Headers":"X-CWS-OK,X-CWS-State-Exists,X-CWS-Version,X-CWS-Updated-At,X-CWS-Updated-By,X-CWS-User-Email,X-CWS-User-Role,X-CWS-User-Display-Name,X-CWS-Bytes,X-CWS-Chunked,X-CWS-Chunked-Manifest,X-CWS-Chunk-Index,X-CWS-Chunk-Count,X-CWS-Journal-Recovered,X-CWS-Mutation-Id,X-CWS-V102"
  }});
}

async function prepare(db) {
  let s = await verifyRequiredSchema(db);
  if (!s.ok) s = await ensureSchema(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_chunks (tenant_id TEXT NOT NULL,state_key TEXT NOT NULL,version INTEGER NOT NULL,chunk_index INTEGER NOT NULL,chunk_text TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (tenant_id,state_key,version,chunk_index))`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_journal (tenant_id TEXT NOT NULL,state_key TEXT NOT NULL,mutation_id TEXT NOT NULL,base_version INTEGER NOT NULL DEFAULT 0,target_version INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,project_count INTEGER NOT NULL DEFAULT 0,gantt_row_count INTEGER NOT NULL DEFAULT 0,actor_email TEXT,status TEXT NOT NULL DEFAULT 'received',error_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,checkpointed_at TEXT,PRIMARY KEY (tenant_id,state_key,mutation_id))`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state_journal_chunks (tenant_id TEXT NOT NULL,state_key TEXT NOT NULL,mutation_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,chunk_text TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (tenant_id,state_key,mutation_id,chunk_index))`).run();
  return s;
}

function split(t) { const a=[]; for(let i=0;i<t.length;i+=CHUNK) a.push(t.slice(i,i+CHUNK)); return a; }
function manifest(version, bytes, count, by) { return JSON.stringify({ __cwsChunkedState:true, marker:MARKER, version, bytes, chunkCount:count, updatedBy:by, tenantId:TENANT_ID, stateKey:STATE_KEY, createdAt:new Date().toISOString() }); }
function parseManifest(t) { try { const x=JSON.parse(t||""); return x?.__cwsChunkedState ? x : null; } catch { return null; } }
function rawWanted(c,u) { return c.request.headers.get("X-CWS-State-Response")==="raw-state" || u.searchParams.get("payload")==="raw-state" || u.searchParams.get("response")==="raw-state"; }
function chunkIndex(u) { const n=Number(u.searchParams.get("chunkIndex") ?? u.searchParams.get("chunk") ?? -1); return Number.isInteger(n) && n>=0 ? n : -1; }
function rawHeaders({exists,version,at,by,user,email,bytes,journal=false,mutationId=""}) { return {"X-CWS-OK":"true","X-CWS-State-Exists":exists?"1":"0","X-CWS-Version":String(Number(version||0)),"X-CWS-Updated-At":safe(at||""),"X-CWS-Updated-By":safe(by||""),"X-CWS-User-Email":safe(user?.email||email),"X-CWS-User-Role":safe(user?.role||"viewer"),"X-CWS-User-Display-Name":safe(user?.display_name||user?.email||email),"X-CWS-Bytes":String(Number(bytes||0)),"X-CWS-Chunked":"0","X-CWS-Chunk-Count":"0","X-CWS-Journal-Recovered":journal?"1":"0","X-CWS-Mutation-Id":safe(mutationId),"X-CWS-V102":MARKER}; }

async function readAppState(db,row) {
  const raw=row?.state_json||""; const m=parseManifest(raw); if(!m) return raw;
  const r=await db.prepare(`SELECT chunk_index,chunk_text FROM app_state_chunks WHERE tenant_id=? AND state_key=? AND version=? ORDER BY chunk_index`).bind(TENANT_ID,STATE_KEY,Number(m.version||row.version||0)).all();
  const rows=r.results||[]; if(rows.length!==Number(m.chunkCount||0)) throw Object.assign(new Error(`D1 chunks incompleet: ${rows.length}/${m.chunkCount}`),{status:500});
  return rows.map(x=>x.chunk_text||"").join("");
}
async function readJournal(db,id) {
  const r=await db.prepare(`SELECT chunk_index,chunk_text FROM app_state_journal_chunks WHERE tenant_id=? AND state_key=? AND mutation_id=? ORDER BY chunk_index`).bind(TENANT_ID,STATE_KEY,id).all();
  const rows=r.results||[]; if(!rows.length) throw Object.assign(new Error("Journal snapshot ontbreekt."),{status:500});
  return rows.map(x=>x.chunk_text||"").join("");
}
async function latestJournal(db) { return db.prepare(`SELECT * FROM app_state_journal WHERE tenant_id=? AND state_key=? AND status IN ('received','checkpoint_failed','checkpointed') ORDER BY target_version DESC, created_at DESC LIMIT 1`).bind(TENANT_ID,STATE_KEY).first(); }

function metrics(raw) {
  try { const s=JSON.parse(raw); const by=s?.projects?.byId&&typeof s.projects.byId==='object'?Object.keys(s.projects.byId).length:0; const order=Array.isArray(s?.projects?.order)?s.projects.order.length:0; const legacy=Array.isArray(s?.projects)?s.projects.length:0; const gp=s?.ganttV2?.byProject&&typeof s.ganttV2.byProject==='object'?s.ganttV2.byProject:{}; const gr=Object.values(gp).reduce((n,m)=>n+(Array.isArray(m?.rows)?m.rows.length:0),0); return {projectCount:Math.max(by,order,legacy),ganttRowCount:gr,bytes:enc(raw)}; } catch { return {projectCount:0,ganttRowCount:0,bytes:enc(raw),parseError:true}; }
}
function safeIncoming(raw) { const m=metrics(raw); if(m.parseError) throw Object.assign(new Error("Opslaan geblokkeerd: ongeldige JSON."),{status:400}); if(m.projectCount<=5 || (m.projectCount<10 && m.ganttRowCount<=20)) throw Object.assign(new Error(`Opslaan geblokkeerd: state lijkt leeg/demo (${m.projectCount} projecten/${m.ganttRowCount} rijen).`),{status:409,metrics:m}); return m; }
function schemaVersion(raw) { const m=String(raw||"").match(/"schemaVersion"\s*:\s*(\d+)/); return m?Number(m[1]):0; }
async function incoming(c) { const u=new URL(c.request.url), raw=await c.request.text(); if(enc(raw)>MAX_STATE_BYTES) throw Object.assign(new Error("State payload is te groot."),{status:413}); const rawMode=c.request.headers.get("X-CWS-State-Payload")==="raw-state"||u.searchParams.get("payload")==="raw-state"; if(rawMode){ if(!schemaVersion(raw)) throw Object.assign(new Error("schemaVersion ontbreekt."),{status:400}); return {raw,base:Number(c.request.headers.get("X-CWS-Base-Version")??u.searchParams.get("baseVersion")??0),rawMode:true}; } const b=JSON.parse(raw); if(!b?.state||!Number(b.state.schemaVersion)) throw Object.assign(new Error("Body moet een state-object bevatten."),{status:400}); return {raw:JSON.stringify(b.state),base:Number(b.baseVersion??0),rawMode:false}; }

async function writeCheckpoint(db, raw, version, email) {
  const bytes=enc(raw);
  if(bytes<=THRESHOLD){ await db.prepare(`INSERT INTO app_state (tenant_id,state_key,state_json,version,updated_at,updated_by) VALUES (?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(tenant_id,state_key) DO UPDATE SET state_json=excluded.state_json,version=excluded.version,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by`).bind(TENANT_ID,STATE_KEY,raw,version,email).run(); return {chunked:false,chunkCount:0,bytes}; }
  const chunks=split(raw), man=manifest(version,bytes,chunks.length,email);
  await db.prepare(`DELETE FROM app_state_chunks WHERE tenant_id=? AND state_key=? AND version=?`).bind(TENANT_ID,STATE_KEY,version).run();
  for(let i=0;i<chunks.length;i++) await db.prepare(`INSERT OR REPLACE INTO app_state_chunks (tenant_id,state_key,version,chunk_index,chunk_text) VALUES (?,?,?,?,?)`).bind(TENANT_ID,STATE_KEY,version,i,chunks[i]).run();
  await db.prepare(`INSERT INTO app_state (tenant_id,state_key,state_json,version,updated_at,updated_by) VALUES (?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(tenant_id,state_key) DO UPDATE SET state_json=excluded.state_json,version=excluded.version,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by`).bind(TENANT_ID,STATE_KEY,man,version,email).run();
  return {chunked:true,chunkCount:chunks.length,bytes};
}
async function writeJournal(db,{raw,base,target,email,id,m}) {
  const chunks=split(raw);
  await db.prepare(`DELETE FROM app_state_journal_chunks WHERE tenant_id=? AND state_key=? AND mutation_id=?`).bind(TENANT_ID,STATE_KEY,id).run();
  for(let i=0;i<chunks.length;i++) await db.prepare(`INSERT OR REPLACE INTO app_state_journal_chunks (tenant_id,state_key,mutation_id,chunk_index,chunk_text) VALUES (?,?,?,?,?)`).bind(TENANT_ID,STATE_KEY,id,i,chunks[i]).run();
  await db.prepare(`INSERT OR REPLACE INTO app_state_journal (tenant_id,state_key,mutation_id,base_version,target_version,bytes,project_count,gantt_row_count,actor_email,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'received',CURRENT_TIMESTAMP)`).bind(TENANT_ID,STATE_KEY,id,base,target,m.bytes,m.projectCount,m.ganttRowCount,email).run();
}
async function markJournal(db,id,status,error=null){ try{ await db.prepare(`UPDATE app_state_journal SET status=?,error_json=?,checkpointed_at=CASE WHEN ?='checkpointed' THEN CURRENT_TIMESTAMP ELSE checkpointed_at END WHERE tenant_id=? AND state_key=? AND mutation_id=?`).bind(status,error?JSON.stringify({message:String(error.message||error),marker:MARKER}):null,status,TENANT_ID,STATE_KEY,id).run(); }catch{} }
async function audit(db,email,action,meta){ try{ await writeAudit(db,email,action,meta,"app_state",STATE_KEY); }catch{} }

async function handleGet(c){ const db=c.env?.DB; if(!db) return json({ok:false,error:"D1-binding DB ontbreekt.",v102:MARKER},500); const email=requireActorEmail(c.request); if(!email) return json({ok:false,error:"Cloudflare Access-identiteit ontbreekt.",v102:MARKER},401); const u=new URL(c.request.url); try{ await prepare(db); const user=await getOrCreateUser(db,email); if(!user.active) return json({ok:false,error:"Gebruiker is inactief.",v102:MARKER},403); const row=await db.prepare(`SELECT state_json,version,updated_at,updated_by FROM app_state WHERE tenant_id=? AND state_key=?`).bind(TENANT_ID,STATE_KEY).first(); const lj=await latestJournal(db); if(lj?.mutation_id && Number(lj.target_version||0)>=Number(row?.version||0)){ const raw=await readJournal(db,lj.mutation_id); if(rawWanted(c,u)) return rawStateResponse(raw,200,rawHeaders({exists:true,version:lj.target_version,at:lj.checkpointed_at||lj.created_at,by:lj.actor_email,user,email,bytes:enc(raw),journal:true,mutationId:lj.mutation_id})); return json({ok:true,exists:true,version:Number(lj.target_version||0),stateJson:raw,stateEncoding:"journal-json-string",bytes:enc(raw),updatedAt:lj.checkpointed_at||lj.created_at,updatedBy:lj.actor_email,journalRecovered:true,mutationId:lj.mutation_id,user:{email:user.email,displayName:user.display_name,role:user.role,active:Boolean(user.active)},v102:{marker:MARKER,durableJournal:true}}); }
    const exists=Boolean(row?.state_json), man=parseManifest(row?.state_json||""); if(exists&&man&&chunkIndex(u)>=0){ const idx=chunkIndex(u); const ch=await db.prepare(`SELECT chunk_text FROM app_state_chunks WHERE tenant_id=? AND state_key=? AND version=? AND chunk_index=?`).bind(TENANT_ID,STATE_KEY,Number(man.version||row.version),idx).first(); return rawStateResponse(ch?.chunk_text||"",200,{"X-CWS-OK":"true","X-CWS-State-Exists":"1","X-CWS-Version":String(Number(man.version||row.version||0)),"X-CWS-Chunked":"1","X-CWS-Chunked-Manifest":"0","X-CWS-Chunk-Index":String(idx),"X-CWS-Chunk-Count":String(Number(man.chunkCount||0)),"X-CWS-V102":MARKER}); }
    const raw=exists?await readAppState(db,row):""; if(rawWanted(c,u)) return rawStateResponse(raw,200,rawHeaders({exists,version:row?.version||0,at:row?.updated_at,by:row?.updated_by,user,email,bytes:enc(raw)})); return json({ok:true,exists,version:Number(row?.version||0),stateJson:raw||null,stateEncoding:exists?"json-string":"empty",bytes:enc(raw),updatedAt:row?.updated_at||null,updatedBy:row?.updated_by||null,user:{email:user.email,displayName:user.display_name,role:user.role,active:Boolean(user.active)},v102:{marker:MARKER,durableJournal:true,journalRecovered:false}}); }catch(e){ return json({ok:false,error:e.message,v102:MARKER},e.status||500); } }

async function handlePut(c){ const db=c.env?.DB; if(!db) return json({ok:false,error:"D1-binding DB ontbreekt.",v102:MARKER},500); const email=requireActorEmail(c.request); if(!email) return json({ok:false,error:"Cloudflare Access-identiteit ontbreekt.",v102:MARKER},401); try{ await prepare(db); const user=await getOrCreateUser(db,email); if(!user.active) return json({ok:false,error:"Gebruiker is inactief.",v102:MARKER},403); if(!canWriteState(user)) return json({ok:false,error:"Viewer heeft alleen leesrechten.",v102:MARKER},403); const u=new URL(c.request.url), inc=await incoming(c), m=safeIncoming(inc.raw); const row=await db.prepare(`SELECT version FROM app_state WHERE tenant_id=? AND state_key=?`).bind(TENANT_ID,STATE_KEY).first(); const lj=await latestJournal(db); const target=Math.max(Number(row?.version||0),Number(lj?.target_version||0),Number(inc.base||0))+1; const id=c.request.headers.get("X-CWS-Client-Mutation-Id")||u.searchParams.get("mutationId")||mid(); await writeJournal(db,{raw:inc.raw,base:inc.base,target,email,id,m}); let checkpointed=false, result={chunked:false,chunkCount:0,bytes:m.bytes}, err=null; try{ result=await writeCheckpoint(db,inc.raw,target,email); checkpointed=true; await markJournal(db,id,"checkpointed"); }catch(e){ err=e; await markJournal(db,id,"checkpoint_failed",e); } await audit(db,email,"state_saved_durable_journal",{version:target,baseVersion:inc.base,mutationId:id,bytes:m.bytes,metrics:m,checkpointed,checkpointError:err?.message||null,v102:{marker:MARKER}}); return json({ok:true,version:target,updatedBy:email,bytes:m.bytes,mutationId:id,v82:{chunkedStateSave:true,chunked:result.chunked,chunkCount:result.chunkCount},v102:{marker:MARKER,durableJournal:true,checkpointed,checkpointError:err?.message||null}}); }catch(e){ return json({ok:false,error:e.message,guard:e.guard||null,metrics:e.metrics||null,v102:{marker:MARKER,durableJournal:true}},e.status||500); } }

async function handleJournal(c){ const db=c.env?.DB; if(!db) return json({ok:false,error:"D1-binding DB ontbreekt.",v102:MARKER},500); try{ await prepare(db); const lj=await latestJournal(db); return json({ok:true,latest:lj?{mutationId:lj.mutation_id,targetVersion:lj.target_version,status:lj.status,bytes:lj.bytes,projectCount:lj.project_count,ganttRowCount:lj.gantt_row_count,actorEmail:lj.actor_email,createdAt:lj.created_at,checkpointedAt:lj.checkpointed_at}:null,v102:{marker:MARKER}}); }catch(e){ return json({ok:false,error:e.message,v102:MARKER},e.status||500); } }

export async function onRequest(context){ const u=new URL(context.request.url); if(context.request.method==="OPTIONS") return cors(); if(u.pathname==="/api/state"){ if(context.request.method==="GET") return handleGet(context); if(context.request.method==="PUT") return handlePut(context); return json({ok:false,error:"Method not allowed.",v102:MARKER},405); } if(u.pathname==="/api/state-journal"&&context.request.method==="GET") return handleJournal(context); return context.next(); }
