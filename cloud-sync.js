(function(){
let c,u,ready=false,timer;
const q=id=>document.getElementById(id);
function st(t){const x=q('cloudStatus');if(x)x.textContent=t}
function localHasData(x){return !!(x&&((x.cards&&x.cards.length)||(x.months&&Object.values(x.months).some(m=>(m.tx&&m.tx.length)||(m.goals&&m.goals.length)||(m.cards&&m.cards.length)||(m.checks&&m.checks.some(Boolean))||Object.values(m.budgets||{}).some(v=>Number(v)>0)))))}
function stamp(x){return Date.parse(x?.updatedAt||'')||0}
function backup(x,label){if(!x||!localHasData(x))return;try{localStorage.setItem('masAllaBackup:'+label+':'+Date.now(),JSON.stringify(x))}catch(e){console.warn('No pude crear respaldo local',e)}}
async function upload(){
 if(!u)return;
 const {error}=await c.from('finance_profiles').upsert({user_id:u.id,data:store,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error){console.error(error);st('Error al sincronizar: '+error.message);return}
 st('☁️ Sincronizado');
}
window.addEventListener('finance-data-changed',()=>{if(u){st('☁️ Guardando…');clearTimeout(timer);timer=setTimeout(upload,150)}});
async function sync(){
 st('Sincronizando…');
 const local=JSON.parse(localStorage.getItem('masAllaFinanzas')||'null');
 const {data,error}=await c.from('finance_profiles').select('data,updated_at').eq('user_id',u.id).maybeSingle();
 if(error){st('Error: '+error.message);return}
 const cloud=data?.data||null;
 const localHas=localHasData(local);
 const cloudHas=localHasData(cloud);
 const localTime=stamp(local),cloudTime=Math.max(stamp(cloud),Date.parse(data?.updated_at||'')||0);
 if(localHas&&cloudHas){
   backup(local,'local');backup(cloud,'cloud');
   store=cloudTime>=localTime?cloud:local;
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
 ready=true;await upload();st('✓ Cuenta conectada · ☁️ Sincronizado');
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
 const {data,error}=await c.auth.signInWithPassword({email,password});
 q('loginButton').disabled=false;
 if(error){st(error.message==='Invalid login credentials'?'Correo o contraseña incorrectos. Si es tu primera vez, toca CREAR MI CUENTA.':'Error: '+error.message);return}
 if(data?.user)await connected(data.user);
}
async function signup(){
 const n=q('loginName').value.trim(),email=q('loginEmail').value.trim(),password=q('loginPassword').value;
 if(!n||!email||password.length<6)return st('Escribe tu nombre, correo y una contraseña de al menos 6 caracteres 💗');
 localStorage.setItem('masAllaNombre',n);st('Creando tu cuenta…');q('signupButton').disabled=true;
 const {data,error}=await c.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{display_name:n}}});
 q('signupButton').disabled=false;
 if(error){st('Error: '+error.message);return}
 if(data?.session&&data?.user){await connected(data.user);return}
 st('Cuenta creada 💗 Revisa tu correo para confirmar tu email una sola vez. Después entrarás con tu contraseña.');
}
async function forgot(){
 const email=q('loginEmail').value.trim();if(!email)return st('Escribe primero tu correo 💗');
 q('forgotButton').disabled=true;st('Enviando enlace para cambiar tu contraseña…');
 const {error}=await c.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
 q('forgotButton').disabled=false;
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
 c=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);q('loginButton').onclick=login;q('signupButton').onclick=signup;q('forgotButton').onclick=forgot;q('savePasswordButton').onclick=saveNewPassword;
 const logout=async()=>{st('☁️ Guardando antes de salir…');try{if(u)await upload()}catch(e){console.error(e);st('No pude guardar. Intenta salir nuevamente.');return}ready=false;u=null;await c.auth.signOut();location.reload()};
 q('logoutButton').onclick=logout;
 if(q('desktopLogout'))q('desktopLogout').onclick=logout;
 if(q('mobileLogout'))q('mobileLogout').onclick=logout;
 const {data:{session}}=await c.auth.getSession();if(session?.user)await connected(session.user);
 c.auth.onAuthStateChange((e,s)=>{if(e==='PASSWORD_RECOVERY'){u=s?.user||null;q('loginBox').style.display='none';q('accountBox').style.display='none';q('resetBox').style.display='block';q('authGate').style.display='grid';st('Crea tu nueva contraseña 💗');return}if(s?.user&&!u)connected(s.user)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();