const C = window.CAMPUS_CONFIG || {};
const configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && !String(C.SUPABASE_URL).startsWith('YOUR_'));
let sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
const app = document.getElementById('app');
let session = null, profile = null, realtimeChannel = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fallback = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#eef3fa"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#7c879a" font-size="26">No photo</text></svg>');
const img = url => url || fallback;
function toast(text){const d=document.createElement('div');d.className='toast';d.textContent=text;document.body.appendChild(d);setTimeout(()=>d.remove(),3200)}
function page(p){location.hash=p;render()}
function fmtDate(d){return d ? new Date(d+'T00:00:00').toLocaleDateString() : '—'}
function fmtTime(t){return t ? String(t).slice(0,5) : '—'}

async function boot(){
  if(!configured){showSetup();return}
  const {data}=await sb.auth.getSession();
  session=data.session;
  if(session) await loadProfile();
  await render();
  sb.auth.onAuthStateChange(async (_event,s)=>{session=s;if(s) await loadProfile();else profile=null;await render()});
  subscribeRealtime();
}
function subscribeRealtime(){
  realtimeChannel = sb.channel('campus-guardian-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'lost_items'},()=>refreshPage())
    .on('postgres_changes',{event:'*',schema:'public',table:'found_items'},()=>refreshPage())
    .on('postgres_changes',{event:'*',schema:'public',table:'claims'},()=>refreshPage())
    .subscribe();
}
let refreshTimer;
function refreshPage(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(session) render()},250)}
function showSetup(){app.innerHTML=`<div class="wrap"><div class="card login"><div class="logo-big">🛡️</div><h2>Campus Guardian</h2><p>This app needs your Supabase project connected.</p><div class="notice">Open <b>config.js</b> and add your Supabase project root URL and publishable/anon key. The URL must end at <b>.supabase.co</b>, not <b>/rest/v1/</b>.</div></div></div>`}

function header(){
  const links = session ? `
    <button class="btn" onclick="page('home')">Home</button>
    <button class="btn" onclick="page('live')">Live Found</button>
    <button class="btn" onclick="page('report')">Report Item</button>
    <button class="btn" onclick="page('matches')">My Matches</button>
    <button class="btn" onclick="page('status')">Claim Status</button>
    ${profile?.role==='manager'?'<button class="btn manager" onclick="page(\'admin-dashboard\')">Admin</button>':''}
    <button class="btn" onclick="logout()">Logout</button>` : `
    <button class="btn primary" onclick="page('login')">Student Login</button>
    <button class="btn" onclick="page('register')">Create Account</button>
    <button class="btn" onclick="page('admin')">Admin Login</button>`;
  return `<header class="top"><div class="brand"><div class="shield">🛡️</div><div><b>Campus Guardian</b><small>Live Campus Lost & Found</small></div></div><nav class="nav">${links}</nav></header>`;
}

async function render(){
  if(!configured){showSetup();return}
  const p=location.hash.slice(1)||'login';
  if(p==='login') return login(false);
  if(p==='register') return register();
  if(p==='admin') return login(true);
  if(!session) return login(false);
  if(p==='home') return home();
  if(p==='live') return live();
  if(p==='report') return report();
  if(p==='matches') return matches();
  if(p==='status') return status();
  if(p==='admin-dashboard') return adminDashboard();
  return home();
}

function login(admin){
  app.innerHTML=`${header()}<main class="wrap"><div class="card login">
    <div class="eyebrow">${admin?'SECURE MANAGER AREA':'STUDENT PORTAL'}</div>
    <div class="logo-big">${admin?'👑':'🎓'}</div>
    <h2>${admin?'Admin / Manager Login':'Student Login'}</h2>
    <p class="muted">${admin?'Only authorized Manager accounts can approve claims and control returns.':'Use your email address and your separate Campus Guardian password.'}</p>
    <div class="field"><label>Email</label><input id="email" type="email" autocomplete="username" placeholder="student@gmail.com"></div>
    <div class="field"><label>Campus Guardian Password</label><input id="pw" type="password" autocomplete="current-password" placeholder="Your app password"></div>
    <button class="btn primary wide" onclick="doLogin(${admin})">${admin?'Admin Login':'Student Login'}</button>
    ${admin?'<p class="switch"><button class="link" onclick="page(\'login\')">← Student Login</button></p>':'<p class="switch">New student? <button class="link" onclick="page(\'register\')">Create your account</button></p>'}
  </div></main>`;
}
async function doLogin(admin){
  const email=document.getElementById('email').value.trim().toLowerCase(), password=document.getElementById('pw').value;
  if(!email||!password) return toast('Enter email and password');
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error) return toast(error.message || 'Invalid login credentials');
  session=data.session; await loadProfile();
  if(!profile){await sb.auth.signOut();return toast('Profile not found. Run the final Supabase migration.');}
  if(admin && profile.role!=='manager'){await sb.auth.signOut();return toast('This account is not a Manager account');}
  if(!admin && profile.role!=='student'){await sb.auth.signOut();return toast('Please use Student Login');}
  toast(admin?'Admin login successful':'Student login successful');
  page(admin?'admin-dashboard':'home');
}

