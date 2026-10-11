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
// Compare financial content independently of the selected screen/month and property order.
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x}
function comparable(x){if(!x)return null;const {updatedAt,active,...rest}=x;return JSON.stringify(canonical(rest))}
function sameData(a,b){return comparable(a)===comparable(b)}
const ownerKey='masAllaFinanzasOwner';
const baselineKey=()=> 'masAllaSyncBaseline:'+u.id;
function protectAccount(user){const previous=localStorage.getItem(ownerKey);if(previous&&previous!==user.id){backup(store,'other-account-'+previous);st('⚠️ Hay información de otra cuenta en este dispositivo. Se conservó sin mezclar.');return false}return true}
function equal(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}
function mergeStates(base,local,cloud){
 const issues=[];
 function walk(b,l,r,path){
  if(equal(l,r))return clone(l);
  if(base!==null&&equal(l,b))return clone(r);
  if(base!==null&&equal(r,b))return clone(l);
  if(base!==null&&b!==undefined&&(l===undefined||r===undefined)){issues.push({path,local:clone(l),cloud:clone(r)});return clone(l)}
  if(l===undefined)return clone(r);
  if(r===undefined)return clone(l);
  if(Array.isArray(l)&&Array.isArray(r)){
   // Stable IDs allow concurrent additions; legacy arrays need an explicit choice.
   if([...l,...r,...(Array.isArray(b)?b:[])].every(x=>x&&typeof x==='object'&&x.id)){
    const bm=new Map((b||[]).map(x=>[x.id,x])),lm=new Map(l.map(x=>[x.id,x])),rm=new Map(r.map(x=>[x.id,x]));
    return [...new Set([...lm.keys(),...rm.keys(),...bm.keys()])].map(id=>walk(bm.get(id),lm.get(id),rm.get(id),path+'/'+id)).filter(x=>x!==undefined);
   }
  }else if(l&&r&&typeof l==='object'&&typeof r==='object'){
   const out={};for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
    if(k==='active'||k==='updatedAt'){out[k]=clone(l[k]??r[k]);continue}
    const v=walk(b?.[k],l[k],r[k],path+'/'+k);if(v!==undefined)out[k]=v;
   }return out;
  }
  const issue={path,local:clone(l),cloud:clone(r)};issues.push(issue);return clone(l);
 }
 return {data:walk(base,local,cloud,''),issues};
}
function readable(value){
 if(value===undefined)return 'Eliminado';
 if(Array.isArray(value))return value.length?value.map(readable).join('\n\n'):'Sin registros';
 if(value&&typeof value==='object'){
  const labels={amount:'Monto',desc:'Descripción',category:'Categoría',kind:'Tipo',name:'Nombre',limit:'Cupo',target:'Meta',now:'Ahorrado',close:'Día de cierre',pay:'Día de pago',budgets:'Presupuestos',tx:'Movimientos',goals:'Metas',cards:'Tarjetas',checks:'Revisión del mes',decision:'Compra'};
  return Object.entries(value).filter(([key])=>!['id','cardId','updatedAt'].includes(key)).map(([key,v])=>(labels[key]||key)+': '+(key==='amount'||key==='limit'||key==='target'||key==='now'?clp(v):readable(v))).join('\n');
 }
 return ({income:'Ingreso',expense:'Gasto',saving:'Ahorro',true:'Sí',false:'No'})[String(value)]||String(value);
}
let reviewState=null,cloudVersion=null;
function install(x){store=clone(x)||{months:{},cards:[],active:'2026-10'};store.months=store.months||{};store.cards=store.cards||[];store.active=store.active||'2026-10';if(!store.months[store.active])store.months[store.active]=defaultMonth();s=store.months[store.active];localStorage.setItem('masAllaFinanzas',JSON.stringify(store));if(q('monthSelect'))q('monthSelect').value=store.active;updateMonthlyMessage();updateCardSelect();render()}
function remember(x){cloudBaseline=clone(x);localStorage.setItem(baselineKey(),JSON.stringify(x));localStorage.setItem(ownerKey,u.id)}
function showReview(result,remote){
 conflict=true;reviewState={result,remote:clone(remote),local:clone(store)};
 st('⚠️ Hay cambios que necesitan tu elección. Tus dos copias están protegidas.');
 let button=q('reviewSync');if(!button){button=document.createElement('button');button.id='reviewSync';button.textContent='REVISAR DIFERENCIAS';q('cloudStatus').after(button)}button.hidden=false;
 button.onclick=()=>{
  let dialog=q('syncReviewDialog');if(dialog)dialog.remove();dialog=document.createElement('dialog');dialog.id='syncReviewDialog';dialog.style.cssText='max-width:620px;width:92%;max-height:85vh;border:1px solid #e8a4c4;border-radius:20px;padding:20px';
  const title=document.createElement('h2');title.textContent='Elige qué versión conservar';dialog.append(title);
  const note=document.createElement('p');note.textContent='Revisa cada diferencia. Se conservarán respaldos de ambas copias. Los cambios compatibles ya se combinaron.';dialog.append(note);
  const selections=[];
  for(const item of result.issues){
   const box=document.createElement('section'),label=document.createElement('p');label.textContent=item.path.replace('/months/','Mes ').replace('/tx',' · Movimientos').replace('/goals',' · Metas').replace('/budgets',' · Presupuesto').replace('/cards','Tarjetas').replace(/\/(?:[a-f0-9-]{20,}|card_\d+)/g,'').replace('/amount',' · Monto').replace('/checks',' · Revisión del mes');box.append(label);
   const select=document.createElement('select');select.style.cssText='width:100%;padding:10px;font-size:16px';
   for(const [value,text] of [['','Selecciona una versión'],['local','Este teléfono'],['cloud','La nube']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o)}
   for(const [name,value] of [['Este teléfono',item.local],['La nube',item.cloud]]){const heading=document.createElement('b'),pre=document.createElement('pre');heading.textContent=name;pre.textContent=readable(value);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto';box.append(heading,pre)}
   box.append(select);dialog.append(box);selections.push({item,select});
  }
  const cancel=document.createElement('button');cancel.textContent='VOLVER';cancel.onclick=()=>dialog.close();dialog.append(cancel);
  const apply=document.createElement('button');apply.textContent='GUARDAR ELECCIONES';dialog.append(apply);
  apply.onclick=async()=>{
   if(selections.some(x=>!x.select.value)){alert('Selecciona una versión para cada diferencia.');return}
   // Do not apply stale choices if the user edited while the review was open.
   if(!sameData(store,reviewState.local)){dialog.close();conflict=false;await sync();return}
   const resolved=clone(result.data);
   for(const {item,select} of selections){let obj=resolved;const keys=item.path.split('/').slice(1);for(const key of keys.slice(0,-1))obj=Array.isArray(obj)?obj.find(x=>x.id===key):obj[key];const key=keys.at(-1),value=clone(item[select.value]);if(Array.isArray(obj)){const i=obj.findIndex(x=>x.id===key);if(value===undefined){if(i>=0)obj.splice(i,1)}else if(i>=0)obj[i]=value;else obj.push(value)}else if(value===undefined)delete obj[key];else obj[key]=value}
   backup(store,'review-local');backup(remote,'review-cloud');remember(remote);install(resolved);conflict=false;button.hidden=true;dialog.close();await upload();
  };document.body.append(dialog);dialog.showModal();
 };
}
async function upload(){
 if(!u||!ready)return false;
 if(saving){pending=true;return await saving}
 saving=performUpload();try{return await saving}finally{saving=null;if(pending){pending=false;setTimeout(upload,0)}}
}
async function performUpload(){
 if(conflict)return false;
 const {data:remote,error:readError}=await c.from('finance_profiles').select('data,updated_at').eq('user_id',u.id).maybeSingle();
 if(readError){st('Error al verificar respaldo: '+readError.message);return false}
 const cloud=remote?.data||null;cloudVersion=remote?.updated_at;
 backup(store,'before-upload');backup(cloud,'cloud-before-upload');
 if(!sameData(cloud,cloudBaseline)){
  if(!localHasData(store)){install(cloud);remember(cloud);st('☁️ Sincronizado');return true}
  if(localHasData(cloud)){const result=mergeStates(cloudBaseline,store,cloud);if(result.issues.length){showReview(result,cloud);return false}install(result.data)}
  remember(cloud);
 }
 const snapshot=clone(store),row={user_id:u.id,data:snapshot,updated_at:new Date().toISOString()};
 // Compare-and-swap: a second device cannot overwrite changes made after our read.
 const query=remote?c.from('finance_profiles').update(row).eq('user_id',u.id).eq('updated_at',cloudVersion):c.from('finance_profiles').insert(row);
 const {data:written,error}=await query.select('user_id');
 if(error){st('No se confirmó la sincronización. Tus datos siguen en este dispositivo.');return false}
 if(!written?.length){pending=true;st('☁️ Otro dispositivo guardó cambios. Volviendo a sincronizar…');return false}
 remember(snapshot);if(!sameData(store,snapshot)){pending=true;st('☁️ Guardando cambios pendientes…')}else st('☁️ Sincronizado');return true;
}
window.addEventListener('finance-data-changed',()=>{if(u&&ready){if(conflict){st('⚠️ Cambios guardados en este teléfono. Revisa las diferencias para sincronizar.');return}st('☁️ Guardando…');clearTimeout(timer);timer=setTimeout(upload,150)}});
window.addEventListener('online',()=>{if(u&&!conflict)upload()});
document.addEventListener('visibilitychange',()=>{if(u&&!conflict){clearTimeout(timer);upload()}});
async function sync(){
 ready=false;st('Sincronizando…');if(!protectAccount(u)){conflict=true;return false}
 const local=clone(store);
 const {data,error}=await c.from('finance_profiles').select('data,updated_at').eq('user_id',u.id).maybeSingle();
 if(error){st('Error: '+error.message);return false}
 const cloud=data?.data||null;let base=null;try{base=JSON.parse(localStorage.getItem(baselineKey())||'null')}catch(e){}
 cloudBaseline=clone(cloud);conflict=false;backup(local,'local');backup(cloud,'cloud');
 if(!localStorage.getItem(ownerKey)&&localHasData(local)&&!sameData(local,cloud)){
  // Legacy unowned records must not silently become another account's data.
  ready=true;showReview({data:clone(local),issues:[{path:'/months',local:clone(local.months),cloud:clone(cloud?.months||{})},{path:'/cards',local:clone(local.cards||[]),cloud:clone(cloud?.cards||[])}]},cloud);return false;
 }
 if(localHasData(local)&&localHasData(cloud)&&!sameData(local,cloud)){
  const result=mergeStates(base,local,cloud);ready=true;if(result.issues.length){showReview(result,cloud);return false}install(result.data);
 }else install(localHasData(cloud)?{...cloud,active:local?.active||cloud.active}:local||cloud);
 ready=true;const saved=await upload();if(saved)st('✓ Cuenta conectada · ☁️ Sincronizado');return saved;
}
async function connected(user){ if(user.email){try{localStorage.setItem('masAllaLoginEmail',user.email)}catch(e){}}
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
  c=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  try{const email=localStorage.getItem('masAllaLoginEmail');if(email&&!q('loginEmail').value)q('loginEmail').value=email}catch(e){}
  q('loginBox').onsubmit=event=>{event.preventDefault();if(!q('loginButton').disabled)login();return false};
  q('loginButton').onclick=null;q('signupButton').onclick=signup;q('forgotButton').onclick=forgot;q('savePasswordButton').onclick=saveNewPassword;
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
