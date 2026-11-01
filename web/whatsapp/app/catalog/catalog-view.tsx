'use client';
import {useEffect,useState} from 'react';
import type {PublicCatalog} from '../../lib/public-catalog';
import Storefront,{type CheckoutRequest,type CheckoutResult} from './storefront';
export default function CatalogView({slug}:{slug?:string}){
  const [catalog,setCatalog]=useState<PublicCatalog|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();const business=new URLSearchParams(window.location.search).get('business');const query=slug?'?slug='+encodeURIComponent(slug):business?'?business='+encodeURIComponent(business):'';
    async function load(){try{const response=await fetch('/business/api/catalog'+query,{cache:'no-store',signal:controller.signal});const data=await response.json() as PublicCatalog&{error?:string};if(!response.ok)throw new Error(data.error||'This catalog is unavailable.');setCatalog(data);setError('');}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load the catalog.');}}
    void load();const timer=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>{controller.abort();clearInterval(timer);};
  },[slug,revision]);
  async function checkout(input:CheckoutRequest):Promise<CheckoutResult>{const response=await fetch('/business/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const result=await response.json() as CheckoutResult&{error?:string};if(!response.ok)throw new Error(result.error||'Could not save checkout.');return result;}
  if(!catalog)return <main className="commerce"><div className="commerce-empty" role={error?'alert':'status'}><h1 style={{fontSize:30}}>{error?'Catalog unavailable':'Opening the collection…'}</h1><p>{error}</p>{error&&<button onClick={()=>setRevision(value=>value+1)}>Retry</button>}</div></main>;
  return <Storefront catalog={catalog} submitCheckout={checkout} toolbar={error?<p className="commerce-error" role="alert">{error}</p>:undefined}/>;
}
