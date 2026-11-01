// Compatibility with the administrator account already used by Instagram.
// Set CLOUDFLARE_ACCOUNT_ID or save accountId:token to use another account.
const legacyAccountId='f1099441759c455eba9318b083112257';
export function cloudflareModel(model:string) {
  return model.includes('mistral-7b')?'@cf/mistralai/mistral-small-3.1-24b-instruct':model;
}
export function cloudflareConnection(key:string) {
  const separator=key.indexOf(':');
  const account=separator>=0?key.slice(0,separator):process.env.CLOUDFLARE_ACCOUNT_ID||legacyAccountId;
  const token=separator>=0?key.slice(separator+1):key;
  if(!/^[a-f0-9]{32}$/i.test(account)||!token)throw new Error('Cloudflare account configuration is incomplete.');
  return {account,token};
}