function register(){
  app.innerHTML=`${header()}<main class="wrap"><div class="card login">
    <div class="eyebrow">NEW STUDENT</div><div class="logo-big">🎓</div><h2>Create Student Account</h2>
    <p class="muted">Use any Gmail/college email. Create a <b>new Campus Guardian password</b>. Your Google/Gmail password is never requested.</p>
    <div class="field"><label>Full Name</label><input id="rname" placeholder="Arun Kumar"></div>
    <div class="field"><label>Student ID</label><input id="rid" placeholder="CSE1024"></div>
    <div class="field"><label>Department</label><input id="rdept" placeholder="CSE"></div>
    <div class="field"><label>Email</label><input id="remail" type="email" autocomplete="email" placeholder="student@gmail.com"></div>
    <div class="field"><label>Create Campus Guardian Password</label><input id="rpw" type="password" autocomplete="new-password" placeholder="At least 6 characters"></div>
    <div class="field"><label>Confirm Password</label><input id="rcpw" type="password" autocomplete="new-password" placeholder="Re-enter password"></div>
    <button class="btn primary wide" onclick="doRegister()">Create Account</button>
    <p class="switch">Already registered? <button class="link" onclick="page('login')">Student Login</button></p>
  </div></main>`;
}
async function doRegister(){
  const full_name=document.getElementById('rname').value.trim(), student_id=document.getElementById('rid').value.trim(), department=document.getElementById('rdept').value.trim();
  const email=document.getElementById('remail').value.trim().toLowerCase(), password=document.getElementById('rpw').value, confirm=document.getElementById('rcpw').value;
  if(!full_name||!student_id||!department||!email||!password||!confirm)return toast('Fill all fields');
  if(password.length<6)return toast('Password must be at least 6 characters');
  if(password!==confirm)return toast('Passwords do not match');
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name,student_id,department}}});
  if(error)return toast(error.message);
  if(data.session){session=data.session;await loadProfile();toast('Student account created successfully');page('home')}
  else toast('Account created. Confirm the email if confirmation is enabled, then login.');
}
async function loadProfile(){
  if(!session){profile=null;return}
  const {data,error}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
  profile=error?null:data;
}
async function me(){const {data:{user}}=await sb.auth.getUser();return user}
async function logout(){await sb.auth.signOut();session=null;profile=null;page('login')}

async function home(){
  const u=await me();
  const [{count:foundCount},{count:lostCount},{count:claimCount}]=await Promise.all([
    sb.from('found_items').select('*',{count:'exact',head:true}).eq('status','LIVE'),
    sb.from('lost_items').select('*',{count:'exact',head:true}).eq('owner_id',u.id).eq('status','ACTIVE'),
    sb.from('claims').select('*',{count:'exact',head:true}).eq('status','PENDING').in('lost_id',(await sb.from('lost_items').select('id').eq('owner_id',u.id)).data?.map(x=>x.id)||['00000000-0000-0000-0000-000000000000'])
  ]);
  app.innerHTML=`${header()}<main class="wrap">
    <section class="hero"><span class="badge light">LIVE SYSTEM</span><h1>Find it. Match it. Return it.</h1><p>One secure campus place to report lost or found items, see smart matches and request a verified return.</p><div class="actions"><button class="btn primary" onclick="page('report')">＋ Report Lost / Found</button><button class="btn" onclick="page('live')">View Live Found Items</button></div></section>
    <div class="stats"><div class="stat"><b>${foundCount||0}</b><span>Live found items</span></div><div class="stat"><b>${lostCount||0}</b><span>My active lost reports</span></div><div class="stat"><b>${claimCount||0}</b><span>Pending claims</span></div></div>
    <div class="grid"><div class="card"><h3>👤 ${esc(profile?.full_name||u.email)}</h3><p class="muted">${esc(profile?.student_id||'Student')} • ${esc(profile?.department||'Department not set')}</p><p class="small">${esc(u.email)}</p></div><div class="card"><h3>⚡ Live updates</h3><p class="muted">New reports, claims and return decisions refresh automatically for connected users.</p></div><div class="card"><h3>🔐 Manager verification</h3><p class="muted">Only the Manager can approve or reject a claim and reveal exact pickup details.</p></div></div>
  </main>`;
}

