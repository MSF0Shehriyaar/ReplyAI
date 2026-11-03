import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Both suites own their isolated databases and mock message transports.
const suites=[
  ['../',['--import','./test-loader.mjs','--test','*.test.mjs']],
  ['../instagram/',['--experimental-vm-modules','--test','--test-timeout=15000','tests/*.test.mjs']],
];
for(const [directory,args] of suites){
  const result=spawnSync(process.execPath,args,{cwd:fileURLToPath(new URL(directory,import.meta.url)),stdio:'inherit'});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status||1);
}
