import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('catalog slug pattern compiles in browser Unicode sets mode and validates the complete value',()=>{
  const source=readFileSync(new URL('./whatsapp/app/catalog-publication.tsx',import.meta.url),'utf8');
  const pattern=source.match(/pattern="([^"]+)"/)[1];
  const expression=new RegExp('^(?:'+pattern+')$','v');
  for(const value of ['abc','titan-watches','shop-2026','a'.repeat(64)])assert.equal(expression.test(value),true,value);
  for(const value of ['ab','-shop','shop-','Bad-Slug','shop/path','shop space','a'.repeat(65)])assert.equal(expression.test(value),false,value);
});