async function report(){
  app.innerHTML=`${header()}<main class="wrap"><div class="section-head"><div><div class="eyebrow">STUDENT REPORT</div><h2>Report a Lost or Found Item</h2><p class="muted">Upload a photo so other students can compare it. New reports appear live.</p></div></div>
    <div class="grid two"><div class="card"><h3>🔎 I Lost an Item</h3>${lostForm()}</div><div class="card"><h3>📦 I Found an Item</h3>${foundForm()}</div></div>
  </main>`;
}
function lostForm(){return `<div class="field"><label>Item name</label><input id="ltitle" placeholder="Black Wallet / College ID Card"></div><div class="field"><label>Category</label><select id="lcat"><option>Wallet</option><option>ID Card</option><option>Phone</option><option>Keys</option><option>Bag</option><option>Books</option><option>Other</option></select></div><div class="field"><label>Lost place</label><input id="lplace" placeholder="College Canteen"></div><div class="row"><div class="field"><label>Date</label><input id="ldate" type="date"></div><div class="field"><label>Time</label><input id="ltime" type="time"></div></div><div class="field"><label>Description</label><textarea id="ldesc" rows="3" placeholder="Distinctive marks, color, contents..."></textarea></div><div class="field"><label>Photo</label><input id="lphoto" type="file" accept="image/*"></div><button class="btn primary wide" onclick="submitLost()">Submit Lost Report</button>`}
function foundForm(){return `<div class="field"><label>Item name</label><input id="ftitle" placeholder="Black Wallet / Student ID Card"></div><div class="field"><label>Category</label><select id="fcat"><option>Wallet</option><option>ID Card</option><option>Phone</option><option>Keys</option><option>Bag</option><option>Books</option><option>Other</option></select></div><div class="field"><label>Found place</label><input id="fplace" placeholder="College Canteen"></div><div class="row"><div class="field"><label>Date</label><input id="fdate" type="date"></div><div class="field"><label>Time</label><input id="ftime" type="time"></div></div><div class="field"><label>Storage location</label><input id="fstorage" placeholder="Security Office - Block A"></div><div class="field"><label>Pickup location</label><input id="fpickup" placeholder="Security Office - Block A"></div><div class="field"><label>Finder contact</label><input id="fcontact" placeholder="Your phone number"></div><div class="field"><label>Description</label><textarea id="fdesc" rows="3" placeholder="Color, marks, where it was found..."></textarea></div><div class="field"><label>Photo</label><input id="fphoto" type="file" accept="image/*"></div><button class="btn success wide" onclick="submitFound()">Submit Found Report</button>`}
async function uploadPhoto(file){
  if(!file)return null;
  if(file.size>5*1024*1024)throw new Error('Photo must be 5 MB or smaller');
  if(!file.type.startsWith('image/'))throw new Error('Please choose an image file');
  const path=`${session.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const {error}=await sb.storage.from('campus-images').upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw error;
  return path;
}
async function submitLost(){
  try{
    const title=document.getElementById('ltitle').value.trim(), category=document.getElementById('lcat').value, lost_place=document.getElementById('lplace').value.trim();
    if(!title||!lost_place)return toast('Enter item name and lost place');
    const photo_url=await uploadPhoto(document.getElementById('lphoto').files[0]);
    const payload={owner_id:session.user.id,title,category,lost_place,lost_date:document.getElementById('ldate').value||null,lost_time:document.getElementById('ltime').value||null,description:document.getElementById('ldesc').value.trim(),photo_url,status:'ACTIVE'};
    const {error}=await sb.from('lost_items').insert(payload);if(error)throw error;
    toast('Lost report submitted');page('matches');
  }catch(e){toast(e.message||'Could not submit lost report')}
}
async function submitFound(){
  try{
    const title=document.getElementById('ftitle').value.trim(), category=document.getElementById('fcat').value, found_place=document.getElementById('fplace').value.trim();
    if(!title||!found_place)return toast('Enter item name and found place');
    const photo_url=await uploadPhoto(document.getElementById('fphoto').files[0]);
    const payload={finder_id:session.user.id,title,category,found_place,found_date:document.getElementById('fdate').value||null,found_time:document.getElementById('ftime').value||null,storage_location:document.getElementById('fstorage').value.trim(),pickup_location:document.getElementById('fpickup').value.trim(),finder_contact:document.getElementById('fcontact').value.trim(),description:document.getElementById('fdesc').value.trim(),photo_url,status:'LIVE'};
    const {error}=await sb.from('found_items').insert(payload);if(error)throw error;
    toast('Found item is now LIVE');page('live');
  }catch(e){toast(e.message||'Could not submit found report')}
}

async function signedPhoto(path){
  if(!path)return fallback;
  if(path.startsWith('http'))return path;
  const {data,error}=await sb.storage.from('campus-images').createSignedUrl(path,3600);
  return error?fallback:data.signedUrl;
}
async function withPhotos(items){return Promise.all((items||[]).map(async x=>({...x,_photo:await signedPhoto(x.photo_url)})))}

async function live(){
  const {data,error}=await sb.from('found_items').select('*').eq('status','LIVE').order('created_at',{ascending:false});
  if(error)return fail(error); const rows=await withPhotos(data);
  app.innerHTML=`${header()}<main class="wrap"><div class="section-head"><div><div class="eyebrow">REAL-TIME FEED</div><h2>🟢 Live Found Items</h2><p class="muted">Anyone can report a found item. The original lost-item owner can claim a match.</p></div><button class="btn primary" onclick="page('report')">＋ Report Item</button></div><div class="grid">${rows.map(f=>foundCard(f)).join('')||'<div class="card center">No live found items yet.</div>'}</div></main>`;
}
function foundCard(f){return `<article class="card"><img class="item-photo" src="${img(f._photo)}" alt="Found item photo"><div class="card-body"><div class="line"><span class="badge live">LIVE</span><span class="small">${fmtDate(f.found_date)} ${fmtTime(f.found_time)}</span></div><h3>${esc(f.title)}</h3><p class="muted">${esc(f.category)} • 📍 ${esc(f.found_place)}</p><p class="small">Storage: ${esc(f.storage_location||'Campus security')}</p><p class="small">${esc(f.description||'No description')}</p><button class="btn primary" onclick="page('matches')">Check My Match</button></div></article>`}

async function matches(){
  const u=await me();
  const [{data:lost,error:e1},{data:found,error:e2}]=await Promise.all([sb.from('lost_items').select('*').eq('owner_id',u.id).eq('status','ACTIVE'),sb.from('found_items').select('*').eq('status','LIVE').order('created_at',{ascending:false})]);
  if(e1||e2)return fail(e1||e2);
  const frows=await withPhotos(found), lrows=await withPhotos(lost);
  const matches=[];
  for(const f of frows){for(const l of lrows){const score=calc(l,f);if(score>=40)matches.push({l,f,score})}}
  matches.sort((a,b)=>b.score-a.score);
  const claimed=await sb.from('claims').select('lost_id,found_id,status').eq('lost_id', '00000000-0000-0000-0000-000000000000');
  app.innerHTML=`${header()}<main class="wrap"><div class="section-head"><div><div class="eyebrow">SMART MATCHING</div><h2>🤖 My Matches</h2><p class="muted">The score compares category, place, date, title keywords and photo availability. It is a matching score, not facial/image recognition.</p></div></div>${matches.map(m=>matchCard(m)).join('')||'<div class="card center"><h3>No match yet</h3><p class="muted">Report your lost item with a photo. New found reports will appear here automatically.</p></div>'}</main>`;
}
function calc(l,f){
  let s=0; const a=(l.category||'').toLowerCase(), b=(f.category||'').toLowerCase(); if(a&&a===b)s+=30;
  if((l.lost_place||'').trim().toLowerCase()===(f.found_place||'').trim().toLowerCase())s+=25;
  if(l.lost_date&&f.found_date){const days=Math.abs(new Date(l.lost_date+'T00:00:00')-new Date(f.found_date+'T00:00:00'))/86400000;s+=Math.max(0,20-Math.min(20,days*5))}
  const lt=(l.title||'').toLowerCase().split(/\s+/), ft=(f.title||'').toLowerCase().split(/\s+/); const common=lt.filter(x=>x.length>2&&ft.includes(x)); s+=Math.min(15,common.length*7.5);
  if(l.photo_url&&f.photo_url)s+=10; return Math.min(99,Math.round(s));
}
function matchCard(m){return `<article class="card match-card"><div class="match-head"><div><span class="badge live">${m.score}% MATCH</span><h2>${esc(m.l.title)}</h2><p class="muted">Found: ${esc(m.f.title)} • 📍 ${esc(m.f.found_place)}</p></div><div class="score">${m.score}%</div></div><div class="photos"><figure><img src="${img(m.l._photo)}"><figcaption>YOUR LOST PHOTO</figcaption></figure><figure><img src="${img(m.f._photo)}"><figcaption>FOUND PHOTO</figcaption></figure></div><div class="notice">Exact pickup and contact details stay hidden until a Manager approves your claim.</div><button class="btn success" onclick="claim('${m.l.id}','${m.f.id}')">CLAIM ITEM</button></article>`}
async function claim(lost_id,found_id){
  const {data:existing}=await sb.from('claims').select('id,status').eq('lost_id',lost_id).eq('found_id',found_id).maybeSingle();
  if(existing)return toast(`Claim already ${existing.status.toLowerCase()}`);
  const {error}=await sb.from('claims').insert({lost_id,found_id,status:'PENDING'}); if(error)return toast(error.message); toast('Claim submitted — waiting for Manager approval');page('status');
}

async function status(){
  const u=await me();
  const {data,error}=await sb.from('claims').select('*,lost_items(*),found_items(*)').order('created_at',{ascending:false});
  if(error)return fail(error);
  const own=(data||[]).filter(c=>c.lost_items?.owner_id===u.id);
  const rows=await Promise.all(own.map(async c=>({...c,_foundPhoto:await signedPhoto(c.found_items?.photo_url),_lostPhoto:await signedPhoto(c.lost_items?.photo_url)})));
  app.innerHTML=`${header()}<main class="wrap"><div class="section-head"><div><div class="eyebrow">MY CLAIMS</div><h2>📋 Claim Status</h2><p class="muted">Approval reveals the exact pickup and finder contact details.</p></div></div>${rows.map(c=>`<article class="card"><div class="line"><h3>${esc(c.lost_items?.title||'Item')}</h3><span class="badge ${c.status==='PENDING'?'pending':c.status==='APPROVED'?'returned':'rejected'}">${esc(c.status)}</span></div><p class="muted">Matched found item: ${esc(c.found_items?.title||'')} • ${esc(c.found_items?.found_place||'')}</p>${c.status==='APPROVED'?`<div class="notice"><b>Pickup approved</b><br>📍 Pickup: ${esc(c.found_items?.pickup_location||c.found_items?.storage_location||'Campus Security')}<br>📞 Contact: ${esc(c.found_items?.finder_contact||'Not provided')}<br>🏢 Storage: ${esc(c.found_items?.storage_location||'')}</div>`:c.status==='REJECTED'?'<p class="muted">The Manager rejected this claim.</p>':'<p class="muted">Waiting for Manager verification.</p>'}</article>`).join('')||'<div class="card center">No claims yet. Find a match and request a claim.</div>'}</main>`;
}

async function adminDashboard(){
  if(profile?.role!=='manager')return page('home');
  const [{data:claims,error:e1},{data:lost,error:e2},{data:found,error:e3}]=await Promise.all([
    sb.from('claims').select('*,lost_items(*),found_items(*)').order('created_at',{ascending:false}),
    sb.from('lost_items').select('*').eq('status','ACTIVE').order('created_at',{ascending:false}),
    sb.from('found_items').select('*').eq('status','LIVE').order('created_at',{ascending:false})
  ]);
  if(e1||e2||e3)return fail(e1||e2||e3);
  const crows=await Promise.all((claims||[]).map(async c=>({...c,_lost:await signedPhoto(c.lost_items?.photo_url),_found:await signedPhoto(c.found_items?.photo_url)})));
  const lrows=await withPhotos(lost), frows=await withPhotos(found);
  app.innerHTML=`${header()}<main class="wrap"><section class="hero admin-hero"><span class="badge light">MANAGER ONLY</span><h1>Admin Control Center</h1><p>Review claims, manage live reports and complete verified returns.</p></section><div class="stats"><div class="stat"><b>${crows.filter(x=>x.status==='PENDING').length}</b><span>Pending claims</span></div><div class="stat"><b>${frows.length}</b><span>Live found</span></div><div class="stat"><b>${lrows.length}</b><span>Active lost reports</span></div></div>
  <section><div class="section-head"><h2>Claim approvals</h2></div><div class="grid">${crows.map(c=>adminClaim(c)).join('')||'<div class="card center">No claims.</div>'}</div></section>
  <section><div class="section-head"><h2>Live found reports</h2></div><div class="grid">${frows.map(f=>`<article class="card"><img class="item-photo" src="${img(f._photo)}"><h3>${esc(f.title)}</h3><p class="muted">${esc(f.category)} • ${esc(f.found_place)}</p><p class="small">Finder contact: ${esc(f.finder_contact||'—')}</p><button class="btn danger wide" onclick="removeFoundItem('${f.id}')">Remove from Live</button></article>`).join('')||'<div class="card center">No live found reports.</div>'}</div></section></main>`;
}
function adminClaim(c){
  const pending=c.status==='PENDING', approved=c.status==='APPROVED';
  return `<article class="card"><div class="line"><h3>${esc(c.lost_items?.title||'Item')}</h3><span class="badge ${pending?'pending':approved?'returned':'rejected'}">${esc(c.status)}</span></div><div class="photos"><figure><img src="${img(c._lost)}"><figcaption>LOST</figcaption></figure><figure><img src="${img(c._found)}"><figcaption>FOUND</figcaption></figure></div><p class="small">Lost place: ${esc(c.lost_items?.lost_place||'—')}<br>Found place: ${esc(c.found_items?.found_place||'—')}<br>Finder: ${esc(c.found_items?.finder_contact||'—')}</p>${pending?`<div class="actions"><button class="btn success" onclick="reviewClaim('${c.id}','APPROVED')">Approve Claim</button><button class="btn danger" onclick="reviewClaim('${c.id}','REJECTED')">Reject</button></div>`:''}${approved?`<div class="notice">Student has approval. Complete the physical handover, then click <b>Mark Returned & Remove</b>.</div><button class="btn danger wide" onclick="returnItem('${c.id}')">Mark Returned & Remove</button>`:''}</article>`;
}
async function removeFoundItem(foundId){
  if(profile?.role!=='manager')return toast('Manager access required');
  if(!confirm('Remove this found item from Live Found? This will also remove any linked claim records.'))return;
  const {error}=await sb.rpc('manager_remove_found_item',{p_found_id:foundId});
  if(error)return toast(error.message);
  toast('Found item removed from Live Found.');
  render();
}
async function reviewClaim(id,decision){
  if(profile?.role!=='manager')return toast('Manager access required');
  const {error}=await sb.from('claims').update({status:decision,reviewed_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message);
  toast(decision==='APPROVED'?'Claim approved — pickup details are now visible to the student.':'Claim rejected');render();
}
async function returnItem(claimId){
  if(profile?.role!=='manager')return toast('Manager access required');
  if(!confirm('Mark returned and permanently remove the item, lost report and claim? This cannot be undone.'))return;
  const {data,error}=await sb.rpc('manager_return_item',{p_claim_id:claimId});
  if(error)return toast(error.message);
  // Best-effort cleanup of the two storage files. Database deletion is already complete.
  const c = data || {};
  if(c.lost_id || c.found_id){
    // Paths are not available after deletion, so the DB is authoritative; storage cleanup can be done by policy/admin later.
  }
  toast('Returned. Item and claim removed from Campus Guardian.');render();
}
function fail(e){app.innerHTML=`${header()}<main class="wrap"><div class="card"><h3>Something went wrong</h3><p class="muted">${esc(e?.message||e)}</p><button class="btn" onclick="page('home')">Back Home</button></div></main>`}

boot();
