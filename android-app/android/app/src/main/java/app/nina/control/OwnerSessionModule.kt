package app.nina.control

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.net.URL
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.security.KeyStore

class OwnerSessionModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
 private val prefs=context.getSharedPreferences("nina_owner",Context.MODE_PRIVATE)
 private val alias="nina_owner_aes_v1"
 private var unlocked=false
 private var unlockPromise:Promise?=null
 private val listener=object:BaseActivityEventListener(){override fun onActivityResult(activity:Activity,requestCode:Int,resultCode:Int,data:Intent?){if(requestCode==4401){unlocked=resultCode==Activity.RESULT_OK;unlockPromise?.resolve(unlocked);unlockPromise=null}}}
 init {context.addActivityEventListener(listener);context.addLifecycleEventListener(this)}
 override fun getName()="OwnerSession"
 override fun onHostResume() {}
 override fun onHostPause(){unlocked=false}
 override fun onHostDestroy(){unlocked=false;unlockPromise?.reject("CLOSED","App closed");unlockPromise=null}
 private fun key():SecretKey {val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};if(store.containsAlias(alias))return store.getKey(alias,null) as SecretKey;return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())}.generateKey()}
 private fun save(value:String){val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());prefs.edit().putString("session",Base64.encodeToString(cipher.iv,Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)).commit()}
 private fun session():JSONObject {val value=prefs.getString("session",null)?:throw Exception("Pair this phone first.");val parts=value.split(":");val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));val result=JSONObject(String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),Charsets.UTF_8));if(result.getLong("expiresAt")<=System.currentTimeMillis()){prefs.edit().clear().commit();throw Exception("Phone session expired. Pair again.")};return result}
 private fun remote(endpoint:String,payload:String,token:String?=null):JSONObject {val connection=URL("https://nina-instagram-webhook.mohammedkhasiminfo.chatgpt.site"+endpoint).openConnection() as javax.net.ssl.HttpsURLConnection;try{connection.requestMethod="POST";connection.connectTimeout=15000;connection.readTimeout=30000;connection.instanceFollowRedirects=false;connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json");if(token!=null)connection.setRequestProperty("x-nina-device",token);connection.outputStream.use{it.write(payload.toByteArray(Charsets.UTF_8))};val status=connection.responseCode;val stream=if(status in 200..299)connection.inputStream else connection.errorStream;val text=stream?.bufferedReader()?.use{it.readText()}?:"{}";val data=try{JSONObject(text)}catch(e:Exception){JSONObject().put("error","Server returned an unreadable response.")};return JSONObject().put("status",status).put("data",data)}finally{connection.disconnect()}}
 @ReactMethod fun hasSession(p:Promise){p.resolve(prefs.contains("session"))}
 @ReactMethod fun unlock(p:Promise){val activity=context.currentActivity;if(activity==null){p.reject("ACTIVITY","Open the app first.");return};if(unlockPromise!=null){p.reject("BUSY","Device confirmation already open.");return};val manager=context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager;if(!manager.isDeviceSecure){p.reject("LOCK_REQUIRED","Set a PIN, pattern or password in Android settings first.");return};unlockPromise=p;activity.runOnUiThread{if(Build.VERSION.SDK_INT>=30){val prompt=BiometricPrompt.Builder(activity).setTitle("Unlock Nina").setSubtitle("Confirm access to your private workspace").setAllowedAuthenticators(15 or 32768).build();val executor=java.util.concurrent.Executor{command->activity.runOnUiThread(command)};prompt.authenticate(CancellationSignal(),executor,object:BiometricPrompt.AuthenticationCallback(){override fun onAuthenticationSucceeded(result:BiometricPrompt.AuthenticationResult){unlocked=true;unlockPromise?.resolve(true);unlockPromise=null};override fun onAuthenticationError(code:Int,message:CharSequence){unlocked=false;unlockPromise?.resolve(false);unlockPromise=null}})}else{@Suppress("DEPRECATION") val intent=manager.createConfirmDeviceCredentialIntent("Unlock Nina","Confirm access to your private workspace");if(intent==null){unlockPromise?.resolve(false);unlockPromise=null}else activity.startActivityForResult(intent,4401)}}}
 @ReactMethod fun pair(code:String,label:String,p:Promise){if(!unlocked){p.reject("LOCKED","Unlock your device first.");return};Thread{try{val result=remote("/mobile/pair",JSONObject().put("code",code).put("label",label).toString());if(result.getInt("status")!=200)throw Exception(result.getJSONObject("data").optString("error","Pairing failed"));val data=result.getJSONObject("data");if(!Regex("^[a-f0-9]{64}$").matches(data.getString("deviceToken")))throw Exception("Invalid phone session.");save(data.toString());p.resolve(true)}catch(e:Exception){p.reject("PAIR",e.message?:"Pairing failed")}}.start()}
 @ReactMethod fun request(path:String,method:String,payload:String,p:Promise){if(!unlocked){p.reject("LOCKED","Unlock Nina first.");return};Thread{try{val data=session();val envelope=JSONObject().put("path",path).put("method",method).put("payload",JSONObject(payload));val result=remote("/mobile/request",envelope.toString(),data.getString("deviceToken"));if(result.getInt("status")==401){prefs.edit().clear().commit();unlocked=false};p.resolve(result.toString())}catch(e:Exception){p.reject("REQUEST",e.message?:"Connection failed")}}.start()}
 @ReactMethod fun lock(p:Promise){unlocked=false;p.resolve(true)}
 @ReactMethod fun clear(p:Promise){unlocked=false;prefs.edit().clear().commit();p.resolve(true)}
}
class OwnerSessionPackage:ReactPackage {
 override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(OwnerSessionModule(context))
 override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
