import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {requireWorkspaceRequest,AppError} from './server';
export async function requireOwnerPage(returnTo:string) {
  try {await requireWorkspaceRequest();}
  catch(error){if(error instanceof AppError&&error.status===401)redirect('/login?return_to='+encodeURIComponent(returnTo));throw error;}
  const cookie=(await headers()).get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('nina_owner_session='));
  try{return {name:JSON.parse(atob(decodeURIComponent(cookie!.slice('nina_owner_session='.length)).split('.')[0])).user as string};}
  catch{return {name:'Owner'};}
}
