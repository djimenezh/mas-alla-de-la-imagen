(function(){
let c,u,ready=false,timer;
const q=id=>document.getElementById(id);
function st(t){const x=q('cloudStatus');if(x)x.textContent=t}
function localHasData(x){return !!(x&&x.months&&Object.values(x.months).some(m=>(m.tx&&m.tx.length)||(m.goals&&m.goals.length)||Object.values(m.budgets||{}).some(v=>Number(v)>0)))}
async function upload(){
 if(!ready||!u)return;
 const {error}=await c.from('finance_profiles').upsert({user_id:u.id,data:store,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error){console.error(error);st('Error al sincronizar: '+error.message);return}
 st('☁️ Sincronizado');
}
const oldSave=window.save;
window.save=function(){oldSave();if(ready&&u){st('☁️ Guardando…');clearTimeout(timer);timer=setTimeout(upload,300)}};
async function sync(){
 st('Sincronizando…');
 const {data,error}=await c.from('finance_profiles').select('data').eq('user_id',u.id).maybeSingle();
 if(error){st('Error: '+error.message);return}
 const local=JSON.parse(localStorage.getItem('masAllaFinanzas')||'null');
 if(data&&data.data&&data.data.months){
   store=data.data;if(!store.active)store.active='2026-10';if(!store.months[store.active])store.months[store.active]=defaultMonth();
   s=store.months[store.active];localStorage.setItem('masAllaFinanzas',JSON.stringify(store));
   if(q('monthSelect'))q('monthSelect').value=store.active;updateMonthlyMessage();render();
 }else if(localHasData(local)){store=local;s=store.months[store.active]||defaultMonth()}
 ready=true;await upload();st('✓ Cuenta conectada · ☁️ Sincronizado');
}
async function connected(user){
 u=user;q('loginBox').style.display='none';q('accountBox').style.display='block';q('accountEmail').textContent=user.email||'';
 const n=user.user_metadata?.display_name||localStorage.getItem('masAllaNombre');if(n)document.querySelector('.hello').textContent='Hola '+n+' ♡';
 await sync();q('authGate').style.display='none';
}
async function login(){
 const n=q('loginName').value.trim(),email=q('loginEmail').value.trim();if(!n||!email)return alert('Escribe tu nombre y tu correo 💗');
 localStorage.setItem('masAllaNombre',n);st('Enviando acceso a tu correo…');
 const {error}=await c.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,data:{display_name:n}}});
 if(error){st('Error: '+error.message);return}st('Revisa tu correo ✉️');
}
async function init(){
 c=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);q('loginButton').onclick=login;
 q('logoutButton').onclick=async()=>{await c.auth.signOut();location.reload()};
 const {data:{session}}=await c.auth.getSession();if(session?.user)await connected(session.user);
 c.auth.onAuthStateChange((_e,s)=>{if(s?.user&&!u)connected(s.user)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();