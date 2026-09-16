const data = window.FiestaV2Data;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const image = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
const profileStorageKey = 'fiesta-v2-profile-v3';
const defaultProfile = {name:'Hugo',contact:'',song:'Fiebre',plan:'Bailar',arrival:'Conocer gente',role:'Bailo todo'};
const profileOptions = {
  plan:['Bailar','Charlar','Previa','Improvisar'],
  arrival:['Conocer gente','A mi ritmo'],
  role:['Rompehielos','Bailo todo','Monto el plan','Conozco a todo el mundo']
};
const planMeta = {
  Bailar:{slug:'bailar',kicker:'PISTA ABIERTA',short:'RITMO',note:'Muévete, canta y encuentra tu siguiente canción.',description:'Un plan para entrar en calor sin pensarlo demasiado. Gente que quiere bailar y dejarse llevar por la pista.',tags:['Pista','Ritmo','Sin parar'],symbol:'✦'},
  Charlar:{slug:'charlar',kicker:'TERRAZA',short:'HABLAR',note:'Una conversación puede ser el mejor plan.',description:'Para quienes prefieren una copa tranquila, buenas historias y conocer a alguien sin gritar por encima de la música.',tags:['Terraza','Copas','Historias'],symbol:'◌'},
  Previa:{slug:'previa',kicker:'ANTES DE SALIR',short:'PREVIA',note:'Empieza suave. La noche ya decidirá.',description:'El punto de encuentro para arrancar la noche, compartir canciones y decidir juntos hacia dónde seguir.',tags:['Calentar','Playlist','Primeras risas'],symbol:'◒'},
  Improvisar:{slug:'improvisar',kicker:'SIN GUIÓN',short:'LIBRE',note:'Cruza la sala y sigue lo que apetezca.',description:'No hace falta traer un plan cerrado. Entra, mira quién está y elige el siguiente paso sobre la marcha.',tags:['Libre','Descubrir','Ahora'],symbol:'↗'}
};
const crewCoverThemes = ['crew-cover-citrus','crew-cover-violet','crew-cover-sunset','crew-cover-mint'];
const crewFallbackPhotos = ['photo-1529156069898-49953e39b3ac','photo-1511632765486-a01980e01a18','photo-1527529482837-4698179dc6ce','photo-1506869640319-fe1a24fd76dc'];
let showAll = false;
let toastTimer;
let renderedGroups = [];
let profileReturn = {screen:'room',scroll:0,focus:null};
let planReturn = {screen:'room',scroll:0};
let activePerson = null;
let pendingDrink = null;
let photoSlot = null;
const sentDrinks = new Set();
const crewRequests = new Set();
let storedProfile = null;
try { storedProfile = JSON.parse(localStorage.getItem(profileStorageKey) || 'null'); } catch {}
const state = { profileViews:12, greetings:new Set(), messages:[...data.messages], activeChat:null, activeGroupChat:null, joinedGroups:new Set(), groupRequests:new Map(), groupChats:{}, myPhotos:Array.isArray(storedProfile?.photos)?storedProfile.photos.slice(0,3):[], profile:{...defaultProfile,...storedProfile?.profile}, receivedGreetings:[{personId:'lucia',time:'Ahora'},{personId:'dani',time:'8 min'}], invitations:[{personId:'zoe',type:'crew',copy:'Te ha invitado a unirte a Terraza abierta'},{personId:'pau',type:'round',copy:'Ha propuesto una ronda para su crew'}], crew:{name:'',phrase:'',members:[],saved:false,plan:'',photo:null}, crewQuery:'' };
if(!profileOptions.arrival.includes(state.profile.arrival))state.profile.arrival=state.profile.arrival==='Con ganas de conocer gente'?'Conocer gente':'A mi ritmo';
const encounterMemory = new Map([
  ['lucia',{times:2,last:'MARMarela en abril',greeted:true}],
  ['dani',{times:3,last:'Dome en junio',greeted:true,drink:'amistoso'}],
  ['sara',{times:1,last:'la última fiesta',drink:'rompehielos'}]
]);

