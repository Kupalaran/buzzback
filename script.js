/* ==================================================================
   BuzzBack: proof-of-concept for reviving Yahoo Messenger (1998–2018)
   Integrations demonstrated:
   1. Smart Status    : auto status from class schedule, music, games
   2. Respectful BUZZ : rate-limited; held while you're in Focus/class
   3. Bridges         : one buddy list for Discord, Telegram and SMS contacts
   4. AI Room Guard   : scam/spam/toxicity filter for public chat rooms
   5. Catch Me Up     : summary of unread group-chat messages
=================================================================== */

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now = () => new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
function toast(m){ const t=$('toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2000); }

/* ---------- Emoticons: classic shortcodes → emoji ---------- */
const EMO = [['=))','🤣'],[':))','😂'],[':D','😄'],[':)','🙂'],[':(','🙁'],[';)','😉'],[':P','😛'],[':p','😛'],[':O','😮'],['<3','❤️'],['XD','😆'],[':-*','😘'],['B-)','😎'],[':((','😭']];
function emojify(s){
  let out = esc(s);
  [...EMO].sort((a,b)=>b[0].length-a[0].length).forEach(([k,v]) => { out = out.split(esc(k)).join(v); });
  return out;
}

/* ---------- Data (fictional people) ---------- */
const COLORS = ['#e0533a','#2a8fbd','#22a55a','#a35ad1','#d98a12','#3b2a8f','#c23d7a'];
const buddies = [
  { id:'mika',  name:'Mika',   group:'Friends',    platform:'native',   status:'available', msg:'🎧 lofi + thesis = life', color:COLORS[3],
    replies:{ greet:['Uy! Kumusta? :)','Hellooo :D'], buzz:['HOY bakit ka nag-BUZZ =))','Ano yun?? :O'], thesis:['Chapter 3 pa rin ako :((','Defense na next month, kaba!'], def:['Haha true :P','Sige sige','Wait lang, nagkakape ako ;)','Omg same XD'] } },
  { id:'jopet', name:'Jopet',  group:'Classmates', platform:'discord',  status:'available', msg:'🎮 Ranked grind', color:COLORS[0],
    replies:{ greet:['yo','sup pre'], buzz:['pre wag ka mag-buzz nasa game ako =))','ano na'], thesis:['ikaw na bahala sa intro ha :P'], def:['g','haha legit','later pre, may laban pa ako','oks'] } },
  { id:'bea',   name:'Bea',    group:'Classmates', platform:'telegram', status:'busy',      msg:'📚 Studying for the Algo quiz', color:COLORS[1],
    replies:{ greet:['Hi! Busy lang konti, pero go :)'], buzz:['Na-receive ko na yung buzz mo hehe'], thesis:['Na-send ko na yung survey results sa GC!'], def:['Noted!','Sure, later ko i-check','Hahaha :D'] } },
  { id:'carlo', name:'Carlo',  group:'Friends',    platform:'sms',      status:'away',      msg:'Away · back after dinner', color:COLORS[4],
    replies:{ greet:['Uy! Text lang ako ha, wala akong data :P'], buzz:['(SMS) Buzz received!'], thesis:['Di pa ako tapos sa code :('], def:['Ok','Hehe sige','Text kita mamaya'] } },
  { id:'nina',  name:'Ms. Nina (Adviser)', group:'Classmates', platform:'native', status:'invisible', msg:'', color:COLORS[5],
    replies:{ greet:['Good afternoon. Please send your revised Chapter 2 by Friday.'], buzz:['Please do not buzz me. Send an email instead.'], thesis:['I will review your draft this weekend.'], def:['Noted.','Thank you.'] } },
];
const chats = Object.fromEntries(buddies.map(b => [b.id, []]));
chats.mika.push({from:'them', text:'Uy! Nakita mo na yung bagong thesis schedule? :O', t:'11:52 AM'});
chats.jopet.push({from:'them', text:'pre GG kagabi =))', t:'Yesterday'});
const unread = { jopet:1 };

const PLATFORM = {
  native:  { label:'BuzzBack', cls:'b-native',  note:'End-to-end encrypted' },
  discord: { label:'Discord',  cls:'b-discord', note:'Bridged to Discord DM' },
  telegram:{ label:'Telegram', cls:'b-telegram',note:'Bridged to Telegram' },
  sms:     { label:'SMS',      cls:'b-sms',     note:'Sent as SMS (offline buddy)' },
};

/* ---------- App state ---------- */
const state = {
  tab:'messenger', active:'mika',
  me:{ name:'You', status:'available', custom:'Coding at 2AM again =))' },
  smart:{ classes:false, music:false, games:false },
  heldBuzzes:[], buzzLog:[],
  room:{ msgs:[], paused:false, i:0, stats:{seen:0, warned:0, blocked:0}, showHidden:{} },
  catchup:{ read:false, summary:null }
};

/* ---------- 1. Smart Status ---------- */
const SCHEDULE = { subject:'Data Structures', room:'CL-3', until:'3:00 PM' };
function smartStatus(){
  const s = state.smart;
  if (s.classes) return { text:`📚 In class: ${SCHEDULE.subject} (${SCHEDULE.room}) until ${SCHEDULE.until}`, forceStatus:'busy', focus:true };
  if (s.games)   return { text:'🎮 Playing: Chess · Rapid 10+0', forceStatus:null, focus:false };
  if (s.music)   return { text:'🎵 Listening to: “Midnight Compile” by The Semicolons', forceStatus:null, focus:false };
  return null;
}
function effectiveStatus(){ const sm = smartStatus(); return (sm && sm.forceStatus) || state.me.status; }
function inFocus(){ const sm = smartStatus(); return effectiveStatus() === 'busy' || (sm && sm.focus); }

/* ---------- 2. Respectful BUZZ ---------- */
const BUZZ_LIMIT = 3, BUZZ_WINDOW = 60e3;
function canBuzz(){
  const t = Date.now(); state.buzzLog = state.buzzLog.filter(x => t - x < BUZZ_WINDOW);
  return state.buzzLog.length < BUZZ_LIMIT;
}
function beep(){
  try{
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    [0, .12, .24].forEach((d, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = i % 2 ? 520 : 760;
      g.gain.setValueAtTime(.06, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + d + .1);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + .11);
    });
  }catch(e){}
}
function shake(){ const w = document.querySelector('.chatwin'); if (!w) return; w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }

function sendBuzz(){
  const b = buddyById(state.active);
  if (!canBuzz()){ toast(`Easy lang 😅 Buzz limit is ${BUZZ_LIMIT} per minute.`); return; }
  if (b.id === 'nina'){ /* adviser has "no buzz" setting */ }
  state.buzzLog.push(Date.now());
  chats[b.id].push({ sys:true, buzz:true, text:'You sent a BUZZ!!!' });
  beep(); renderChat(); shake();
  botReply(b, 'buzz');
}
function incomingBuzz(id){
  const b = buddyById(id);
  if (inFocus()){
    state.heldBuzzes.push({ from:b.name, t:now() });
    chats[id].push({ sys:true, text:`${b.name} tried to BUZZ you. It was held because you're in Focus mode.` });
    if (state.active !== id || state.tab !== 'messenger') unread[id] = (unread[id] || 0) + 1;
    renderTabs();
    if (state.tab === 'messenger'){ renderSidebar(); renderMsgs(); }
    toast(`🔕 BUZZ from ${b.name} held (Focus mode)`);
    return;
  }
  chats[id].push({ sys:true, buzz:true, text:`${b.name}: BUZZ!!!` });
  if (state.active !== id) unread[id] = (unread[id] || 0) + 1;
  state.tab = 'messenger'; state.active = id; unread[id] = 0;
  renderAll(); beep(); shake();
}

/* ---------- 3. Buddies + bridge bots ---------- */
const buddyById = id => buddies.find(b => b.id === id);
function intent(text){
  const t = text.toLowerCase();
  if (/^(hi|hello|hey|uy|yo|musta|kumusta|good (morning|afternoon|evening))\b/.test(t)) return 'greet';
  if (/thesis|chapter|defense|survey|adviser/.test(t)) return 'thesis';
  return 'def';
}
let typingTimer;
function botReply(b, kind){
  const pool = b.replies[kind] || b.replies.def;
  const reply = pool[Math.floor(Math.random() * pool.length)];
  const delay = (b.status === 'away' ? 2600 : 1200) + Math.random() * 900;
  clearTimeout(typingTimer);
  if (state.active === b.id) $('typing') && ($('typing').textContent = `${b.name} is typing…`);
  setTimeout(() => {
    chats[b.id].push({ from:'them', text:reply, t:now() });
    if (state.active !== b.id || state.tab !== 'messenger') unread[b.id] = (unread[b.id] || 0) + 1;
    if (state.tab === 'messenger'){ renderSidebar(); if (state.active === b.id){ $('typing').textContent = ''; renderMsgs(); } }
    renderTabs();
  }, delay);
}
function sendMsg(text){
  const b = buddyById(state.active);
  chats[b.id].push({ from:'me', text, t:now(), via:b.platform });
  renderMsgs();
  if (b.status !== 'invisible' || b.id === 'nina') botReply(b, intent(text));
}

/* ---------- 4. AI Room Guard (rule-based scoring classifier) ---------- */
const RULES = [
  { id:'link',    w:30, why:'Shortened or unknown link',      test:t => /(bit\.ly|tinyurl|t\.co\/|\.xyz|\.top|https?:\/\/)/i.test(t) },
  { id:'prize',   w:20, why:'Prize / giveaway language',      test:t => /\b(won|winner|prize|claim|congrats|congratulations|free|reward|giveaway)\b/i.test(t) },
  { id:'money',   w:20, why:'Money or e-wallet bait',         test:t => /\b(gcash|maya|e-?wallet|bank|cash ?out|load|\d+k|php ?\d|₱ ?\d)/i.test(t) },
  { id:'secret',  w:35, why:'Asks for OTP, PIN or password',  test:t => /\b(otp|pin|password|verification code)\b/i.test(t) },
  { id:'urgent',  w:15, why:'Creates urgency',                test:t => /\b(now|urgent|asap|hurry|today only|limited|last chance)\b/i.test(t) },
  { id:'toxic',   w:50, why:'Insult or toxic language',       test:t => /\b(bobo|tanga|stupid|idiot|loser|gago)\b/i.test(t) },
  { id:'caps',    w:10, why:'Mostly ALL CAPS (shouting)',     test:t => { const L = t.replace(/[^a-z]/gi,''); return L.length > 10 && L.replace(/[^A-Z]/g,'').length / L.length > .7; } },
  { id:'flood',   w:8,  why:'Repeated characters (flooding)', test:t => /(.)\1{5,}/.test(t) },
];
function moderate(text){
  const hits = RULES.filter(r => r.test(text));
  const score = Math.min(100, hits.reduce((s, r) => s + r.w, 0));
  return { score, hits, level: score >= 50 ? 'block' : score >= 25 ? 'warn' : 'ok' };
}
const ROOM_SCRIPT = [
  ['kael_dev','Anyone here taking Automata this sem? :)'],
  ['jen.codes','Me! The pumping lemma is destroying me =))'],
  ['PROMO_PH_88','CONGRATS!!! You WON ₱50,000 GCash! Claim NOW at bit.ly/gcash-claim-ph'],
  ['kael_dev','Same. Anyone have a good video on it?'],
  ['rhea','Try the Neso Academy playlist, super clear'],
  ['support_team01','Hi this is GCash support, your account will be locked. Send your OTP to verify urgent'],
  ['jen.codes','Thank you!! Will watch tonight ;)'],
  ['xXnoobslayerXx','kael ur so bobo lol'],
  ['mod_bot','Reminder: be kind. No personal info in public rooms.'],
  ['paolo','Is there a study group for the hackathon? I need teammates for the AI category'],
  ['rhea','@paolo I’m in! I do frontend, React mostly'],
  ['free_load_now','FREE 10k LOAD today only!!! hurry click tinyurl.com/loadfree'],
  ['kael_dev','@paolo me too, I can handle the backend :D'],
  ['paolo','Nice, let’s make a group chat later'],
  ['tita_rose','HELLOOOOOOO EVERYONE GOOD MORNINGGGGG'],
  ['jen.codes','Good morning tita hahaha'],
];
function pushRoom(user, text, mine){
  const mod = moderate(text);
  const id = 'r' + (++state.room.stats.seen);
  if (mod.level === 'warn') state.room.stats.warned++;
  if (mod.level === 'block') state.room.stats.blocked++;
  state.room.msgs.push({ id, user, text, mod, mine, t:now() });
  if (state.room.msgs.length > 60) state.room.msgs.shift();
}
let roomTimer;
function startRoom(){
  clearInterval(roomTimer);
  roomTimer = setInterval(() => {
    if (state.room.paused) return;
    const [u, t] = ROOM_SCRIPT[state.room.i % ROOM_SCRIPT.length]; state.room.i++;
    pushRoom(u, t);
    if (state.tab === 'room') renderRoomFeed();
  }, 2600);
}

/* ---------- 5. Catch Me Up (group chat summary) ---------- */
const GROUP = [
  ['Bea','Guys update: na-send ko na yung survey results sa drive 📊'],
  ['Jopet','nice one bea'],
  ['Mika','Okay so for the defense, Ms. Nina said the deadline for Chapter 1-3 revisions is Friday 5PM'],
  ['Carlo','Ay Friday na pala 😱'],
  ['Mika','Yes kaya let’s divide. Who handles the RRL fixes?'],
  ['Bea','Ako na sa RRL, I’ll finish by Wednesday'],
  ['Jopet','ako na sa system architecture diagram'],
  ['Mika','@You can you do the intro and the objectives? Kasi ikaw nag-draft dati'],
  ['Carlo','haha si @You talaga sa intro'],
  ['Jopet','lol'],
  ['Mika','Also we decided to go with Firebase instead of MySQL for the backend, final na yan'],
  ['Bea','Agreed! Mas madali for realtime'],
  ['Carlo','Ok game'],
  ['Jopet','meeting tayo tomorrow 7PM sa Discord?'],
  ['Mika','Sige 7PM tomorrow, Discord voice'],
  ['Carlo','Wait may quiz pala tayo sa Algo on Thursday diba'],
  ['Bea','Yes Thursday, chapters 4-6'],
  ['Jopet','rip'],
  ['Mika','@You please confirm if kaya mo yung intro by Thursday night para ma-compile ko'],
  ['Carlo','meme time 🐸'],
  ['Jopet','=))'],
  ['Bea','Focus guys hahaha'],
];
const STOP = new Set('the a an and or to of for is are was be it in on at by with yes ok okay na sa ng ang yung kasi pala diba lang ako ikaw si lol haha you we let guys can if so also may tayo nag mo kaya para please monday tuesday wednesday thursday friday saturday sunday tomorrow tonight'.split(' '));
function summarize(msgs){
  const s = { deadlines:[], decisions:[], tasks:[], mentions:[], keywords:[] , skipped:0 };
  const DATE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|\d{1,2}(:\d{2})?\s?(am|pm))\b/i;
  const DECIDE = /\b(decided|final|agreed|go with|we'll use|let's use)\b/i;
  const TASK = /\b(ako na|i'll|i will|ako bahala|i can handle|handles?)\b/i;
  const NOISE = /^(lol|rip|nice one.*|ok game|=\)\)|haha.*|meme.*)$/i;
  const freq = {};
  msgs.forEach(([who, text]) => {
    if (NOISE.test(text.trim())) { s.skipped++; return; }
    if (/@you\b/i.test(text)) s.mentions.push([who, text]);
    if (DECIDE.test(text)) s.decisions.push([who, text]);
    if (TASK.test(text) && !/\?$/.test(text.trim())) s.tasks.push([who, text]);
    if (DATE.test(text)) s.deadlines.push([who, text]);
    (text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(w => !STOP.has(w)).forEach(w => freq[w] = (freq[w] || 0) + 1);
  });
  s.keywords = Object.entries(freq).filter(([,n]) => n > 1).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([w]) => w);
  return s;
}
const hl = t => emojify(t).replace(/@You/g, '<span class="hl">@You</span>')
  .replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|tomorrow|\d{1,2}(:\d{2})?\s?(AM|PM))\b/g, '<b>$1</b>');

