// Exercise real TypeScript modules without starting Next or reading deployment .env files.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from './whatsapp/node_modules/typescript/lib/typescript.js';
const root=dirname(fileURLToPath(import.meta.url));
registerHooks({
  resolve(specifier,context,next) {
    if(specifier.startsWith('@/')) {
      const app=context.parentURL?.includes('/instagram/')?'instagram':'whatsapp';
      const base=resolve(root,app,specifier.slice(2));
      for(const suffix of ['.ts','.tsx','.js','']) if(existsSync(base+suffix)) return {url:pathToFileURL(base+suffix).href,shortCircuit:true};
    }
    try {return next(specifier,context);} catch(error) {
      if(specifier.startsWith('.') && context.parentURL) {
        const base=new URL(specifier,context.parentURL);
        for(const suffix of ['.ts','.tsx','.js']) if(existsSync(fileURLToPath(base)+suffix)) return {url:base.href+suffix,shortCircuit:true};
      }
      if(specifier==='next/server' || specifier==='next/headers') return next(specifier+'.js',context);
      throw error;
    }
  },
  load(url,context,next) {
    if(url.startsWith('file:') && ['.ts','.tsx'].includes(extname(fileURLToPath(url)))) {
      return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText};
    }
    return next(url,context);
  }
});