function showToast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('is-visible'), 2800);
}
function persistProfile() {
  try {
    localStorage.setItem(profileStorageKey, JSON.stringify({profile:state.profile,photos:state.myPhotos}));
  } catch {
    showToast('No hay espacio suficiente para guardar más fotos.');
  }
}
function avatar(letter) { return `<i>${letter}</i>`; }
function rankedProfiles() {
  return data.profiles.map((person,index)=>({...person,_score:compatibilityScore(person),_index:index})).sort((a,b)=>b._score-a._score||a._index-b._index);
}
function isOpenToAnyone(person) {
  return ['Conocer gente','Con ganas de conocer gente'].includes(person.arrival);
}
function crewFor(person) {
  const me=person===state.profile||person.isMe;
  if(state.crew.saved&&(me||state.crew.members.includes(person.id)))return {id:'my-crew',...state.crew};
  return data.crews.find(crew=>me?state.joinedGroups.has(crew.id):crew.memberIds.includes(person.id))||null;
}
function socialStatus(person) {
  return `${crewFor(person)?'En crew':'Sin crew'}${isOpenToAnyone(person)?' · Conocer gente':''}`;
}
function isCompatible(person) {
  return isOpenToAnyone(person)||isOpenToAnyone(state.profile)||Boolean(crewFor(person))===Boolean(crewFor(state.profile));
}
function compatibilityScore(person) {
  let score=person.plan===state.profile.plan?4:0;
  if(isCompatible(person))score+=3;
  if(person.role===state.profile.role)score+=1;
  return score;
}
function circleSignals(person) {
  const memory=encounterMemory.get(person.id)||{};
  const signals=[];
  if(memory.times>1) signals.push(`Os cruzasteis en ${memory.times} fiestas`);
  else if(memory.times===1) signals.push(`Coincidisteis en ${memory.last}`);
  if(memory.greeted||state.greetings.has(person.id)) signals.push('Ya os saludasteis');
  if(memory.drink||[...sentDrinks].some(key=>key.startsWith(`${person.id}:`))) signals.push(memory.drink==='amistoso'?'Hubo un chupito amistoso':'Hubo una invitación de chupitos');
  if(person.plan===state.profile.plan) signals.push(`Mismo plan: ${person.plan}`);
  if(isCompatible(person)) signals.push(isOpenToAnyone(person)?'Le apetece conocer gente':'Encaja con cómo vienes');
  if(person.role===state.profile.role) signals.push(`También es ${person.role.toLowerCase()}`);
  return signals;
}
function crewFace(person,index) {
  const photo=person.isMe?primaryPhoto():image(person.photo);
  return `<i class="member-${index+1} crew-face${photo?'':' is-placeholder'}" ${photo?`style="background-image:url('${photo}')"`:''} aria-label="${person.isMe?'Tú':person.name}">${photo?'':(person.isMe?'TÚ':person.name.slice(0,2))}</i>`;
}
function personCard(person, index) {
  return `<button class="mosaic-person mosaic-${index + 1}" data-person="${person.id}"><img src="${image(person.photo)}" alt="Foto de ${person.name}" referrerpolicy="no-referrer"><span></span><b>${person.name}</b></button>`;
}
function buildCrews(ranked) {
  const crews=data.crews.map(crew=>({
    ...crew,
    status:'Acepta solicitudes',
    photo:null,
    members:crew.memberIds.map(id=>ranked.find(person=>person.id===id)).filter(Boolean)
  }));
  if(state.crew.saved)crews.unshift({
    id:'my-crew',
    name:state.crew.name,
    phrase:state.crew.phrase,
    plan:state.crew.plan||'',
    status:state.crew.plan?`Va a ${state.crew.plan}`:'Sin plan común',
    photo:state.crew.photo,
    members:state.crew.members.map(id=>ranked.find(person=>person.id===id)).filter(Boolean)
  });
  return crews;
}
function crewCoverTheme(group) {
  const source=String(group.id||group.name||'crew');
  const score=[...source].reduce((total,char)=>total+char.charCodeAt(0),0);
  return crewCoverThemes[score%crewCoverThemes.length];
}
function crewFallbackPhoto(group) {
  const source=String(group.id||group.name||'crew');
  const score=[...source].reduce((total,char)=>total+char.charCodeAt(0),0);
  return crewFallbackPhotos[score%crewFallbackPhotos.length];
}
function renderRoom() {
  const ranked=rankedProfiles();
  const visible = showAll ? ranked : ranked.slice(0,5);
  $('#profile-mosaic').innerHTML = visible.map(personCard).join('');
  $('#show-all').classList.toggle('is-hidden', ranked.length <= 5);
  $('#show-all').textContent = showAll ? 'Ver menos gente' : `Ver a ${ranked.length - 5} personas más`;
  $('#arrival-row').innerHTML = ranked.slice(5).map(person => `<button data-person="${person.id}"><span><img src="${image(person.photo)}" alt="${person.name}" referrerpolicy="no-referrer"></span><b>${person.name}</b></button>`).join('');
  const plans=profileOptions.plan;
  $('#plan-groups').innerHTML=plans.map(plan=>{
    const meta=planMeta[plan];
    const total=ranked.filter(person=>person.plan===plan).length;
    const inside=state.profile.plan===plan;
    const label=inside?'TU PLAN':'PLAN';
    const count=`${total} ${total===1?'persona':'personas'} dentro`;
    return `<article class="plan-group${inside?' is-joined':''}"><button class="plan-group-open" type="button" data-plan="${escapeHtml(plan)}" aria-label="Abrir el plan ${escapeHtml(plan)}"><span class="plan-group-art plan-art-${meta.slug}" aria-hidden="true"><b>${meta.symbol}</b><i>${meta.short}</i></span><span class="plan-group-kicker">${label}</span><strong>${escapeHtml(plan)}</strong><small>${count}</small>${inside?'<b class="plan-group-joined">DENTRO</b>':''}<i class="plan-group-arrow" aria-hidden="true">↗</i></button></article>`;
  }).join('');
  renderedGroups=buildCrews(ranked);
  const movingGroups=[...renderedGroups,...renderedGroups];
  $('#group-track').innerHTML=movingGroups.map((group,index)=>{const plan=planMeta[group.plan]||planMeta.Improvisar;const count=group.id==='my-crew'?group.members.length+1:group.members.length;const duplicate=index>=renderedGroups.length?' aria-hidden="true" tabindex="-1"':'';return `<button class="group-card group-card-${(index%3)+1} plan-art-${plan.slug}" type="button" data-group="${group.id}"${duplicate} aria-label="Abrir crew ${escapeHtml(group.name)}"><span class="group-card-faces">${group.photo?`<img class="group-card-cover" src="${group.photo}" alt="Foto de ${escapeHtml(group.name)}" aria-hidden="true">`:''}${group.members.slice(0,4).map(person=>`<img src="${image(person.photo)}" alt="" aria-hidden="true">`).join('')}</span><span class="group-card-copy"><strong>${escapeHtml(group.name)}</strong><small>${group.plan?`${escapeHtml(group.plan)} · `:''}${count} dentro</small><i>${escapeHtml(group.status)}</i></span><b class="group-card-arrow" aria-hidden="true">↗</b></button>`;}).join('');
  $$('[data-person]').forEach(button => button.onclick = () => openPerson(data.profiles.find(person => person.id === button.dataset.person)));
  $$('[data-plan]').forEach(button => button.onclick=()=>openPlan(button.dataset.plan));
  $$('[data-group]').forEach(button=>button.onclick=()=>openGroup(renderedGroups.find(group=>group.id===button.dataset.group)));
}
function setScreen(name) {
  $$('.screen').forEach(screen => screen.classList.toggle('is-active', screen.dataset.screen === name));
  $$('.bottom-nav [data-screen-target]').forEach(button => button.classList.toggle('is-active', button.dataset.screenTarget === name));
  $$('.section-tabs [data-screen-target]').forEach(button => button.classList.toggle('is-active', button.dataset.screenTarget === name));
  if(name==='crew') renderCrewBuilder();
  window.scrollTo({top:0,behavior:'auto'});
}
function openSheet(id) { $('#'+id).classList.remove('is-hidden'); document.body.classList.add('has-sheet'); }
function closeSheet(id) { $('#'+id).classList.add('is-hidden'); if(!$('.sheet-backdrop:not(.is-hidden)')) document.body.classList.remove('has-sheet'); }
function openPerson(person) {
  if(!person)return;
  const current=$('.screen.is-active');
  if(current?.dataset.screen!=='person')profileReturn={screen:current?.dataset.screen||'room',scroll:window.scrollY,focus:document.activeElement};
  activePerson=person;
  pendingDrink=null;
  $('#person-invitation').hidden=true;
  $('#person-feedback').hidden=true;
  $('#person-photos').innerHTML = `<img src="${image(person.photo)}" alt="Foto de ${person.name}" referrerpolicy="no-referrer">`;
  $('#person-name').textContent = person.name;
  $('#person-age').textContent = person.age;
  const signals=circleSignals(person);
  $('#person-connection').textContent = signals.length?signals.slice(0,2).join(' · '):'También viene a esta fiesta';
  $('#person-bio').textContent = person.bio;
  $('#person-chips').innerHTML = person.tags.map(tag => `<span>${tag}</span>`).join('');
  $('#profile-crew-status').replaceChildren();
  const crewTitle=document.createElement('strong');
  const membership=crewFor(person);
  crewTitle.textContent=membership?`Va con ${membership.name}`:'Sin crew';
  const crewDescription=document.createElement('small');
  const matchingCrew=renderedGroups.find(group=>group.id===membership?.id);
  crewDescription.textContent=membership?`${membership.phrase}${isOpenToAnyone(person)?' · Le apetece conocer gente':''}`:isOpenToAnyone(person)?'Le apetece conocer gente. Puedes invitarle a tu crew.':'Va a su ritmo. Puedes enviarle una invitación.';
  $('#profile-crew-status').append(crewTitle,crewDescription);
  const seeCrew=$('#person-see-crew');
  seeCrew.hidden=!matchingCrew;
  seeCrew.onclick=()=>matchingCrew&&openGroup(matchingCrew);
  $('[data-action=hello]').onclick = () => sendGreeting(person);
  $('[data-action=hello]').disabled=state.greetings.has(person.id)&&!state.receivedGreetings.some(item=>item.personId===person.id);
  $('#person-action-hint').textContent=$('[data-action=hello]').disabled?'Saludo enviado. La conversación se abre cuando te responda.':'Un saludo para empezar. Habláis si os saludáis los dos.';
  for(const kind of ['friendly','icebreaker']){
    const button=$(`[data-action=${kind}]`);
    button.disabled=sentDrinks.has(`${person.id}:${kind}`);
    button.onclick=()=>prepareDrink(person,kind);
  }
  $$('[data-action=invite-crew]').forEach(button => button.onclick = () => inviteToMyCrew(person));
  $('[data-action=invite-crew]').disabled=crewRequests.has(person.id);
  $('[data-action=invite-crew]').textContent=crewRequests.has(person.id)?'Invitación pendiente':'Invitar a mi crew';
  setScreen('person');
  $('#person-name').focus({preventScroll:true});
}
function leavePerson() {
  setScreen(profileReturn.screen);
  window.scrollTo({top:profileReturn.scroll,behavior:'instant'});
  if(profileReturn.focus?.isConnected)profileReturn.focus.focus({preventScroll:true});
}
function profileFeedback(message) {
  $('#person-feedback').textContent=message;
  $('#person-feedback').hidden=false;
}
function prepareDrink(person,kind) {
  if(sentDrinks.has(`${person.id}:${kind}`))return;
  pendingDrink={person,kind};
  $('#invitation-title').textContent=kind==='friendly'?'Un chupito entre colegas':'Dos chupitos para romper el hielo';
  $('#invitation-description').textContent=kind==='friendly'
    ?`Un detalle para ${person.name}, sin intención de ligar. Demo: solo se simula la invitación; no hay ningún cobro.`
    :`Uno para cada uno, si a ${person.name} le apetece. 2 chupitos · 6 € de prueba. Demo: no hay cobros ni QR de pago.`;
  $('#person-feedback').hidden=true;
  $('#person-invitation').hidden=false;
  $('#person-invitation').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function confirmDrink() {
  if(!pendingDrink||pendingDrink.person.id!==activePerson?.id)return;
  const {person,kind}=pendingDrink;
  sentDrinks.add(`${person.id}:${kind}`);
  renderRoom();
  $(`[data-action=${kind}]`).disabled=true;
  pendingDrink=null;
  $('#person-invitation').hidden=true;
  profileFeedback(`Invitación ${kind==='friendly'?'amistosa':'rompehielos'} simulada para ${person.name}. Pendiente de respuesta; no se ha realizado ningún cobro.`);
}
function inviteToMyCrew(person) {
  if(!state.crew.saved) { setScreen('crew'); showToast('Guarda tu crew para poder invitar.'); return; }
  crewRequests.add(person.id);
  $('[data-action=invite-crew]').disabled=true;
  $('[data-action=invite-crew]').textContent='Invitación pendiente';
  profileFeedback(`Invitación a tu crew simulada para ${person.name}. Se unirá cuando acepte.`);
}
function openPlan(plan) {
  const meta=planMeta[plan];
  if(!meta)return;
  const people=rankedProfiles().filter(person=>person.plan===plan);
  const inside=state.profile.plan===plan;
  planReturn={screen:'room',scroll:window.scrollY};
  $('#plan-cover').className=`plan-art plan-art-${meta.slug}`;
  $('#plan-art-kicker').textContent=meta.kicker;
  $('#plan-art-title').textContent=plan;
  $('#plan-art-note').textContent=meta.note;
  $('#plan-art-symbol').textContent=meta.symbol;
  $('#plan-title').textContent=plan;
  $('#plan-count').textContent=`${people.length} dentro`;
  $('#plan-description').textContent=meta.description;
  $('#plan-tags').innerHTML=meta.tags.map(tag=>`<span>${tag}</span>`).join('');
  $('#plan-connection').textContent=inside?'Estás dentro de este plan · aquí verás quién se apunta':'Entra para aparecer junto a la gente de este plan';
  $('#plan-members').innerHTML=people.length?people.map(person=>`<button class="plan-member" data-plan-person="${person.id}" aria-label="Ver perfil de ${person.name}"><img src="${image(person.photo)}" alt="Foto de ${person.name}" referrerpolicy="no-referrer"><span><strong>${person.name}</strong><small>${socialStatus(person)} · ${person.role}</small></span><b aria-hidden="true">↗</b></button>`).join(''):'<p class="plan-empty">Todavía no hay nadie dentro. Puedes ser la primera persona.</p>';
  $$('[data-plan-person]').forEach(button=>button.onclick=()=>openPerson(data.profiles.find(person=>person.id===button.dataset.planPerson)));
  const joinButton=$('#join-plan-action');
  joinButton.disabled=inside;
  joinButton.textContent=inside?'✓ Ya estás dentro':'Entrar en este plan';
  joinButton.onclick=()=>{
    if(inside)return;
    state.profile.plan=plan;
    persistProfile();
    renderOwnProfile();
    renderRoom();
    openPlan(plan);
    showToast(`Ya estás dentro de ${plan}.`);
  };
  const bringCrewButton=$('#bring-crew-action');
  const hasCrew=state.crew.saved;
  bringCrewButton.classList.toggle('is-hidden',!hasCrew);
  bringCrewButton.disabled=hasCrew&&state.crew.plan===plan;
  bringCrewButton.textContent=hasCrew&&state.crew.plan===plan?'✓ Tu crew va a este plan':'Llevar mi crew a este plan';
  bringCrewButton.onclick=()=>{
    if(!hasCrew||state.crew.plan===plan)return;
    state.crew.plan=plan;
    renderRoom();
    openPlan(plan);
    showToast(`Tu crew va a ${plan}; tú sigues dentro por tu cuenta.`);
  };
  setScreen('plan');
}
function leavePlan() {
  setScreen(planReturn.screen||'room');
  window.scrollTo({top:planReturn.scroll||0,behavior:'instant'});
}
function openGroup(group) {
  if(!group)return;
  const plan=planMeta[group.plan]||planMeta.Improvisar;
  const joined=group.id==='my-crew'||state.joinedGroups.has(group.id);
  const request=state.groupRequests.get(group.id);
  const requested=Boolean(request);
  const members=joined?[{isMe:true},...group.members]:group.members;
  const coverPhoto=group.photo||image(crewFallbackPhoto(group));
  $('#group-art').className=`group-art plan-art ${group.photo?'group-photo-art':`group-fallback-photo crew-cover-art ${crewCoverTheme(group)}`}`;
  $('#group-art').style.backgroundImage=`linear-gradient(180deg,#0002,#000b),url('${coverPhoto}')`;
  $('#group-art').classList.toggle('has-photo',Boolean(group.photo));
  $('#group-art-kicker').textContent=group.plan?'PLAN ELEGIDO':'SIN PLAN COMÚN';
  $('#group-art-title').textContent=group.plan||'CREW';
  $('#group-art-symbol').textContent=plan.symbol;
  $('#group-kicker').textContent=joined?'ESTÁS DENTRO':requested?'SOLICITUD ENVIADA':'GRUPO ABIERTO';
  $('#group-title').textContent=group.name;
  $('#group-phrase').textContent=`“${group.phrase}”`;
  $('#group-members').innerHTML=members.map((person,index)=>{
    const me=person.isMe;
  const status=me?'TÚ':'INTEGRANTE';
    const photo=me?primaryPhoto():image(person.photo);
    return `<button data-group-person="${me?'me':person.id}" aria-label="Ver perfil de ${me?'tu perfil':person.name}"><span ${photo?`style="background-image:url('${photo}')"`:''}>${photo?'':me?'TÚ':person.name.slice(0,2)}</span><b>${me?'Tú':person.name}</b><i>${status}</i></button>`;
  }).join('');
  $('#group-note').textContent=requested?`Solicitud ${request.mode==='crew'?`de ${request.crewName} `:''}pendiente de aceptación.`:`${members.length} ${members.length===1?'integrante':'integrantes'}${group.plan?` · ${group.plan}`:''}. Compartir un plan no cambia quién pertenece a la crew.`;
  $$('[data-group-person]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.groupPerson;
    closeSheet('group-sheet');
    if(id==='me')return setScreen('profile');
    openPerson(data.profiles.find(person=>person.id===id));
  });
  const joinButton=$('#group-join-button');
  const requestForm=$('#group-request-form');
  const requestMessage=$('#group-request-message');
  const requestMode=$('#group-request-mode');
  const entryMode=$('#group-entry-mode');
  requestForm.hidden=true;
  requestMessage.value='';
  const ownCrew=crewFor(state.profile);
  requestMode.value=ownCrew?'crew':'solo';
  entryMode.textContent=ownCrew?`Solicitar juntarnos con ${ownCrew.name}`:'Tu solicitud personal';
  joinButton.disabled=joined||requested;
  joinButton.textContent=group.id==='my-crew'?'✓ Esta es tu crew':joined?'✓ Ya estás dentro':requested?'Solicitud enviada':'Pedir entrar';
  joinButton.onclick=()=>{
    if(joined||requested)return;
    requestForm.hidden=false;
    requestMessage.focus();
  };
  requestForm.onsubmit=event=>{
    event.preventDefault();
    const message=requestMessage.value.trim();
    if(!message)return showToast('Escribe un mensaje breve para pedir entrar.');
    const mode=ownCrew?'crew':'solo';
    state.groupRequests.set(group.id,{mode,message,crewId:ownCrew?.id,crewName:ownCrew?.name});
    requestForm.hidden=true;
    openGroup(group);
    showToast(`Solicitud ${ownCrew?`de ${ownCrew.name} `:''}enviada a ${group.name}.`);
  };
  const chatButton=$('#group-chat-button');
  chatButton.hidden=!joined;
  chatButton.disabled=false;
  chatButton.textContent='Abrir chat del grupo';
  chatButton.onclick=()=>{if(joined)openGroupChat(group);};
  openSheet('group-sheet');
}
function renderGroupChat() {
  const messages=state.groupChats[state.activeGroupChat]||[];
  $('#chat-log').innerHTML=messages.map(message=>`<p class="${message.mine?'mine':''}"><b>${escapeHtml(message.author)}</b><span>${escapeHtml(message.body)}</span></p>`).join('');
}
function openGroupChat(group) {
  state.activeChat=null;
  state.activeGroupChat=group.id;
  $('#chat-label').textContent='CHAT DEL GRUPO';
  $('#chat-title').textContent=group.name;
  state.groupChats[group.id] ||= [{author:'Fiesta',body:`Chat abierto para la crew ${group.name}.`,system:true}];
  renderGroupChat();
  closeSheet('group-sheet');
  openSheet('chat-sheet');
}
function renderMessages() {
  $('#messages-list').innerHTML = state.messages.map(message => `<button data-chat="${message.name}"><img src="${image(message.photo)}" alt=""><span><strong>${message.name}</strong><small>${message.copy}</small></span><time>${message.time}</time></button>`).join('');
  $$('[data-chat]').forEach(button => button.onclick = () => openChat(button.dataset.chat));
}
function renderNotices() {
  $('#profile-view-count').textContent=state.profileViews;
  $('#greetings-list').innerHTML=state.receivedGreetings.map(item=>{const person=data.profiles.find(profile=>profile.id===item.personId);const summary=circleSignals(person)[0]||'Está en tu misma onda';return `<button class="activity-item" data-notice-person="${person.id}"><img src="${image(person.photo)}" alt=""><span><strong>${person.name} te ha saludado</strong><small>${summary} · ${item.time}</small></span><b>Ver</b></button>`;}).join('');
  $('#invitations-list').innerHTML=state.invitations.map(item=>{const person=data.profiles.find(profile=>profile.id===item.personId);return `<button class="activity-item" data-notice-person="${person.id}"><img src="${image(person.photo)}" alt=""><span><strong>${person.name} ${item.type==='crew'?'te invita a su crew':'te propone una ronda'}</strong><small>${item.copy}</small></span><b>${item.type==='crew'?'Ver crew':'Ver plan'}</b></button>`;}).join('');
  $$('[data-notice-person]').forEach(button=>button.onclick=()=>openPerson(data.profiles.find(person=>person.id===button.dataset.noticePerson)));
}
function sendGreeting(person) {
  const received=state.receivedGreetings.some(item=>item.personId===person.id);
  if(state.greetings.has(person.id)) {
    if(received)openChat(person.name);
    return;
  }
  state.greetings.add(person.id);
  const memory=encounterMemory.get(person.id)||{};
  encounterMemory.set(person.id,{...memory,greeted:true});
  renderRoom();
  if(!received){
    $('[data-action=hello]').disabled=true;
    $('#person-action-hint').textContent='Saludo enviado. La conversación se abre cuando te responda.';
    profileFeedback(`Saludo simulado para ${person.name}. Pendiente de respuesta.`);
    return;
  }
  state.messages.unshift({name:person.name,copy:'Te ha devuelto el saludo · Di algo',time:'Ahora',photo:person.photo});
  renderMessages();renderNotices();
  profileFeedback(`Has devuelto el saludo a ${person.name}. Ya podéis hablar en la demo.`);
  openChat(person.name);
}
function openChat(name) {
  state.activeChat = name;
  state.activeGroupChat = null;
  $('#chat-label').textContent='SALUDO DEVUELTO';
  $('#chat-title').textContent = name;
  $('#chat-log').innerHTML = `<p><b>${name}</b><span>Te ha devuelto el saludo.</span></p><p class="mine"><b>Tú</b><span>¡Hey! ¿Qué tal va la previa?</span></p>`;
  openSheet('chat-sheet');
}
const primaryPhoto=()=>state.myPhotos[0]||null;
const escapeHtml=value=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function renderOwnProfile() {
  const {profile,myPhotos}=state;
  $('#my-profile-name').textContent=profile.name||'Tu nombre';
  $('#my-profile-song').textContent=profile.song||'Añade tu temazo';
  $('#my-profile-plan').textContent=profile.plan||'Elige tu plan';
  $('#my-profile-arrival').textContent=socialStatus(profile);
  $('#my-profile-role').textContent=profile.role||'Elige tu papel';
  $('#my-profile-crew').textContent=state.crew.saved?state.crew.name:'Todavía no tienes una';
  $('#my-photo-grid').innerHTML=[0,1,2].map(index=>myPhotos[index]
    ?`<button class="profile-photo-tile" type="button" data-photo-slot="${index}" aria-label="Cambiar foto ${index+1}${index===0?' · portada':''}"><img src="${myPhotos[index]}" alt="Foto ${index+1} de tu perfil"><span>${index===0?'Portada · cambiar':'Cambiar'}</span></button>`
    :`<button class="profile-photo-tile is-empty" type="button" data-photo-slot="${index}"><span>+</span><small>Añadir foto</small></button>`).join('');
  $$('[data-photo-slot]').forEach(button=>button.onclick=()=>{photoSlot=Number(button.dataset.photoSlot);$('#my-photo-input').click();});
  $('#add-profile-photo').disabled=myPhotos.length>=3;
  $('#add-profile-photo').textContent=myPhotos.length>=3?'3 fotos listas':'Añadir foto';
}
function renderProfileForm() {
  const {profile}=state;
  $('#profile-name-input').value=profile.name;
  $('#profile-contact-input').value=profile.contact;
  $('#profile-song-input').value=profile.song||'';
  for(const field of ['plan','arrival','role']) {
    const picker=$(`#profile-${field}-picker`);
    picker.innerHTML=profileOptions[field].map(option=>`<button type="button" class="${profile[field]===option?'is-selected':''}" data-profile-field="${field}" data-profile-value="${option}">${option}</button>`).join('');
    picker.querySelectorAll('[data-profile-field]').forEach(button=>button.onclick=()=>{
      state.profile[`draft_${field}`]=button.dataset.profileValue;
      picker.querySelectorAll('[data-profile-field]').forEach(option=>option.classList.toggle('is-selected',option===button));
    });
  }
}
function getProfileDraft(field) {
  const draft=state.profile[`draft_${field}`];
  return profileOptions[field].includes(draft)?draft:state.profile[field];
}
function clearProfileDraft() {
  for(const field of ['plan','arrival','role']) delete state.profile[`draft_${field}`];
}
function setProfileEdit(editing) {
  $('#profile-preview').hidden=editing;
  $('#profile-fast-form').hidden=!editing;
  $('#edit-profile').textContent=editing?'Vista previa':'Editar';
  if(editing)renderProfileForm();
  else clearProfileDraft();
}
function fileToDataUrl(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=reject;
    reader.onload=()=>{
      const source=new Image();
      source.onerror=reject;
      source.onload=()=>{
        const maxSide=1280;
        const scale=Math.min(1,maxSide/Math.max(source.naturalWidth,source.naturalHeight));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));
        canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',.82));
      };
      source.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function readMyPhoto(event) {
  const files=[...event.target.files];
  if(!files.length)return;
  const valid=files.filter(file=>['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=5*1024*1024);
  if(!valid.length){showToast('Usa fotos JPG, PNG o WEBP de hasta 5 MB.');event.target.value='';return;}
  try {
    const photos=[...state.myPhotos];
    if(photoSlot!==null){photos[photoSlot]=await fileToDataUrl(valid[0]);}
    else {for(const file of valid.slice(0,3-photos.length))photos.push(await fileToDataUrl(file));}
    state.myPhotos=photos.filter(Boolean).slice(0,3);
    persistProfile();
    photoSlot=null;event.target.value='';renderOwnProfile();renderCrewBuilder();renderRoom();showToast('Fotos actualizadas en tu perfil y tu crew.');
  } catch { showToast('No se ha podido preparar esa foto.'); }
}
function readCrewPhoto(event) {
  const [file]=event.target.files;
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){showToast('Usa una foto JPG, PNG o WEBP de hasta 5 MB.');event.target.value='';return;}
  const reader=new FileReader();
  reader.onload=()=>{state.crew.photo=reader.result;renderCrewBuilder();renderRoom();showToast('Foto de grupo añadida.');};
  reader.readAsDataURL(file);
}
function renderCrewBuilder() {
  const {crew}=state;
  $('#crew-name').value=crew.name;$('#crew-phrase').value=crew.phrase;$('#crew-plan').value=crew.plan||'';
  $('#edit-crew-photo').innerHTML=`${crew.photo?`<img src="${crew.photo}" alt="Foto de grupo">`:'<span class="crew-photo-monogram" aria-hidden="true">✦</span>'}<span class="crew-photo-caption">${crew.photo?'Cambiar foto':'Añadir foto de la crew'}<small>${crew.photo?'Vuestra portada':'Opcional · el resto lo ponéis vosotros'}</small></span><span class="crew-photo-add" aria-hidden="true">+</span>`;
  $('#crew-status-line').textContent=crew.saved?'Tu crew está en la sala':'Dale nombre a vuestra noche';
  $('#save-crew').textContent=crew.saved?'Guardar cambios':'Crear mi crew';
  $('#copy-crew-link').disabled=!crew.saved;
  $('#crew-pending-count').textContent=crewRequests.size?`${crewRequests.size} invitación${crewRequests.size===1?'':'es'} pendiente${crewRequests.size===1?'':'s'} · Se unirán cuando acepten.`:'Invita a alguien para empezar a compartir la noche.';
  $('#crew-member-count').textContent='Tú + '+crew.members.length;
  const memberProfiles=crew.members.map(id=>data.profiles.find(person=>person.id===id));
  const me=primaryPhoto()?`<span class="crew-member you"><img src="${primaryPhoto()}" alt="Tu foto"></span>`:'<span class="crew-member you">TÚ</span>';
  $('#crew-members').innerHTML=`${me}${memberProfiles.map(person=>`<button class="crew-member" data-remove-member="${person.id}" title="Quitar a ${person.name}"><img src="${image(person.photo)}" alt="${person.name}"><i>×</i></button>`).join('')}<button class="crew-member-empty" id="invite-member-cta" type="button" aria-label="Invitar a alguien">+</button>`;
  $$('[data-remove-member]').forEach(button=>button.onclick=()=>{state.crew.members=state.crew.members.filter(id=>id!==button.dataset.removeMember);renderCrewBuilder();});
  $('#invite-member-cta').onclick=()=>{document.querySelector('#crew-search').focus();document.querySelector('.invite-search').scrollIntoView({behavior:'smooth',block:'center'});};
  const query=state.crewQuery.trim().toLocaleLowerCase('es');
  const candidates=rankedProfiles().filter(person=>!crew.members.includes(person.id)&&(!query||[person.name,crewFor(person)?.name||''].join(' ').toLocaleLowerCase('es').includes(query)));
  $('#invite-results').innerHTML=candidates.length?candidates.map(person=>`<button class="invite-person" data-invite-member="${person.id}" ${crewRequests.has(person.id)?'disabled':''}><img src="${image(person.photo)}" alt=""><span><strong>${person.name}</strong><small>${escapeHtml(crewFor(person)?`Con ${crewFor(person).name}`:socialStatus(person))}</small></span><b>${crewRequests.has(person.id)?'Pendiente':'Invitar'}</b></button>`).join(''):'<p class="no-results">No encontramos a nadie con ese nombre.</p>';
  $$('[data-invite-member]').forEach(button=>button.onclick=()=>{
    if(!state.crew.saved){showToast('Crea tu crew antes de invitar.');$('#crew-name').focus();return;}
    crewRequests.add(button.dataset.inviteMember);renderCrewBuilder();showToast('Invitación pendiente de aceptación.');
  });
}

$$('[data-screen-target]').forEach(button => button.onclick = () => setScreen(button.dataset.screenTarget));
$('#show-all').onclick = () => { showAll = !showAll; renderRoom(); };
$('#edit-profile').onclick = () => setProfileEdit($('#profile-fast-form').hidden);
$('#add-profile-photo').onclick = () => {photoSlot=null;$('#my-photo-input').click();};
$('#my-photo-input').onchange = readMyPhoto;
$('#cancel-profile-edit').onclick = () => setProfileEdit(false);
$('#profile-fast-form').onsubmit = event => {
  event.preventDefault();
  const form=event.currentTarget;
  state.profile={...state.profile,name:form.elements.name.value.trim(),contact:form.elements.contact.value.trim(),song:form.elements.song.value.trim(),plan:getProfileDraft('plan'),arrival:getProfileDraft('arrival'),role:getProfileDraft('role')};
  clearProfileDraft();
  persistProfile();
  renderOwnProfile();renderRoom();setProfileEdit(false);showToast('Perfil actualizado.');
};
$('#person-back').onclick=leavePerson;
$('#plan-back').onclick=leavePlan;
$('#cancel-invitation').onclick=()=>{pendingDrink=null;$('#person-invitation').hidden=true;};
$('#confirm-invitation').onclick=confirmDrink;
$('#edit-crew-photo').onclick = () => $('#crew-photo-input').click();
$('#crew-photo-input').onchange = readCrewPhoto;
$$('[data-close]').forEach(button => button.onclick = () => closeSheet(button.dataset.close));
$$('.sheet-backdrop').forEach(backdrop => backdrop.onclick = event => { if(event.target === backdrop) closeSheet(backdrop.id); });
$('#crew-name').oninput = event => {state.crew.name=event.target.value;};
$('#crew-phrase').oninput = event => {state.crew.phrase=event.target.value;};
$('#crew-plan').onchange = event => {state.crew.plan=event.target.value;renderRoom();};
$('#crew-search').oninput = event => {state.crewQuery=event.target.value;renderCrewBuilder();};
$('#save-crew').onclick=()=>{if(state.crew.name.trim().length<2||state.crew.phrase.trim().length<2)return showToast('Ponle un nombre y una frase corta a vuestra crew.');state.crew.saved=true;persistProfile();renderOwnProfile();renderRoom();renderCrewBuilder();showToast(`Crew “${state.crew.name}” guardada.`);};
$('#save-profile').onclick=()=>{if(!$('#profile-memory-consent').checked)return showToast('Activa la reutilización del perfil para guardarlo entre fiestas.');showToast('Perfil y preferencias guardados para próximas fiestas.');};
$('#copy-crew-link').onclick=async()=>{const link=location.origin+'/fiesta-v2/?crew='+encodeURIComponent(state.crew.name||'mi-crew');try{await navigator.clipboard.writeText(link);showToast('Enlace copiado para tu gente.');}catch{showToast(link);}};
$('#chat-form').onsubmit = event => { event.preventDefault(); const form = event.currentTarget; const message=form.elements.message.value.trim(); if(!message)return; if(state.activeGroupChat){(state.groupChats[state.activeGroupChat] ||= []).push({author:'Tú',body:message,mine:true});renderGroupChat();form.reset();return;} $('#chat-log').insertAdjacentHTML('beforeend',`<p class="mine"><b>Tú</b><span>${message.replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}</span></p>`); form.reset(); };
renderRoom();
renderMessages();
renderNotices();
renderOwnProfile();
