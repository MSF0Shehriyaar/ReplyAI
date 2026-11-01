import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {apiClient,configuredOrigin} from './api';
export function useSession(key:string,authPath:string){
  const origin=useMemo(()=>{try{return {value:configuredOrigin(process.env.EXPO_PUBLIC_API_URL||'https://automation.ninakurainservices.in',__DEV__),error:''};}catch(e){return {value:'',error:(e as Error).message};}},[]);
  const [token,setToken]=useState<string|null>(null),[checking,setChecking]=useState(true),[identity,setIdentity]=useState<any>(null),[error,setError]=useState(origin.error),[foreground,setForeground]=useState(true);
  const sessionToken=useRef<string|null>(null);
  const forget=useCallback(async()=>{sessionToken.current=null;setToken(null);setIdentity(null);await SecureStore.deleteItemAsync(key);},[key]);
  const api=useMemo(()=>apiClient(origin.value,token,()=>{void forget();}),[origin.value,token,forget]);
  const validate=useCallback(async(stored:string)=>{const data=await apiClient(origin.value,stored)(authPath);if(!data.authenticated){await forget();throw new Error('Your session has ended. Please sign in again.');}setIdentity(data);sessionToken.current=stored;setToken(stored);},[origin.value,authPath,forget]);
  useEffect(()=>{let mounted=true;(async()=>{try{if(origin.error)return;const stored=await SecureStore.getItemAsync(key);if(stored&&mounted)await validate(stored);}catch(e){if(mounted)setError((e as Error).message);}finally{if(mounted)setChecking(false);}})();return()=>{mounted=false;};},[key,origin.error,validate]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{setForeground(state==='active');if(state==='active'&&sessionToken.current)void validate(sessionToken.current).catch(e=>setError(e.message));});return()=>sub.remove();},[validate]);
  async function signIn(body:unknown){setError('');const data=await apiClient(origin.value,null)(authPath,body);if(!data.token)throw new Error('The session could not be established.');await SecureStore.setItemAsync(key,data.token,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});try{await validate(data.token);}catch(e){await forget();throw e;}}
  async function signOut(){await api(authPath,undefined,'DELETE');await forget();}
  return {api,token,identity,checking,error,foreground,signIn,signOut,forget,configured:!!origin.value};
}
