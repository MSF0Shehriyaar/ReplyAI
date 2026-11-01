import React,{useState} from 'react';
import {View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar as ExpoStatusBar} from 'expo-status-bar';
import {useSession} from '../mobile/shared/session';
import {Button,Card,Copy,Field,Notice,Screen,Title,s,useAction} from '../mobile/shared/ui';
import AdminHome from './admin-home';
export default function App(){
  const session=useSession('private.controlroom.session.v1','/api/owner-mobile-auth');
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');const work=useAction();
  return <SafeAreaProvider><SafeAreaView style={s.screen}><ExpoStatusBar style="dark"/>{!session.foreground?<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Title>Nina Control Room</Title><Copy>Private owner workspace</Copy></View>:session.checking?<Screen><Title>Nina Control Room</Title><Copy>Checking your secure owner session…</Copy></Screen>:session.token?<AdminHome api={session.api} ownerName={session.identity?.user?.displayName||'Owner'} onSignOut={()=>void work.run(session.signOut,'Signed out.')}/>:<Screen><Title>Nina Control Room</Title><Copy>Private Instagram automation and WhatsApp business management.</Copy><Notice error message={session.error}/><Card><Field label="Owner username" required value={username} onChange={setUsername}/><Field label="Owner password" required secret value={password} onChange={setPassword}/><Notice message={work.message} error={work.error}/><Button busy={work.busy} disabled={!session.configured||!username||!password} onPress={()=>void work.run(async()=>{await session.signIn({action:'login',username:username.trim(),password});setPassword('');},'Owner workspace opened.')}>Open {username||'owner'}’s control room</Button><Copy muted>Access uses your saved server account. Owner registration is unavailable.</Copy></Card></Screen>}{session.token&&<View style={{padding:8}}><Notice message={work.message} error={work.error}/></View>}</SafeAreaView></SafeAreaProvider>;
}
