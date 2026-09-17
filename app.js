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
  Improvisar:{slug:'improvisar',kicker:'SIN GUIÓN',short:'LIBRE',note:'Mira quién va y sigue lo que apetezca.',description:'No hace falta traer un plan cerrado. Apúntate, mira quién va y elige el siguiente paso sobre la marcha.',tags:['Libre','Descubrir','Ahora'],symbol:'~'}
};
const crewCoverThemes = ['crew-cover-citrus','crew-cover-violet','crew-cover-sunset','crew-cover-mint'];
const crewFallbackPhotos = ['photo-1529156069898-49953e39b3ac','photo-1511632765486-a01980e01a18','photo-1527529482837-4698179dc6ce','photo-1506869640319-fe1a24fd76dc'];
let showAll = false;
let toastTimer;
let crewScrollFrame;
let crewScrollResumeTimer;
let renderedGroups = [];
let profileReturn = {screen:'room',scroll:0,focus:null};
let planReturn = {screen:'room',scroll:0};
let chatReturnScreen = 'messages';
let upcomingReturnScreen = 'event';
let activePerson = null;
let activeUpcomingEvent = null;
let pendingDrink = null;
let photoSlot = null;
const sentDrinks = new Set();
const crewRequests = new Set();
const connectionRequests = new Set();
let storedProfile = null;
try { storedProfile = JSON.parse(localStorage.getItem(profileStorageKey) || 'null'); } catch {}
const savedCircle=Array.isArray(storedProfile?.circle)?storedProfile.circle:data.defaultCircleIds;
const state = { hasTicket:true, attendanceVisible:Boolean(storedProfile?.attendanceVisible), profileViews:12, greetings:new Set(), messages:[...data.messages], activeChat:null, activeGroupChat:null, joinedGroups:new Set(), groupRequests:new Map(), groupChats:{}, circleIds:new Set(savedCircle), introductions:Array.isArray(storedProfile?.introductions)?storedProfile.introductions:[], interestedEvents:new Set(Array.isArray(storedProfile?.interestedEvents)?storedProfile.interestedEvents:[]), myPhotos:Array.isArray(storedProfile?.photos)?storedProfile.photos.slice(0,3):[], profile:{...defaultProfile,...storedProfile?.profile}, receivedGreetings:[{personId:'lucia',time:'Ahora'},{personId:'dani',time:'8 min'}], receivedDrinks:[{personId:'sara',kind:'friendly',time:'12 min'},{personId:'nico',kind:'icebreaker',time:'18 min'}], invitations:[{personId:'zoe',type:'crew',copy:'Te ha invitado a unirte a Terraza abierta'},{personId:'pau',type:'round',copy:'Ha propuesto una ronda para su crew'}], crew:{name:'',phrase:'',members:[],saved:false,plan:'',photo:null}, crewQuery:'' };
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
    localStorage.setItem(profileStorageKey, JSON.stringify({profile:state.profile,photos:state.myPhotos,circle:[...state.circleIds],attendanceVisible:state.attendanceVisible,introductions:state.introductions,interestedEvents:[...state.interestedEvents]}));
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
function setupCrewScroller() {
  const row=$('.group-row');
  const track=$('#group-track');
  if(!row||!track)return;
  cancelAnimationFrame(crewScrollFrame);
  clearTimeout(crewScrollResumeTimer);
  let touching=false;
  let previousTime=performance.now();
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const loop=()=>track.scrollWidth/2;
  const normalize=()=>{
    const loopWidth=loop();
    if(!loopWidth)return;
    if(row.scrollLeft>=loopWidth)row.scrollLeft-=loopWidth;
  };
  const pause=()=>{touching=true;row.classList.add('is-touching');clearTimeout(crewScrollResumeTimer);};
  const resume=()=>{clearTimeout(crewScrollResumeTimer);crewScrollResumeTimer=setTimeout(()=>{touching=false;row.classList.remove('is-touching');},900);};
  row.onpointerdown=pause;
  row.onpointerup=resume;
  row.onpointercancel=resume;
  row.onfocusin=pause;
  row.onfocusout=resume;
  const advance=now=>{
    const elapsed=Math.min(now-previousTime,40);
    if(!touching&&!reducedMotion.matches&&row.closest('.screen')?.classList.contains('is-active'))row.scrollLeft+=elapsed*.018;
    normalize();
    previousTime=now;
    crewScrollFrame=requestAnimationFrame(advance);
  };
  crewScrollFrame=requestAnimationFrame(advance);
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
    const count=`${total} ${total===1?'persona apuntada':'personas apuntadas'}`;
    return `<article class="plan-group${inside?' is-joined':''}"><button class="plan-group-open" type="button" data-plan="${escapeHtml(plan)}" aria-label="Abrir el plan ${escapeHtml(plan)}"><span class="plan-group-art plan-art-${meta.slug}" aria-hidden="true"><b>${meta.symbol}</b><i>${meta.short}</i></span><span class="plan-group-kicker">${label}</span><strong>${escapeHtml(plan)}</strong><small>${count}</small>${inside?'<b class="plan-group-joined">Apuntado</b>':''}<i class="plan-group-arrow" aria-hidden="true">›</i></button></article>`;
  }).join('');
  renderedGroups=buildCrews(ranked);
  const movingGroups=[...renderedGroups,...renderedGroups];
  $('#group-track').innerHTML=movingGroups.map((group,index)=>{const plan=planMeta[group.plan]||planMeta.Improvisar;const count=group.id==='my-crew'?group.members.length+1:group.members.length;const duplicate=index>=renderedGroups.length?' aria-hidden="true" tabindex="-1"':'';return `<button class="group-card group-card-${(index%3)+1} plan-art-${plan.slug}" type="button" data-group="${group.id}"${duplicate} aria-label="Abrir crew ${escapeHtml(group.name)}"><span class="group-card-faces">${group.photo?`<img class="group-card-cover" src="${group.photo}" alt="Foto de ${escapeHtml(group.name)}" aria-hidden="true">`:''}${group.members.slice(0,4).map(person=>`<img src="${image(person.photo)}" alt="" aria-hidden="true">`).join('')}</span><span class="group-card-copy"><strong>${escapeHtml(group.name)}</strong><small>${group.plan?`${escapeHtml(group.plan)} · `:''}${count} personas</small><i>${escapeHtml(group.status)}</i></span><b class="group-card-arrow" aria-hidden="true">›</b></button>`;}).join('');
  $$('[data-person]').forEach(button => button.onclick = () => openPerson(data.profiles.find(person => person.id === button.dataset.person)));
  $$('[data-plan]').forEach(button => button.onclick=()=>openPlan(button.dataset.plan));
  $$('[data-group]').forEach(button=>button.onclick=()=>openGroup(renderedGroups.find(group=>group.id===button.dataset.group)));
  setupCrewScroller();
}
function setScreen(name) {
  if(['room','crew','messages'].includes(name)&&!state.hasTicket){showToast('Necesitas una entrada verificada para abrir La previa.');name='event';}
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
  const mutual=mutualContacts(person);
  $('#mutual-contacts').hidden=!mutual.length;
  $('#mutual-contact-title').textContent=mutual.length===1?'1 contacto en común':`${mutual.length} contactos en común`;
  $('#mutual-contact-copy').textContent=mutual.map(contact=>contact.name).join(' · ');
  $('#mutual-contact-faces').innerHTML=mutual.slice(0,4).map(contact=>`<img src="${image(contact.photo)}" alt="${escapeHtml(contact.name)}">`).join('');
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
  const connectionButton=$('#save-connection-action');
  const connected=state.circleIds.has(person.id);
  const pendingConnection=connectionRequests.has(person.id);
  connectionButton.disabled=connected||pendingConnection;
  connectionButton.textContent=connected?'✓ En tu círculo':pendingConnection?'Solicitud de conexión enviada':'Guardar conexión';
  connectionButton.onclick=()=>{
    if(connected||connectionRequests.has(person.id))return;
    connectionRequests.add(person.id);
    connectionButton.disabled=true;
    connectionButton.textContent='Solicitud de conexión enviada';
    profileFeedback(`${person.name} entrará en tu círculo únicamente si también acepta.`);
  };
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
  $('#plan-count').textContent=`${people.length} apuntadas`;
  $('#plan-description').textContent=meta.description;
  $('#plan-tags').innerHTML=meta.tags.map(tag=>`<span>${tag}</span>`).join('');
  $('#plan-connection').textContent=inside?'Te has apuntado a este plan · aquí verás quién se suma':'Apúntate para aparecer junto a la gente de este plan';
  $('#plan-members').innerHTML=people.length?people.map(person=>`<button class="plan-member" data-plan-person="${person.id}" aria-label="Ver perfil de ${person.name}"><img src="${image(person.photo)}" alt="Foto de ${person.name}" referrerpolicy="no-referrer"><span><strong>${person.name}</strong><small>${socialStatus(person)} · ${person.role}</small></span><b aria-hidden="true">›</b></button>`).join(''):'<p class="plan-empty">Todavía no se ha apuntado nadie. Puedes ser la primera persona.</p>';
  $$('[data-plan-person]').forEach(button=>button.onclick=()=>openPerson(data.profiles.find(person=>person.id===button.dataset.planPerson)));
  const joinButton=$('#join-plan-action');
  joinButton.disabled=inside;
  joinButton.textContent=inside?'✓ Ya te has apuntado':'Apuntarme a este plan';
  joinButton.onclick=()=>{
    if(inside)return;
    state.profile.plan=plan;
    persistProfile();
    renderOwnProfile();
    renderRoom();
    openPlan(plan);
    showToast(`Te has apuntado a ${plan}.`);
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
    showToast(`Tu crew va a ${plan}; tú sigues apuntado por tu cuenta.`);
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
  $('#group-kicker').textContent=joined?'FORMAS PARTE':requested?'SOLICITUD ENVIADA':'GRUPO ABIERTO';
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
  joinButton.textContent=group.id==='my-crew'?'✓ Esta es tu crew':joined?'✓ Ya formas parte':requested?'Solicitud enviada':'Pedir entrar';
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
  const current=$('.screen.is-active');
  if(current?.dataset.screen!=='chat')chatReturnScreen=current?.dataset.screen||'room';
  state.activeChat=null;
  state.activeGroupChat=group.id;
  $('#chat-label').textContent='CHAT DEL GRUPO';
  $('#chat-title').textContent=group.name;
  $('#chat-context').textContent=`${group.members.length} personas · Solo esta noche`;
  $('#chat-avatar-mark').textContent=group.name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  state.groupChats[group.id] ||= [{author:'Fiesta',body:`Chat abierto para la crew ${group.name}.`,system:true}];
  renderGroupChat();
  closeSheet('group-sheet');
  setScreen('chat');
}
function renderMessages() {
  const eventContacts=currentEventCirclePeople();
  $('#event-circle-list').innerHTML=eventContacts.length?eventContacts.map(person=>`<button type="button" data-circle-chat="${person.id}"><span class="message-avatar"><img src="${image(person.photo)}" alt=""><i aria-hidden="true"></i></span><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.room)} · También va</small></span><b>Escribir</b></button>`).join(''):'<p class="messages-empty">Ningún contacto de tu círculo coincide en esta fiesta todavía.</p>';
  $('#messages-count').textContent=state.messages.length;
  $('#messages-tab-count').textContent=state.messages.length;
  $('#messages-list').innerHTML = state.messages.length
    ? state.messages.map(message => `<button class="${message.unread?'is-unread':''}" data-chat="${escapeHtml(message.name)}"><span class="message-avatar"><img src="${image(message.photo)}" alt="">${message.unread?'<i aria-label="Mensaje nuevo"></i>':''}</span><span class="message-copy"><span class="message-name"><strong>${escapeHtml(message.name)}</strong><em>${escapeHtml(message.context||'Esta noche')}</em></span><small>${escapeHtml(message.copy)}</small></span><span class="message-meta"><time>${escapeHtml(message.time)}</time><b aria-hidden="true">›</b></span></button>`).join('')
    : '<p class="messages-empty">Todavía no hay conversaciones. Devuelve un saludo para empezar una.</p>';
  $$('[data-chat]').forEach(button => button.onclick = () => openChat(button.dataset.chat));
  $$('[data-circle-chat]').forEach(button=>button.onclick=()=>openCircleChat(data.profiles.find(person=>person.id===button.dataset.circleChat)));
}
function renderNotices() {
  $('#profile-view-count').textContent=state.profileViews;
  $('#activity-count').textContent=state.receivedGreetings.length+state.receivedDrinks.length+state.invitations.length;
  $('#greetings-list').innerHTML=state.receivedGreetings.map(item=>{const person=data.profiles.find(profile=>profile.id===item.personId);const summary=circleSignals(person)[0]||'Está en tu misma onda';const returned=state.greetings.has(person.id);return `<button class="activity-item" data-return-greeting="${person.id}" ${returned?'disabled':''}><img src="${image(person.photo)}" alt=""><span><strong>${person.name} te ha saludado</strong><small>${summary} · ${item.time}</small></span><b>${returned?'Respondido':'Devolver'}</b></button>`;}).join('');
  $('#drink-invitations-list').innerHTML=state.receivedDrinks.map(item=>{const person=data.profiles.find(profile=>profile.id===item.personId);const label=item.kind==='friendly'?'un chupito amistoso':'un chupito rompehielos';return `<button class="activity-item" data-received-drink="${person.id}"><img src="${image(person.photo)}" alt=""><span><strong>${person.name} te invita a ${label}</strong><small>${escapeHtml(person.room)} · ${item.time}</small></span><b>Ver</b></button>`;}).join('');
  $('#invitations-list').innerHTML=state.invitations.map(item=>{const person=data.profiles.find(profile=>profile.id===item.personId);return `<button class="activity-item" data-notice-person="${person.id}"><img src="${image(person.photo)}" alt=""><span><strong>${person.name} ${item.type==='crew'?'te invita a su crew':'te propone una ronda'}</strong><small>${item.copy}</small></span><b>${item.type==='crew'?'Ver crew':'Ver plan'}</b></button>`;}).join('');
  $$('[data-return-greeting]').forEach(button=>button.onclick=()=>sendGreeting(data.profiles.find(person=>person.id===button.dataset.returnGreeting)));
  $$('[data-received-drink]').forEach(button=>button.onclick=()=>{const person=data.profiles.find(profile=>profile.id===button.dataset.receivedDrink);openPerson(person);profileFeedback(`${person.name} te ha enviado una invitación de chupito. Puedes decidirlo cuando os veáis.`);});
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
  state.messages.unshift({name:person.name,copy:'Te ha devuelto el saludo · Di algo',time:'Ahora',context:person.room||'Esta noche',unread:true,photo:person.photo});
  renderMessages();renderNotices();
  profileFeedback(`Has devuelto el saludo a ${person.name}. Ya podéis hablar en la demo.`);
  openChat(person.name);
}
function openChat(name) {
  const current=$('.screen.is-active');
  if(current?.dataset.screen!=='chat')chatReturnScreen=current?.dataset.screen||'messages';
  state.activeChat = name;
  state.activeGroupChat = null;
  const circlePerson=data.profiles.find(person=>person.name===name&&state.circleIds.has(person.id));
  const sharedEvent=Boolean(circlePerson&&data.currentEventCircleIds.includes(circlePerson.id));
  if(circlePerson&&!sharedEvent){showToast('El chat se activa cuando los dos vais a la misma fiesta.');return;}
  $('#chat-label').textContent=circlePerson?'CONTACTO DE TU CÍRCULO':'SALUDO DEVUELTO';
  $('#chat-title').textContent = name;
  const message=state.messages.find(item=>item.name===name);
  $('#chat-context').textContent=circlePerson?`${circlePerson.room} · Los dos vais a esta fiesta`:`${message?.context||'Esta noche'} · Chat temporal`;
  $('#chat-avatar-mark').textContent=name.trim().slice(0,2).toUpperCase();
  $('#chat-log').innerHTML = circlePerson?`<p><b>Fiesta</b><span>Podéis escribiros porque formáis parte del mismo círculo y ambos vais a esta fiesta.</span></p>`:`<p><b>${name}</b><span>Te ha devuelto el saludo.</span></p><p class="mine"><b>Tú</b><span>¡Hey! ¿Qué tal va la previa?</span></p>`;
  setScreen('chat');
}
function openCircleChat(person) {
  if(!person||!state.circleIds.has(person.id))return;
  if(!data.currentEventCircleIds.includes(person.id))return showToast('Podréis escribiros cuando coincidáis en una fiesta.');
  if(!state.messages.some(message=>message.name===person.name))state.messages.unshift({name:person.name,copy:'Contacto de tu círculo · Escribe algo',time:'Ahora',context:person.room,unread:false,photo:person.photo});
  renderMessages();
  openChat(person.name);
}
function renderUpcomingEvents() {
  $('#upcoming-event-list').innerHTML=data.upcomingEvents.map(event=>{
    const [day,month]=event.date.split(' ');
    return `<button type="button" data-upcoming-event="${event.id}"><time datetime="${event.datetime}"><strong>${day}</strong><small>${month}</small></time><span><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.music)} · ${escapeHtml(event.space)}</small><em>${event.knownCount} de tu círculo van</em></span><b>Ver</b></button>`;
  }).join('');
  $$('[data-upcoming-event]').forEach(button=>button.onclick=()=>openUpcomingEvent(data.upcomingEvents.find(event=>event.id===button.dataset.upcomingEvent)));
}
function openUpcomingEvent(event) {
  if(!event)return;
  const current=$('.screen.is-active');
  if(current?.dataset.screen!=='upcoming-event')upcomingReturnScreen=current?.dataset.screen||'event';
  activeUpcomingEvent=event;
  $('#upcoming-detail-poster').className=`upcoming-detail-poster theme-${event.theme}`;
  $('#upcoming-detail-date').textContent=event.date;
  $('#upcoming-detail-poster-name').textContent=event.name;
  $('#upcoming-detail-title').textContent=event.name;
  $('#upcoming-detail-meta').textContent=`${event.datetime.split('-').reverse().join('/')} · ${event.time} · ${event.music} · ${event.space}`;
  $('#upcoming-known-count').textContent=`${event.knownCount} personas de tu círculo y ${event.crewCount} crew${event.crewCount===1?'':'s'} conocidas ya van`;
  $('#fourvenues-link').href=event.ticketUrl;
  const interestButton=$('#event-interest-button');
  interestButton.textContent=state.interestedEvents.has(event.id)?'✓ Te interesa':'Me interesa';
  interestButton.classList.toggle('is-selected',state.interestedEvents.has(event.id));
  setScreen('upcoming-event');
}
function circlePeople() {
  return [...state.circleIds].map(id=>data.profiles.find(person=>person.id===id)).filter(Boolean);
}
function currentEventCirclePeople() {
  return circlePeople().filter(person=>data.currentEventCircleIds.includes(person.id));
}
function mutualContacts(person) {
  const contactIds=new Set(person.contactIds||[]);
  return circlePeople().filter(contact=>contact.id!==person.id&&contactIds.has(contact.id));
}
function renderCircle() {
  const people=circlePeople();
  $('#circle-count').textContent=`${people.length} conexiones`;
  $('#circle-list').innerHTML=people.map(person=>{const canChat=data.currentEventCircleIds.includes(person.id);return `<article><button type="button" data-circle-person="${person.id}"><img src="${image(person.photo)}" alt=""><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(circleSignals(person)[0]||'Conexión guardada')}</small></span></button><button type="button" class="circle-chat-action" data-circle-chat="${person.id}" ${canChat?'':'disabled'}>${canChat?'Escribir':'Otro evento'}</button></article>`;}).join('');
  $$('[data-circle-person]').forEach(button=>button.onclick=()=>openPerson(data.profiles.find(person=>person.id===button.dataset.circlePerson)));
  $$('[data-circle-chat]').forEach(button=>button.onclick=()=>openCircleChat(data.profiles.find(person=>person.id===button.dataset.circleChat)));
  $('#intro-history').hidden=!state.introductions.length;
  $('#intro-history-list').innerHTML=state.introductions.map(item=>`<article><strong>${escapeHtml(item.aName)} + ${escapeHtml(item.bName)}</strong><span>Pendiente de ambas</span><p>${escapeHtml(item.eventName)} · “${escapeHtml(item.message)}”</p></article>`).join('');
}
function renderCirclePreview() {
  const people=circlePeople();
  $('#circle-preview-count').textContent=`${people.length} ${people.length===1?'conexión':'conexiones'}`;
  $('#circle-preview-faces').innerHTML=people.slice(0,4).map(person=>`<img src="${image(person.photo)}" alt="${escapeHtml(person.name)}">`).join('');
}
function openIntroSheet() {
  const people=circlePeople();
  if(people.length<2)return showToast('Necesitas al menos dos conexiones para presentarlas.');
  const options=people.map(person=>`<option value="${person.id}">${escapeHtml(person.name)}</option>`).join('');
  $('#intro-person-a').innerHTML=options;
  $('#intro-person-b').innerHTML=options;
  $('#intro-person-b').selectedIndex=Math.min(1,people.length-1);
  $('#intro-event').innerHTML=`<option value="current">MARMarela · Grande · Hoy</option>${data.upcomingEvents.map(event=>`<option value="${event.id}">${escapeHtml(event.name)} · ${escapeHtml(event.date)}</option>`).join('')}`;
  $('#intro-message').value='';
  openSheet('intro-sheet');
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
  $('#profile-crew-manager-name').textContent=state.crew.saved?state.crew.name:'Todavía no tienes una';
  $('#profile-crew-manager-copy').textContent=state.crew.saved?(state.crew.phrase||'Edita vuestra crew e invita a más gente.'):'Crea vuestro grupo, ponedle nombre e invita a tu gente.';
  $('#open-crew-manager').textContent=state.crew.saved?'Editar mi crew':'Crear mi crew';
  $('#my-photo-grid').innerHTML=[0,1,2].map(index=>myPhotos[index]
    ?`<button class="profile-photo-tile" type="button" data-photo-slot="${index}" aria-label="Cambiar foto ${index+1}${index===0?' · portada':''}"><img src="${myPhotos[index]}" alt="Foto ${index+1} de tu perfil"><span>${index===0?'Portada · cambiar':'Cambiar'}</span></button>`
    :`<button class="profile-photo-tile is-empty${index?' is-secondary':''}" type="button" data-photo-slot="${index}" aria-label="Añadir foto ${index+1}${index===0?' · principal':''}"><span>${index===0?'+':index+1}</span><small>${index===0?'Añade tu foto principal':'Foto opcional'}</small></button>`).join('');
  $$('[data-photo-slot]').forEach(button=>button.onclick=()=>{photoSlot=Number(button.dataset.photoSlot);$('#my-photo-input').click();});
  $('#add-profile-photo').disabled=myPhotos.length>=3;
  $('#add-profile-photo').textContent=myPhotos.length>=3?'3 fotos listas':myPhotos.length?'Añadir otra foto':'Elegir fotos';
  $('#attendance-visibility').checked=state.attendanceVisible;
  renderCirclePreview();
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
  $('#crew-status-line').textContent=crew.saved?'Tu crew ya está lista':'Dale nombre a vuestra noche';
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
$$('[data-inbox-tab]').forEach(button=>button.onclick=()=>{$$('[data-inbox-tab]').forEach(tab=>tab.classList.toggle('is-active',tab===button));$$('[data-inbox-panel]').forEach(panel=>panel.hidden=panel.dataset.inboxPanel!==button.dataset.inboxTab);});
$('#show-all').onclick = () => { showAll = !showAll; renderRoom(); };
$('#edit-profile').onclick = () => setProfileEdit($('#profile-fast-form').hidden);
$('#add-profile-photo').onclick = () => {photoSlot=null;$('#my-photo-input').click();};
$('#attendance-visibility').onchange=event=>{state.attendanceVisible=event.target.checked;persistProfile();showToast(state.attendanceVisible?'Tu círculo podrá verte cuando también tenga entrada.':'Tu asistencia seguirá siendo anónima.');};
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
$('#chat-back').onclick=()=>setScreen(chatReturnScreen);
$('#upcoming-event-back').onclick=()=>setScreen(upcomingReturnScreen);
$('#circle-back').onclick=()=>setScreen('profile');
$('#open-circle').onclick=()=>{renderCircle();setScreen('circle');};
$('#open-crew-manager').onclick=()=>{renderCrewBuilder();setScreen('crew');};
$('#present-people').onclick=openIntroSheet;
$('#event-interest-button').onclick=()=>{
  if(!activeUpcomingEvent)return;
  if(state.interestedEvents.has(activeUpcomingEvent.id))state.interestedEvents.delete(activeUpcomingEvent.id);
  else state.interestedEvents.add(activeUpcomingEvent.id);
  persistProfile();
  openUpcomingEvent(activeUpcomingEvent);
  showToast(state.interestedEvents.has(activeUpcomingEvent.id)?'Te avisaremos cuando se abra la venta.':'Evento retirado de tus intereses.');
};
$('#intro-form').onsubmit=event=>{
  event.preventDefault();
  const aId=$('#intro-person-a').value;
  const bId=$('#intro-person-b').value;
  if(aId===bId)return showToast('Elige dos personas diferentes.');
  const a=data.profiles.find(person=>person.id===aId);
  const b=data.profiles.find(person=>person.id===bId);
  const eventId=$('#intro-event').value;
  const selectedEvent=data.upcomingEvents.find(item=>item.id===eventId);
  const eventName=selectedEvent?.name||'MARMarela · Grande';
  state.introductions.unshift({aId,bId,aName:a.name,bName:b.name,eventId,eventName,message:$('#intro-message').value.trim(),status:'pending'});
  persistProfile();
  closeSheet('intro-sheet');
  renderCircle();
  showToast(`Presentación enviada a ${a.name} y ${b.name}. El chat se abrirá si ambos aceptan.`);
};
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
renderUpcomingEvents();
renderOwnProfile();