/* ---------- Rendering ---------- */
function renderTabs(){
  const totalUnread = Object.values(unread).reduce((a,b) => a+b, 0);
  const T = [['messenger','💬 Messenger', totalUnread],['room','🛡️ Chat Room', null],['catchup','⚡ Catch Me Up', state.catchup.read ? 0 : GROUP.length],['about','📄 About the Project', null]];
  $('tabs').innerHTML = T.map(([k,l,n]) => `<button class="tab ${state.tab===k?'on':''}" data-tab="${k}">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('');
}
function avatar(name, color, status, size){
  return `<div class="avatar" style="background:${color}${size?`;width:${size}px;height:${size}px`:''}">${esc(name[0])}${status?`<span class="dot st-${status}"></span>`:''}</div>`;
}
function renderAll(){ renderTabs(); renderView(); }
function renderView(){
  const v = $('view');
  if (state.tab === 'messenger'){
    v.innerHTML = `<div class="grid"><aside class="panel pad" id="side"></aside><section class="panel chatwin" id="chat"></section></div>`;
    renderSidebar(); renderChat();
  } else if (state.tab === 'room') renderRoom(v);
  else if (state.tab === 'catchup') renderCatchup(v);
  else renderAbout(v);
}

function renderSidebar(){
  const side = $('side'); if (!side) return;
  const sm = smartStatus(), st = effectiveStatus();
  const groups = ['Friends','Classmates'];
  side.innerHTML = `
    <h3 class="sec">My status</h3>
    <div class="me">${avatar('Y', '#3b2a8f', st)}
      <div style="flex:1;min-width:0"><div style="font-weight:800">${esc(state.me.name)}</div>
        <select id="statusSel" style="margin-top:4px;padding:3px 6px;font-size:13px" ${sm && sm.forceStatus ? 'disabled title="Set automatically by Smart Status"' : ''}>
          ${['available','busy','away','invisible'].map(s => `<option value="${s}" ${st===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}
        </select></div></div>
    ${sm ? `<div class="smart">⚡ ${esc(sm.text)}${sm.focus ? '<br><b>Focus mode on:</b> BUZZes are held until class ends.' : ''}</div>`
         : `<input type="text" id="customMsg" value="${esc(state.me.custom)}" style="width:100%;margin-top:8px;font-size:13px" aria-label="Status message">`}
    ${state.heldBuzzes.length ? `<div class="smart" style="background:#fff7df;border-color:#f0d27a;color:#7a5300">🔕 ${state.heldBuzzes.length} BUZZ held: ${state.heldBuzzes.map(b=>esc(b.from)).join(', ')} <button class="btn small" id="clearHeld" style="margin-top:4px">Show them</button></div>` : ''}

    <h3 class="sec">Smart Status integrations</h3>
    <label class="toggle"><input type="checkbox" data-smart="classes" ${state.smart.classes?'checked':''}><span>Class schedule<small>Auto-busy + Focus during class</small></span></label>
    <label class="toggle"><input type="checkbox" data-smart="music" ${state.smart.music?'checked':''}><span>Music player<small>Shows what you're listening to</small></span></label>
    <label class="toggle"><input type="checkbox" data-smart="games" ${state.smart.games?'checked':''}><span>Games<small>Shows the game you're playing</small></span></label>

    ${groups.map(g => `<h3 class="sec">${g}</h3>` + buddies.filter(b => b.group === g).map(b => `
      <button class="buddy ${state.active===b.id?'on':''}" data-buddy="${b.id}">
        ${avatar(b.name, b.color, b.status)}
        <div style="min-width:0"><div class="nm">${esc(b.name)} <span class="badge ${PLATFORM[b.platform].cls}">${PLATFORM[b.platform].label}</span></div>
        <div class="sm">${b.status==='invisible' ? '<i>Offline</i>' : esc(b.msg)}</div></div>
        ${unread[b.id] ? `<span class="unread">${unread[b.id]}</span>` : ''}
      </button>`).join('')).join('')}
    <p style="font-size:12px;color:var(--muted);margin:10px 0 0">Tip: Jopet will BUZZ you soon. Turn on <b>Class schedule</b> first to see Focus mode hold it.</p>`;
}

function renderChat(){
  const c = $('chat'); if (!c) return;
  const b = buddyById(state.active), p = PLATFORM[b.platform];
  c.innerHTML = `
    <div class="chat-head">${avatar(b.name, b.color, b.status)}
      <div><div class="nm">${esc(b.name)}</div><div class="sm">${b.status==='invisible'?'Offline':esc(b.msg)}</div></div>
      <div class="bridge-note"><span class="badge ${p.cls}">${p.label}</span><br>${p.note}</div></div>
    <div class="msgs" id="msgs"></div>
    <div class="typing" id="typing"></div>
    <form class="composer" id="composer">
      <input type="text" id="msgIn" placeholder="Type a message… try :) :D =)) <3" autocomplete="off" aria-label="Message">
      <button type="button" class="btn buzzbtn" id="buzzBtn" title="Send a BUZZ">BUZZ!</button>
      <button class="btn primary">Send</button>
    </form>
    <div class="emo-hint">Classic shortcodes work: <code>:)</code> <code>:D</code> <code>=))</code> <code>;)</code> <code>:P</code> <code>&lt;3</code> · BUZZ limit: ${BUZZ_LIMIT}/min</div>`;
  renderMsgs();
  $('composer').onsubmit = e => { e.preventDefault(); const v = $('msgIn').value.trim(); if (!v) return; $('msgIn').value = ''; sendMsg(v); };
  $('buzzBtn').onclick = sendBuzz;
  $('msgIn').focus();
}
function renderMsgs(){
  const box = $('msgs'); if (!box) return;
  const b = buddyById(state.active);
  box.innerHTML = chats[b.id].map(m => m.sys
    ? `<div class="sys ${m.buzz?'buzz':''}">${esc(m.text)}</div>`
    : `<div class="m ${m.from}">${emojify(m.text)}<span class="t">${m.t}${m.from==='me' ? ' · ' + (m.via==='native' ? '🔒 encrypted' : 'via ' + PLATFORM[m.via].label) : ''}</span></div>`).join('')
    || `<div class="sys">Say hi to ${esc(b.name)}!</div>`;
  box.scrollTop = box.scrollHeight;
}

function renderRoom(v){
  const s = state.room.stats;
  v.innerHTML = `<div class="room">
    <section class="panel" style="display:flex;flex-direction:column;height:calc(100vh - 120px);min-height:520px">
      <div class="chat-head"><div><div class="nm"># CS Lounge (public room)</div><div class="sm">Yahoo's public chat rooms closed in 2012. This version brings them back with an AI Room Guard.</div></div>
        <button class="btn small" id="pauseBtn" style="margin-left:auto">${state.room.paused?'▶ Resume':'⏸ Pause'}</button></div>
      <div class="msgs" id="roomFeed" style="gap:4px"></div>
      <form class="composer" id="roomForm"><input type="text" id="roomIn" placeholder="Say something… try typing a phone number like 09171234567" autocomplete="off" aria-label="Room message"><button class="btn primary">Send</button></form>
    </section>
    <aside class="panel pad">
      <h3 class="sec">Room Guard stats</h3>
      <div id="roomStats"></div>
      <h3 class="sec">How a message is scored</h3>
      ${RULES.map(r => `<div class="rule"><span>${esc(r.why)}</span><span>+${r.w}</span></div>`).join('')}
      <p style="font-size:12.5px;color:var(--muted)">Score ≥ 50 is hidden as a likely scam or abuse. 25 to 49 gets a warning label. The rules are tuned for common Philippine scams (fake GCash, free load, OTP requests).</p>
    </aside></div>`;
  renderRoomFeed();
  $('pauseBtn').onclick = () => { state.room.paused = !state.room.paused; renderRoom($('view')); };
  $('roomForm').onsubmit = e => {
    e.preventDefault(); const t = $('roomIn').value.trim(); if (!t) return;
    const send = () => { pushRoom('you', t, true); $('roomIn').value = ''; renderRoomFeed(); };
    if (/(^|\D)(09\d{9}|\+?639\d{9})(\D|$)/.test(t.replace(/(\d)[\s-]+(?=\d)/g,'$1'))){
      openModal('Share your number publicly?', 'This is a public room with strangers. Room Guard recommends sending your number by private message instead.', send);
    } else send();
  };
}
function renderRoomFeed(){
  const f = $('roomFeed'); if (!f) return;
  const s = state.room.stats;
  f.innerHTML = state.room.msgs.map(m => {
    const why = m.mod.hits.map(h => h.why).join(' · ');
    if (m.mod.level === 'block' && !state.room.showHidden[m.id])
      return `<div class="rm block"><span>🛡️</span><div><b>Hidden by Room Guard</b> (score ${m.mod.score}) from ${esc(m.user)}<span class="why">${esc(why)}</span>
        <button class="btn small" data-reveal="${m.id}" style="margin-top:4px">Show anyway</button></div></div>`;
    return `<div class="rm ${m.mod.level==='warn'?'warn':m.mod.level==='block'?'block':''}">
      <div><b style="color:${m.mine?'var(--brand-2)':'inherit'}">${esc(m.user)}:</b> ${emojify(m.text)}
      ${m.mod.level !== 'ok' ? `<span class="why flag">⚠️ ${m.mod.level==='block'?'Likely scam/abuse':'Be careful'} (score ${m.mod.score}): ${esc(why)}</span>` : ''}</div></div>`;
  }).join('') || '<div class="sys">Joining room…</div>';
  f.scrollTop = f.scrollHeight;
  const st = $('roomStats');
  if (st) st.innerHTML = `<div class="stat"><span>Messages checked</span><b>${s.seen}</b></div><div class="stat"><span>Warned</span><b>${s.warned}</b></div><div class="stat"><span>Hidden</span><b>${s.blocked}</b></div>`;
}

function renderCatchup(v){
  const s = state.catchup.summary;
  const li = arr => arr.length ? `<ul>${arr.map(([w,t]) => `<li><b>${esc(w)}:</b> ${hl(t)}</li>`).join('')}</ul>` : '<p style="margin:0;font-size:14px;color:var(--muted)">None found.</p>';
  v.innerHTML = `<div class="grid" style="grid-template-columns:1fr 1fr">
    <section class="panel pad">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div><div style="font-weight:800;font-size:17px">👥 CS 3A Thesis Group</div><div style="font-size:13px;color:var(--muted)">${GROUP.length} unread messages while you were in class</div></div>
        <button class="btn primary" id="catchBtn" style="margin-left:auto">⚡ Catch me up</button></div>
      <div style="max-height:calc(100vh - 210px);overflow:auto">${GROUP.map(([w,t]) => `<div class="gm"><b>${esc(w)}:</b> ${hl(t)}</div>`).join('')}</div>
    </section>
    <section>
      ${s ? `<div class="sum">
        <h4>🙋 Mentions you (${s.mentions.length})</h4>${li(s.mentions)}
        <h4>✅ Decisions</h4>${li(s.decisions)}
        <h4>📅 Dates and deadlines</h4>${li(s.deadlines)}
        <h4>🧩 Who's doing what</h4>${li(s.tasks)}
        <h4>🏷️ Main topics</h4><div>${s.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</div>
        <p style="font-size:12.5px;color:var(--muted);margin:12px 0 0">${GROUP.length} messages scanned · ${s.skipped} filler messages (lol, rip, memes) skipped. Rule-based extraction, runs on your device.</p>
      </div>
      <div class="panel pad"><b>Quick reply</b><p style="font-size:14px;margin:6px 0 10px;color:var(--muted)">Suggested from the mentions:</p>
        <button class="btn small" data-qr="Yes kaya ko yung intro and objectives by Thursday night 👍">“Yes, kaya ko by Thursday night 👍”</button>
        <button class="btn small" data-qr="Pwede ko i-send by Friday morning instead?" style="margin-top:6px">“Pwede Friday morning instead?”</button></div>`
      : `<div class="panel pad" style="text-align:center;color:var(--muted);padding:40px 20px">Press <b>⚡ Catch me up</b> to turn ${GROUP.length} messages into a 30-second summary.</div>`}
    </section></div>`;
  $('catchBtn').onclick = () => { state.catchup.summary = summarize(GROUP); state.catchup.read = true; renderAll(); };
}

function renderAbout(v){
  v.innerHTML = `<div class="about panel pad" style="padding:24px 28px">
  <h2>BuzzBack: Reviving Yahoo Messenger</h2>
  <p style="color:var(--muted);margin-top:0">Proof-of-concept for an Integrative Programming activity · BSCS</p>

  <h3>1. The dead app</h3>
  <p><b>Yahoo Messenger (Y!M)</b> was one of the first popular instant messengers. For many Filipinos in the 2000s it was <i>the</i> way to chat in internet cafés: buddy lists, status messages, public chat rooms, and the famous <b>BUZZ!</b> that shook your friend's chat window.</p>
  <div class="timeline">
    <div class="tl"><b>1998</b>Launched as Yahoo! Pager</div>
    <div class="tl"><b>1999</b>Renamed Yahoo! Messenger</div>
    <div class="tl"><b>2012</b>Public chat rooms closed</div>
    <div class="tl"><b>2015</b>Rebuilt as a new mobile-first app</div>
    <div class="tl dead"><b>Jul 17, 2018</b>Shut down for good</div>
    <div class="tl dead"><b>2019</b>Replacement app Yahoo Together also shut down</div>
  </div>

  <h3>2. Why it died</h3>
  <ul>
    <li><b>Late move to mobile:</b> users moved to apps built for phones (Facebook Messenger, Viber, WhatsApp).</li>
    <li><b>Closed system:</b> it couldn't talk to the platforms where people's friends now were.</li>
    <li><b>Spam and scams:</b> public chat rooms filled with bots and abuse, which is why they were closed.</li>
    <li><b>Few new features:</b> it stopped adding anything people couldn't get elsewhere.</li>
  </ul>

  <h3>3. Proposed integrations and features</h3>
  <table><thead><tr><th>Old feature / problem</th><th>New integration</th><th>In this demo</th></tr></thead><tbody>
    <tr><td>Status message (manual)</td><td><b>Smart Status</b> from class schedule, music player and games</td><td>Toggles in the sidebar. Class schedule sets you to Busy automatically.</td></tr>
    <tr><td>BUZZ! (fun but annoying)</td><td><b>Respectful BUZZ</b>: 3 per minute, held during Focus or class</td><td>Window shake + sound. Jopet buzzes you ~15s after loading.</td></tr>
    <tr><td>Closed network</td><td><b>Bridges</b> to Discord, Telegram and SMS (e.g. via the open Matrix protocol)</td><td>Buddies show a platform badge, and messages show the route they took</td></tr>
    <tr><td>Chat rooms ruined by spam</td><td><b>AI Room Guard</b>: scores every message for scams, toxicity and flooding</td><td>Chat Room tab with live scoring and a privacy warning for phone numbers</td></tr>
    <tr><td>Offline messages</td><td><b>Catch Me Up</b>: summarizes unread group chats</td><td>Pulls out mentions, decisions, deadlines and tasks</td></tr>
    <tr><td>No privacy features</td><td><b>End-to-end encryption</b> for native chats</td><td>Shown as a 🔒 label (not actually implemented in the demo)</td></tr>
  </tbody></table>

  <h3>4. System architecture</h3>
  <div class="arch">
    <div class="col"><div class="box">Google Calendar / class schedule</div><div class="box">Music player</div><div class="box">Game launcher</div></div>
    <div class="arrow">presence API →</div>
    <div class="col"><div class="box core">BuzzBack server</div><div class="box">Presence + Focus engine</div><div class="box">Room Guard (NLP)</div><div class="box">Summarizer</div></div>
    <div class="arrow">← bridges →</div>
    <div class="col"><div class="box">Discord</div><div class="box">Telegram</div><div class="box">SMS gateway</div></div>
  </div>

  <h3>5. Scope and limitations</h3>
  <ul>
    <li>All buddies, rooms and messages are fictional and scripted. Buddies reply with simple keyword-based bots.</li>
    <li>Bridges, encryption and calendar sync are simulated in the UI. A real build needs a backend (e.g. Node.js + WebSockets) and the official platform APIs.</li>
    <li>Room Guard and Catch Me Up use rule-based NLP (keyword scoring and regex). They could later be upgraded to a trained classifier or a language model.</li>
    <li>BuzzBack is an original student concept and is not affiliated with Yahoo.</li>
  </ul>

  <h3>6. Tech used</h3>
  <p>HTML, CSS, vanilla JavaScript, Web Audio API (BUZZ sound), CSS keyframe animation (window shake), regex-based classification and extraction.</p>
  </div>`;
}

/* ---------- Modal ---------- */
let modalYes = null;
function openModal(title, body, onYes){ $('mT').textContent = title; $('mB').textContent = body; modalYes = onYes; $('modal').classList.add('show'); }
$('mNo').onclick = () => $('modal').classList.remove('show');
$('mYes').onclick = () => { $('modal').classList.remove('show'); modalYes && modalYes(); };

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-buddy],[data-reveal],[data-qr],#clearHeld');
  if (!t) return;
  if (t.dataset.tab){ state.tab = t.dataset.tab; renderAll(); }
  else if (t.dataset.buddy){ state.active = t.dataset.buddy; unread[state.active] = 0; renderSidebar(); renderChat(); renderTabs(); }
  else if (t.dataset.reveal){ state.room.showHidden[t.dataset.reveal] = true; renderRoomFeed(); }
  else if (t.dataset.qr){ toast('Reply sent to CS 3A Thesis Group'); t.disabled = true; t.textContent = '✓ Sent'; }
  else if (t.id === 'clearHeld'){ const list = state.heldBuzzes.map(b => `${b.from} (${b.t})`).join(', '); state.heldBuzzes = []; renderSidebar(); toast('Held BUZZes: ' + list); }
});
document.addEventListener('change', e => {
  if (e.target.dataset.smart){
    state.smart[e.target.dataset.smart] = e.target.checked;
    const sm = smartStatus();
    if (e.target.dataset.smart === 'classes' && !e.target.checked && state.heldBuzzes.length) toast(`Class over! You have ${state.heldBuzzes.length} held BUZZ.`);
    else if (sm) toast('Status updated: ' + sm.text);
    renderSidebar();
  }
  if (e.target.id === 'statusSel'){ state.me.status = e.target.value; renderSidebar(); }
});
document.addEventListener('input', e => { if (e.target.id === 'customMsg') state.me.custom = e.target.value; });

/* ---------- Boot ---------- */
ROOM_SCRIPT.slice(0, 4).forEach(([u, t]) => { pushRoom(u, t); state.room.i++; });
startRoom();
renderAll();
setTimeout(() => incomingBuzz('jopet'), 15000);