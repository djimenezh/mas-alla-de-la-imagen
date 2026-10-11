(function(){
let c,u,ready=false,timer,cloudBaseline=null,conflict=false,saving=null,pending=false;
const q=id=>document.getElementById(id);
function st(t){const x=q('cloudStatus');if(x)x.textContent=t;const auth=q('authCloudStatus');if(auth)auth.textContent=t}
function localHasData(x){return !!(x&&((x.cards&&x.cards.length)||(x.months&&Object.values(x.months).some(m=>(m.tx&&m.tx.length)||(m.goals&&m.goals.length)||(m.cards&&m.cards.length)||(m.checks&&m.checks.some(Boolean))||Object.values(m.budgets||{}).some(v=>Number(v)>0)))))}
function stamp(x){return Date.parse(x?.updatedAt||'')||0}
function txCount(x){return Object.values(x?.months||{}).reduce((n,m)=>n+((m?.tx||[]).length),0)}
function backup(x,label){if(!x||!localHasData(x))return;try{
 const key='masAllaBackup:'+label+':'+Date.now();localStorage.setItem(key,JSON.stringify(x));
 const keys=Object.keys(localStorage).filter(k=>k.startsWith('masAllaBackup:'+label+':')).sort();
 // Conserva las últimas 8 copias por tipo, sin tocar la copia activa.
 keys.slice(0,-8).forEach(k=>localStorage.removeItem(k));
}catch(e){console.warn('No pude crear respaldo local',e)}}
function comparable(x){if(!x)return null;const {updatedAt,...rest}=x;return JSON.stringify(rest)}
function sameData(a,b){return comparable(a)===comparable(b)}
const ownerKey='masAllaFinanzasOwner';
function protectAccount(user){const previous=localStorage.getItem(ownerKey);if(previous&&previous!==user.id){const local=JSON.parse(localStorage.getItem('masAllaFinanzas')||'null');backup(local,'other-account-'+previous);st('⚠️ Este dispositivo tiene información de otra cuenta. No se mezclaron datos. Contacta a soporte antes de continuar.');return false}return true}
async function upload(){
 if(!u)return false;
 if(saving){pending=true;await saving;return pending?upload():!conflict;}
 saving=performUpload();
 try{return await saving}finally{saving=null;if(pending){pending=false;setTimeout(()=>upload(),0)}}
}
async function performUpload(){
 if(conflict){st('⚠️ Hay datos diferentes en este teléfono y en la nube. No se sobrescribió nada. Contacta a soporte antes de cambiar de dispositivo.');return false;}
 // BLINDAJE ANTI-PERDIDA: antes de escribir, leer la nube y nunca permitir
 // que una copia con menos movimientos reemplace silenciosamente una más completa.
 const {data:remote,error:readError}=await c.from('finance_profiles').select('data,updated_at').eq('user_id',u.id).maybeSingle();
 if(readError){console.error(readError);st('Error al verificar respaldo: '+readError.message);return false}
 const cloud=remote?.data||null;
 const localTx=txCount(store),cloudTx=txCount(cloud);
 // Un dispositivo vacio nunca puede borrar un historial existente en la nube.
 if(cloudHasDataSafe(cloud)&&!localHasData(store)){
   backup(cloud,'protected-cloud');
   store=cloud;
   localStorage.setItem('masAllaFinanzas',JSON.stringify(store));
   st('☁️ Historial recuperado y protegido');
   cloudBaseline=cloud;return true;
 }
 if(cloudHasDataSafe(cloud)&&cloudTx>localTx){
   backup(store,'blocked-local');backup(cloud,'protected-cloud');
   console.error('Sincronización bloqueada para evitar pérdida de datos',{localTx,cloudTx});
   st('⚠️ Protección activa: no se sobrescribió tu historial');
   conflict=true;return false;
 }
 if(!sameData(cloud,cloudBaseline)){backup(store,'conflict-local');backup(cloud,'conflict-cloud');conflict=true;st('⚠️ Otro dispositivo cambió los datos. No se sobrescribió nada. Contacta a soporte.');return false}
 // Conserva una copia local de ambos estados antes de cada escritura.
 backup(store,'before-upload');
 if(cloudHasDataSafe(cloud))backup(cloud,'cloud-before-upload');
 const {error}=await c.from('finance_profiles').upsert({user_id:u.id,data:store,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error){console.error(error);st('Error al sincronizar: '+error.message);return false}
 cloudBaseline=JSON.parse(JSON.stringify(store));st('☁️ Sincronizado');return true;
}
function cloudHasDataSafe(x){return localHasData(x)}
window.addEventListener('finance-data-changed',()=>{if(u){st('☁️ Guardando…');clearTimeout(timer);timer=setTimeout(upload,150)}});
window.addEventListener('online',()=>{if(u&&!conflict)upload()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&u&&!conflict){clearTimeout(timer);upload()}});
async function sync(){
 st('Sincronizando…');
 if(!protectAccount(u))return false;
 const local=JSON.parse(localStorage.getItem('masAllaFinanzas')||'null');
 const {data,error}=await c.from('finance_profiles').select('data,updated_at').eq('user_id',u.id).maybeSingle();
 if(error){st('Error: '+error.message);return false}
 const cloud=data?.data||null;
 cloudBaseline=cloud?JSON.parse(JSON.stringify(cloud)):null;conflict=false;
 const localHas=localHasData(local);
 const cloudHas=localHasData(cloud);
 if(!localStorage.getItem(ownerKey)&&localHas&&cloudHas&&!sameData(local,cloud)){
   backup(local,'unassigned-local');backup(cloud,'unassigned-cloud');conflict=true;
   st('⚠️ Hay información local sin cuenta identificada y datos en la nube. Guardamos copias y no sobrescribimos nada.');return false;
 }
 const localTime=stamp(local),cloudTime=Math.max(stamp(cloud),Date.parse(data?.updated_at||'')||0);
 if(localHas&&cloudHas){
   backup(local,'local');backup(cloud,'cloud');
   if(!sameData(local,cloud)){
     conflict=true;store=local;
     st('⚠️ Detectamos datos diferentes en el teléfono y la nube. Conservamos ambos respaldos y bloqueamos la sobrescritura. Contacta a soporte.');
   }else{store=cloud;}
 }else if(localHas){
   backup(local,'local');store=local;
 }else if(cloudHas){
   backup(cloud,'cloud');store=cloud;
 }else{
   store=local||cloud||store;
 }
 if(store===cloud&&cloudTime)store.updatedAt=new Date(cloudTime).toISOString();
 if(!store.months)store.months={};if(!store.cards)store.cards=[];if(!store.active)store.active='2026-10';
 if(!store.months[store.active])store.months[store.active]=defaultMonth();
 Object.values(store.months).forEach(m=>{(m.cards||[]).forEach(card=>{if(!store.cards.some(g=>g.id===card.id))store.cards.push(card)})});
 s=store.months[store.active];
 localStorage.setItem('masAllaFinanzas',JSON.stringify(store));
 if(q('monthSelect'))q('monthSelect').value=store.active;updateMonthlyMessage();updateCardSelect();render();
 ready=true;if(!conflict){const saved=await upload();if(saved){localStorage.setItem(ownerKey,u.id);st('✓ Cuenta conectada · ☁️ Sincronizado');}}return !conflict;
}
async function connected(user){
 u=user;q('loginBox').style.display='none';q('accountBox').style.display='block';q('accountEmail').textContent=user.email||'';
 const n=user.user_metadata?.display_name||localStorage.getItem('masAllaNombre');if(n)document.querySelector('.hello').textContent='Hola '+n+' ♡';
 await sync();q('authGate').style.display='none';
}
async function login(){
 const email=q('loginEmail').value.trim(),password=q('loginPassword').value;
 if(!email||!password)return st('Escribe tu correo y contraseña 💗');
 st('Entrando…');q('loginButton').disabled=true;
 let data,error;
 try{({data,error}=await Promise.race([c.auth.signInWithPassword({email,password}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('La conexión tardó demasiado.')),15000))]));}
 catch(e){st('No se pudo ingresar: '+(e.message||'Error de conexión'));return}
 finally{q('loginButton').disabled=false;}
 if(error){st(error.message==='Invalid login credentials'?'Correo o contraseña incorrectos. Si es tu primera vez, toca CREAR MI CUENTA.':'Error: '+error.message);return}
 if(data?.user)await connected(data.user);
}
async function signup(){
 const n=q('loginName').value.trim(),email=q('loginEmail').value.trim(),password=q('loginPassword').value;
 if(!n||!email||password.length<6)return st('Escribe tu nombre, correo y una contraseña de al menos 6 caracteres 💗');
 localStorage.setItem('masAllaNombre',n);st('Creando tu cuenta…');q('signupButton').disabled=true;
 let data,error;
 try{({data,error}=await Promise.race([c.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{display_name:n}}}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('La conexión tardó demasiado. Intenta nuevamente.')),15000))]));}
 catch(e){st('No se pudo crear la cuenta: '+(e.message||'Error de conexión'));return}
 finally{q('signupButton').disabled=false;}
 if(error){st('Error: '+error.message);return}
 if(data?.session&&data?.user){await connected(data.user);return}
 st('Cuenta creada 💗 Revisa tu correo para confirmar tu email una sola vez. Después entrarás con tu contraseña.');
}
async function forgot(){
 const email=q('loginEmail').value.trim();if(!email)return st('Escribe primero tu correo 💗');
 q('forgotButton').disabled=true;st('Enviando enlace para cambiar tu contraseña…');
 let error;
 try{({error}=await Promise.race([c.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('La conexión tardó demasiado.')),15000))]));}
 catch(e){st('No se pudo enviar el correo: '+(e.message||'Error de conexión'));return}
 finally{q('forgotButton').disabled=false;}
 if(error){st('Error: '+error.message);return}
 st('Te enviamos un correo 💌 Ábrelo para crear una nueva contraseña.');
}
async function saveNewPassword(){
 const password=q('newPassword').value;if(password.length<6)return st('La contraseña debe tener al menos 6 caracteres 💗');
 q('savePasswordButton').disabled=true;
 const {error}=await c.auth.updateUser({password});
 q('savePasswordButton').disabled=false;
 if(error){st('Error: '+error.message);return}
 history.replaceState({},document.title,location.pathname);q('resetBox').style.display='none';st('Contraseña actualizada ✓ Entrando…');
 const {data:{user}}=await c.auth.getUser();if(user)await connected(user);
}
async function init(){
 try{
  if(!window.supabase||typeof SUPABASE_URL==='undefined'||typeof SUPABASE_KEY==='undefined'){st('⚠️ Sin conexión con respaldo');return}
  c=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  q('loginButton').onclick=login;q('signupButton').onclick=signup;q('forgotButton').onclick=forgot;q('savePasswordButton').onclick=saveNewPassword;
 const logout=async()=>{st('☁️ Guardando antes de salir…');try{if(u&&!(await upload())){st('⚠️ No se confirmó el respaldo. No se cerró sesión para proteger tus datos.');return}}catch(e){console.error(e);st('No pude guardar. Intenta salir nuevamente.');return}ready=false;u=null;await c.auth.signOut();location.reload()};
 q('logoutButton').onclick=logout;
 if(q('desktopLogout'))q('desktopLogout').onclick=logout;
 if(q('mobileLogout'))q('mobileLogout').onclick=logout;
 const {data:{session}}=await c.auth.getSession();if(session?.user)await connected(session.user);
 c.auth.onAuthStateChange((e,s)=>{if(e==='PASSWORD_RECOVERY'){u=s?.user||null;q('loginBox').style.display='none';q('accountBox').style.display='none';q('resetBox').style.display='block';q('authGate').style.display='grid';st('Crea tu nueva contraseña 💗');return}if(s?.user&&!u)connected(s.user)});
 }catch(e){console.error('Error iniciando sincronización',e);st('⚠️ Error de sincronización · tus datos siguen guardados en este dispositivo')}
}
// Arranque robusto: cloud-sync se carga al final del HTML, pero si DOMContentLoaded
// ya ocurrió no debemos quedarnos esperando un evento que no volverá a dispararse.
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}
setTimeout(()=>{const x=q('cloudStatus');if(x&&/Verificando respaldo|Sincronizando/.test(x.textContent)){st('⚠️ La sincronización no respondió · tus datos locales siguen guardados')}},12000);
})();