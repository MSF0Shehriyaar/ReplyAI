import {createCipheriv,randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,rename,readdir,cp,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTursoAdapter} from '../whatsapp/lib/turso.ts';
import {ownerWhatsAppSettings} from '../whatsapp/lib/owner-workspace.ts';
import {inspectWhatsApp,resetWhatsApp} from './whatsapp-reset-core.mjs';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
process.loadEnvFile(resolve(repository,'web/.env'));
const database=createTursoAdapter(process.env.TURSO_DATABASE_URL,process.env.TURSO_AUTH_TOKEN);
const mode=process.argv[2]||'--inspect';
if(!['--inspect','--apply-owner-requested-reset'].includes(mode))throw new Error('Choose inspect or the explicit owner-requested reset.');
if(mode==='--inspect'){console.log(JSON.stringify(await inspectWhatsApp(database),null,2));}
else{
  const key=process.env.CREDENTIALS_KEY||'';if(!/^[a-fA-F0-9]{64}$/.test(key))throw new Error('An existing encryption key is required for the backup.');
  const instant=new Date().toISOString().replace(/[:.]/g,'-'),directory=resolve(repository,'outputs/private-backups/whatsapp-'+instant);
  if(!directory.startsWith(resolve(repository,'outputs/private-backups')+sep))throw new Error('Invalid backup target.');await mkdir(directory,{recursive:true});
  // QR credentials are already encrypted before being written to the backup.
  async function encryptFile(path,data,context){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from(context));const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);const payload=JSON.stringify({version:1,context,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});await writeFile(path,payload,{flag:'wx',mode:0o600});if(createHash('sha256').update(await readFile(path)).digest('hex')!==createHash('sha256').update(payload).digest('hex'))throw new Error('Backup verification failed.');return createHash('sha256').update(payload).digest('hex');}
  const deviceRoots=['web/whatsapp/.wa-auth','web/whatsapp/.wa-tenants'].map(path=>resolve(repository,path));
  const archivedRoots=[];
  for(const root of deviceRoots){if(!root.startsWith(resolve(repository,'web/whatsapp')+sep))throw new Error('Unsafe device directory.');let entries;try{entries=await readdir(root,{recursive:true,withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}const files=[];for(const entry of entries){if(entry.isSymbolicLink())throw new Error('Refusing to follow a device-storage symbolic link.');if(entry.isFile()){const source=resolve(entry.parentPath,entry.name);if(!source.startsWith(root+sep))throw new Error('Unsafe device file.');files.push({path:source.slice(root.length+1),data:(await readFile(source)).toString('base64')});}}await encryptFile(resolve(directory,root.endsWith('.wa-auth')?'device-auth.json.enc':'device-tenants.json.enc'),Buffer.from(JSON.stringify(files)),root.endsWith('.wa-auth')?'device-auth':'device-tenants');archivedRoots.push(root);}
  const row=await database.prepare('SELECT payload FROM workspace_state WHERE key=?').bind('settings').first();
  const profile=ownerWhatsAppSettings(row?JSON.parse(row.payload):{});
  const result=await resetWhatsApp(database,{ownerSettings:profile,backupSink:async snapshot=>{const path=resolve(directory,'database.json.enc');const sha256=await encryptFile(path,Buffer.from(JSON.stringify(snapshot)),'whatsapp-reset-database');return {written:true,path,sha256};}});
  // Scope and final paths were resolved and checked above. No other directory is removed.
  for(const root of archivedRoots)await rm(root,{recursive:true,force:true});
  await writeFile(resolve(directory,'receipt.json'),JSON.stringify({at:new Date().toISOString(),...result},null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({reset:true,deleted:result.deleted,usersRemaining:0,privateOwnerWorkspaces:1,automaticReplies:false,backupDirectory:directory},null,2));
}
