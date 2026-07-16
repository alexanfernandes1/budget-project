// ===================== THEME (light default, dark optional) =====================
const THEME_KEY = 'budgetAlex_theme';
(function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  if(saved === 'dark') document.body.classList.add('dark');
})();
(function(){
  const btn = document.getElementById('themeToggle');
  if(btn){
    btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    btn.addEventListener('click', ()=>{
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
      btn.textContent = isDark ? '☀️' : '🌙';
      if(typeof refreshAll === 'function') refreshAll(); // re-render pour redessiner les graphiques aux bonnes couleurs
    });
  }
})();

// ===================== DATA LAYER =====================
const SEED = JSON.parse(document.getElementById('seed-data').textContent);
const LS_KEY = 'budgetAlex_overlay_v1';

const MONTH_NAMES = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const CATEGORIES_COMPTE = ['LCL','Amex','Virement LCL','Virement CC LCL','Virement N26','Remboursement LCL','Epargne Livret A','Epargne Livret Léandre','Epargne LDDS','Epargne Joint','Salaire','Prélèvement LCL','Epargne Entreprise','Autre'];

// Keyword -> spending-type category (derived, for meaningful analytics; the original
// "Catégorie" column in the source file is actually the payment account/rail, kept as "compte")
const CAT_RULES = [
  ['Salaire', /salaire/i],
  ['Épargne', /epargne|livret|assurance vie/i],
  ['Logement & charges', /loyer|charges appartement|electricit|eau|gaz|taxe fonciere|internet|box|assurance habitation/i],
  ['Enfant', /couches|cantine|assistante maternelle|leandre|petit bateau|crèche|creche/i],
  ['Abonnements', /netflix|canal ?\+|youtube|microsoft|icloud|spotify|deezer|disney|amazon prime|sfr|wellpass|darty max/i],
  ['Transport', /essence|sanef|peage|péage|autoroute|bolt|navigo|parking|pneu|carrossier|assurance auto/i],
  ['Alimentation', /courses|supermarch|boulangerie|pain|resto|restaurant|pizzeria|grec|casto\b/i],
  ['Santé', /psycholog|piscine|pharmac|médec|medec|dentiste/i],
  ['Prêt & crédit', /pr[êe]t|crédit|credit/i],
  ['Cadeaux & shopping', /cadeau|balibaris|abercrombie|rowenta|jardiland|bagage|vetement|vêtement/i],
  ['Loisirs & voyages', /center parcs|ile de r|solidays|resto|voyage|hotel|hôtel/i],
];
function deriveCategoryType(item){
  if(!item) return 'Autre';
  for(const [name, re] of CAT_RULES){ if(re.test(item)) return name; }
  return 'Autre';
}
// Une ligne peut porter une catégorie choisie explicitement (via la modale) ; à défaut,
// on retombe sur la déduction automatique par mots-clés (lignes historiques importées).
function getCategoryType(it){ return (it && it.categorieType) || deriveCategoryType(it && it.item); }
const CATEGORY_TYPES = ['Alimentation','Transport','Logement & charges','Abonnements','Enfant','Santé','Épargne','Prêt & crédit','Cadeaux & shopping','Loisirs & voyages','Salaire','Autre'];
// Catégories dont la nature est habituellement récurrente (loyer, salaire, abonnements...) :
// sert de valeur par défaut intelligente pour les lignes historiques importées, qui n'ont pas
// de statut "récurrent" explicite dans le fichier Excel d'origine.
const RECURRING_DEFAULT_CATEGORIES = ['Salaire','Logement & charges','Abonnements','Prêt & crédit','Épargne'];
function isRecurringByDefault(item){ return RECURRING_DEFAULT_CATEGORIES.includes(deriveCategoryType(item)); }
// Avant cette date, les dépenses n'ont pas été catégorisées consciemment : les graphiques
// de répartition par catégorie ne sont donc affichés qu'à partir de ce mois.
const CATEGORY_START_KEY = '2026-08';
function hasCategoryData(key){ return key >= CATEGORY_START_KEY; }
// Palette sombre : lisible sur fonds foncés (thème sombre). Utilisée aussi telle quelle
// pour les remplissages du donut, où le contraste avec le texte n'entre pas en jeu.
const CAT_COLORS_DARK = {
  'Alimentation':'#7fd9cd','Transport':'#d9b45f','Logement & charges':'#e0836f','Abonnements':'#8fa8d9',
  'Enfant':'#c98fd9','Santé':'#5fbf8f','Épargne':'#4fb3a9','Prêt & crédit':'#a3a3a3','Cadeaux & shopping':'#e0c07f',
  'Loisirs & voyages':'#e08fc0','Salaire':'#5fbf8f','Autre':'#7f92a3'
};
// Palette claire : mêmes teintes assombries pour rester lisibles en texte sur fond clair
// (les pastels sombres ci-dessus étaient quasi invisibles en thème clair, contraste <2:1).
const CAT_COLORS_LIGHT = {
  'Alimentation':'#166f63','Transport':'#8f5c09','Logement & charges':'#b5462d','Abonnements':'#3d5da3',
  'Enfant':'#8a3aa8','Santé':'#177049','Épargne':'#1f7a70','Prêt & crédit':'#5f5f5f','Cadeaux & shopping':'#7a5c0e',
  'Loisirs & voyages':'#a13a76','Salaire':'#177049','Autre':'#54636d'
};
function getCatColor(cat){
  const pal = document.body.classList.contains('dark') ? CAT_COLORS_DARK : CAT_COLORS_LIGHT;
  return pal[cat] || pal['Autre'];
}

function loadOverlay(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }catch(e){ return {}; }
}
function saveOverlay(ov){ localStorage.setItem(LS_KEY, JSON.stringify(ov)); }

let overlay = loadOverlay();

// Merge seed + overlay for a given month key "YYYY-MM"
function withRecurrentDefault(it, id){
  return { ...it, _id: id, recurrent: it.recurrent!==undefined ? it.recurrent : isRecurringByDefault(it.item) };
}
function getMonth(key){
  const base = SEED[key];
  const ov = overlay[key];
  if(!ov && !base) return null;
  if(!ov) return { summary: {...base.summary}, items: base.items.map((it,i)=>withRecurrentDefault(it, key+'-'+i)) };
  // overlay fully replaces items list (we always write full arrays), summary is merged
  const items = ov.items ? ov.items.map((it,i)=>withRecurrentDefault(it, key+'-'+i)) : (base? base.items.map((it,i)=>withRecurrentDefault(it, key+'-'+i)) : []);
  const summary = { ...(base?base.summary:{}), ...(ov.summary||{}) };
  return { summary, items };
}
function setMonthItems(key, items){
  if(!overlay[key]) overlay[key] = {};
  overlay[key].items = items.map(({_id, ...rest})=>rest);
  saveOverlay(overlay);
}
function allMonthKeys(){
  const keys = new Set([...Object.keys(SEED), ...Object.keys(overlay)]);
  return [...keys].sort();
}

// ===================== STATE =====================
const keys = allMonthKeys();
let today = new Date();
let currentKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
if(!keys.includes(currentKey)){
  // fall back to the closest available month (last one <= today, else last overall)
  const past = keys.filter(k=>k<=currentKey);
  currentKey = past.length ? past[past.length-1] : keys[keys.length-1];
}
let editingId = null;

// ===================== HELPERS =====================
const fmt = n => (n===null||n===undefined||isNaN(n)) ? '—' : n.toLocaleString('fr-FR',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
const fmtShort = n => (n===null||n===undefined||isNaN(n)) ? '—' : n.toLocaleString('fr-FR',{maximumFractionDigits:0}) + ' €';
function monthLabel(key){
  const [y,m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m-1]} ${y}`;
}
function shiftKey(key, delta){
  let [y,m] = key.split('-').map(Number);
  m += delta;
  while(m>12){m-=12;y++;}
  while(m<1){m+=12;y--;}
  return `${y}-${String(m).padStart(2,'0')}`;
}
// opts.actionLabel/opts.onAction affichent un lien cliquable dans le toast (ex : "Voir" pour
// sauter vers un autre mois) sans interrompre la saisie en cours sur le mois affiché.
function showToast(msg, opts){
  const t = document.getElementById('toast');
  clearTimeout(showToast._t);
  if(opts && opts.actionLabel && opts.onAction){
    t.innerHTML = `${esc(msg)} <span class="toast-action">${esc(opts.actionLabel)}</span>`;
    t.querySelector('.toast-action').addEventListener('click', ()=>{ opts.onAction(); t.classList.remove('show'); });
  }else{
    t.textContent = msg;
  }
  t.classList.add('show');
  showToast._t = setTimeout(()=>t.classList.remove('show'), opts && opts.actionLabel ? 4000 : 2200);
}
function esc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Compute derived numbers for a month: real spend (traité expenses), planned spend, income realized/planned
function computeMonthStats(m){
  let realDep=0, realRec=0, prevDep=0, prevRec=0;
  let realTransferIn=0, prevTransferIn=0; // régularisations épargne -> compte courant : pas de vrai "revenu"
  const byCat = {};
  (m.items||[]).forEach(it=>{
    const amt = it.montant;
    if(amt===null||amt===undefined) return;
    const isIncome = amt>0 && (it.categorie==='Salaire');
    const val = Math.abs(amt);
    const isEpargneCat = /^epargne/i.test(it.categorie||'');
    const signedIsCredit = amt < 0; // négatif = crédit, sauf régularisation épargne (traitée à part)
    if(isEpargneCat && signedIsCredit){
      if(it.traite) realTransferIn += val; else prevTransferIn += val;
      return; // exclu des recettes/dépenses et de la répartition par catégorie
    }
    let effectiveIsExpense = !isIncome && !signedIsCredit;
    if(it.traite){
      if(isIncome || signedIsCredit) realRec += val; else realDep += val;
    }else{
      if(isIncome || signedIsCredit) prevRec += val; else prevDep += val;
    }
    const catType = getCategoryType(it);
    if(effectiveIsExpense || (!isIncome && signedIsCredit)){
      const key = catType;
      byCat[key] = (byCat[key]||0) + (signedIsCredit? -val : val);
    }
  });
  return { realDep, realRec, prevDep, prevRec, realTransferIn, prevTransferIn, byCat };
}

// Calcule l'En cours et le Prévisionnel en direct à partir de la balance du mois précédent
// et des lignes du mois. Ainsi les KPI se mettent à jour dès qu'on ajoute/modifie une ligne.
// Le salaire est déjà une ligne "Salaire" dans le tableau (compté dans realRec), donc on
// ne rajoute PAS le champ "revenu" séparément — ce serait un double comptage.
// - En cours    = balance début de mois + (recettes+régul traitées) - (dépenses traitées)
// - Prévisionnel = En cours + tout ce qui reste "à venir" (non traité)
function computeLiveBalances(m){
  const s = m.summary || {};
  const st = computeMonthStats(m);
  const base = (s.balance_prec ?? 0);
  const encours = base + st.realRec + st.realTransferIn - st.realDep;
  const previsionnel = encours + st.prevRec + st.prevTransferIn - st.prevDep;
  return { encours, previsionnel };
}

// Association compte d'épargne (champ "Compte / moyen de paiement") -> clé du solde correspondant.
const LIVRET_ACCOUNT_FIELD = {
  'Epargne Livret A': 'livretA',
  'Epargne Livret Léandre': 'livretA_leandre',
  'Epargne LDDS': 'livretDDS',
  'Epargne Joint': 'livretJoint'
};
// Comme "En cours" pour le compte courant, le solde affiché d'un livret = solde de début de mois
// + mouvements déjà "Traité" qui lui sont rattachés. Une ligne "Dépense" (montant positif) est un
// versement qui alimente le livret ; une "Recette"/régularisation (montant négatif) est un retrait
// vers le compte courant. Les lignes non traitées n'affectent pas encore le solde affiché.
function computeLiveLivretBalances(m){
  const s = m.summary || {};
  // null/undefined = ce profil ne possède pas ce livret : on le laisse tel quel (affiché "—"),
  // sans le confondre avec un livret existant à 0€.
  const bases = {};
  for(const field of Object.values(LIVRET_ACCOUNT_FIELD)){
    bases[field] = (s[field]===null || s[field]===undefined) ? null : s[field];
  }
  (m.items||[]).forEach(it=>{
    const field = LIVRET_ACCOUNT_FIELD[it.categorie];
    if(!field || !it.traite || it.montant===null || it.montant===undefined) return;
    if(bases[field]===null) return;
    bases[field] += it.montant;
  });
  return bases;
}

// ===================== RENDER: DASHBOARD =====================
function renderDashboard(){
  const m = getMonth(currentKey);
  const el = document.getElementById('view-dashboard');
  if(!m){ el.innerHTML = '<div class="empty">Aucune donnée pour ce mois. Utilisez « Nouveau mois » depuis l\'onglet Suivi.</div>'; return; }
  const s = m.summary;
  const stats = computeMonthStats(m);
  const live = computeLiveBalances(m);
  const liveLivrets = computeLiveLivretBalances(m);
  const soldeColor = (v)=> v===null||v===undefined ? '' : (v>=0?'pos':'neg');

  const upcoming = m.items.filter(it=>!it.traite && it.montant).sort((a,b)=> (a.echeance||'9999').localeCompare(b.echeance||'9999')).slice(0,6);

  const th = chartColors();
  el.innerHTML = `
    <div class="grid">
      <div class="card"><div class="eyebrow">Balance mois précédent</div><div class="value ${soldeColor(s.balance_prec)}">${fmt(s.balance_prec)}</div></div>
      <div class="card accent"><div class="eyebrow">Revenu mensuel</div><div class="value pos">${fmt(s.revenu)}</div></div>
      <div class="card"><div class="eyebrow">En cours (compte courant)</div><div class="value ${soldeColor(live.encours)}">${fmt(live.encours)}</div></div>
      <div class="card"><div class="eyebrow">Prévisionnel fin de mois</div><div class="value ${soldeColor(live.previsionnel)}">${fmt(live.previsionnel)}</div></div>
    </div>

    <div class="section-title">Épargne <span class="hint">Livrets à date</span></div>
    <div class="grid">
      <div class="card"><div class="eyebrow">Livret A</div><div class="value">${fmt(liveLivrets.livretA)}</div></div>
      <div class="card accent"><div class="eyebrow">Livret A · Léandre</div><div class="value">${fmt(liveLivrets.livretA_leandre)}</div><div class="sub">Épargne de votre fils</div></div>
      <div class="card"><div class="eyebrow">LDDS</div><div class="value">${fmt(liveLivrets.livretDDS)}</div></div>
      <div class="card"><div class="eyebrow">Livret Joint</div><div class="value">${fmt(liveLivrets.livretJoint)}</div></div>
    </div>

    <div class="section-title">Ce mois-ci <span class="hint">traité vs. prévu</span></div>
    <div class="panel" style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
      <canvas id="chartRealVsPrev" width="320" height="160"></canvas>
      <div class="legend">
        <div><span class="dot" style="background:${th.pos}"></span>Recettes traitées : ${fmt(stats.realRec)}</div>
        <div><span class="dot" style="background:${th.neg}"></span>Dépenses traitées : ${fmt(stats.realDep)}</div>
        <div><span class="dot" style="background:${th.pos};opacity:.35"></span>Recettes à venir : ${fmt(stats.prevRec)}</div>
        <div><span class="dot" style="background:${th.neg};opacity:.35"></span>Dépenses à venir : ${fmt(stats.prevDep)}</div>
      </div>
    </div>
    ${(stats.realTransferIn||stats.prevTransferIn) ? `
    <div class="panel" style="margin-top:8px;">
      <div class="eyebrow">Régularisations épargne → compte courant <span style="text-transform:none;">(pas des recettes réelles, juste un déplacement de votre argent)</span></div>
      <div style="font-family:var(--serif);font-size:16px;margin-top:4px;">${fmt(stats.realTransferIn)} ${stats.prevTransferIn? ` <span style="color:var(--muted);font-size:12px;">+ ${fmt(stats.prevTransferIn)} prévu</span>`:''}</div>
    </div>` : ''}

    ${hasCategoryData(currentKey) ? `
    <div class="section-title">Répartition des dépenses (ce mois)</div>
    <div class="panel" style="display:flex;gap:22px;flex-wrap:wrap;align-items:center;">
      <canvas id="chartDonut" width="180" height="180"></canvas>
      <div class="legend" id="donutLegend"></div>
    </div>` : ''}

    <div class="section-title">Prochaines échéances non traitées <span class="hint">${m.items.filter(it=>!it.traite && it.montant).length} au total</span></div>
    <div class="panel">
      ${upcoming.length? `<table class="tx"><thead><tr><th>Libellé</th><th>Échéance</th><th style="text-align:right">Montant</th></tr></thead><tbody>
        ${upcoming.map(it=>`<tr><td>${esc(it.item)||'—'}</td><td>${it.echeance? new Date(it.echeance).toLocaleDateString('fr-FR'):'—'}</td><td class="amt ${it.montant<0?'pos':'neg'}">${fmt(it.montant)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Tout est traité pour ce mois 🎉</div>'}
    </div>
  `;

  safeDraw(()=>drawBarPairs('chartRealVsPrev', [
    {label:'Recettes', a:stats.realRec, b:stats.prevRec, colorA:th.pos, colorB:th.pos+'55'},
    {label:'Dépenses', a:stats.realDep, b:stats.prevDep, colorA:th.neg, colorB:th.neg+'55'},
  ]));
  if(hasCategoryData(currentKey)) safeDraw(()=>drawDonut('chartDonut', stats.byCat, 'donutLegend'));
}

// ===================== RENDER: TRANSACTIONS =====================
let txFilter = { text:'', cat:'all', status:'all', rec:'all' };
function renderTransactions(){
  const el = document.getElementById('view-transactions');
  const m = getMonth(currentKey);
  el.innerHTML = `
    <div class="kpi-bar" id="kpiBar"></div>
    <div class="section-title">Suivi du budget — ${monthLabel(currentKey)}
      <span class="hint"><button class="btn ghost small" id="btnNewMonth">Créer le mois suivant à partir de celui-ci</button></span>
    </div>
    <div class="filter-bar">
      <button class="scroll-jump-inline" id="scrollDownBtnMobile" title="Aller en bas du tableau" aria-label="Aller en bas du tableau">↓</button>
      <input type="text" id="txSearch" placeholder="Rechercher un libellé…" value="${esc(txFilter.text)}">
      <select id="txCatFilter"><option value="all">Toutes catégories</option>${CATEGORY_TYPES.map(c=>`<option value="${c}" ${txFilter.cat===c?'selected':''}>${c}</option>`).join('')}</select>
      <select id="txStatusFilter">
        <option value="all" ${txFilter.status==='all'?'selected':''}>Tous statuts</option>
        <option value="done" ${txFilter.status==='done'?'selected':''}>Traité</option>
        <option value="pending" ${txFilter.status==='pending'?'selected':''}>À venir</option>
      </select>
      <select id="txRecFilter">
        <option value="all" ${txFilter.rec==='all'?'selected':''}>Récurrent : tous</option>
        <option value="rec" ${txFilter.rec==='rec'?'selected':''}>🔁 Récurrentes</option>
        <option value="once" ${txFilter.rec==='once'?'selected':''}>Ponctuelles</option>
      </select>
    </div>
    <div class="panel" style="padding:0;">
      <table class="tx" id="txTable"><thead><tr>
        <th style="width:34px;"></th><th>Libellé</th><th>Catégorie</th><th>Compte</th><th style="text-align:right;">Montant</th><th></th>
      </tr></thead><tbody></tbody></table>
    </div>
  `;
  document.getElementById('txSearch').addEventListener('input', e=>{ txFilter.text = e.target.value; renderTxRows(getMonth(currentKey)); });
  document.getElementById('txCatFilter').addEventListener('change', e=>{ txFilter.cat = e.target.value; renderTxRows(getMonth(currentKey)); });
  document.getElementById('txStatusFilter').addEventListener('change', e=>{ txFilter.status = e.target.value; renderTxRows(getMonth(currentKey)); });
  document.getElementById('txRecFilter').addEventListener('change', e=>{ txFilter.rec = e.target.value; renderTxRows(getMonth(currentKey)); });
  document.getElementById('btnNewMonth').addEventListener('click', createNextMonth);
  document.getElementById('scrollDownBtnMobile').addEventListener('click', scrollToTableBottom);
  renderKpiBar(m);
  renderTxRows(m);
}
function renderKpiBar(m){
  const bar = document.getElementById('kpiBar');
  if(!bar) return;
  if(!m){ bar.innerHTML = ''; return; }
  const live = computeLiveBalances(m);
  const cls = v => v===null||v===undefined ? '' : (v>=0?'pos':'neg');
  const epargne = computeLiveLivretBalances(m).livretA; // livret A principal comme indicateur d'épargne
  bar.innerHTML = `
    <div class="kpi"><div class="k-label">En cours</div><div class="k-value ${cls(live.encours)}">${fmt(live.encours)}</div></div>
    <div class="kpi"><div class="k-label">Prévisionnel</div><div class="k-value ${cls(live.previsionnel)}">${fmt(live.previsionnel)}</div></div>
    <div class="kpi"><div class="k-label">Épargne (Livret A)</div><div class="k-value">${fmt(epargne)}</div></div>
  `;
}
function renderTxRows(m){
  const tbody = document.querySelector('#txTable tbody');
  if(!m){ tbody.innerHTML = `<tr><td colspan="6" class="empty">Mois vide.</td></tr>`; return; }
  let items = m.items.filter(it=>it.item || it.montant);
  if(txFilter.text) items = items.filter(it=> (it.item||'').toLowerCase().includes(txFilter.text.toLowerCase()));
  if(txFilter.cat!=='all') items = items.filter(it=> getCategoryType(it)===txFilter.cat);
  if(txFilter.status==='done') items = items.filter(it=>it.traite);
  if(txFilter.status==='pending') items = items.filter(it=>!it.traite);
  if(txFilter.rec==='rec') items = items.filter(it=>it.recurrent);
  if(txFilter.rec==='once') items = items.filter(it=>!it.recurrent);

  if(!items.length){ tbody.innerHTML = `<tr><td colspan="6" class="empty">Aucune ligne ne correspond.</td></tr>`; return; }

  tbody.innerHTML = items.map(it=>{
    const catType = getCategoryType(it);
    const isCredit = it.montant<0;
    return `<tr data-id="${it._id}">
      <td><button class="chk ${it.traite?'done':''}" data-toggle="${it._id}">${it.traite?'✓':''}</button></td>
      <td>${it.recurrent?'<span title="Récurrent" style="opacity:.6;margin-right:4px;">🔁</span>':''}${it.item? esc(it.item) : '<span style="color:var(--muted-2)">(sans libellé)</span>'}</td>
      <td><span class="tag" style="color:${getCatColor(catType)}">${catType}</span></td>
      <td><span class="tag">${esc(it.categorie)||'—'}</span></td>
      <td class="amt ${isCredit?'pos':'neg'}">${it.montant!==null&&it.montant!==undefined? fmt(it.montant):'—'}</td>
      <td class="row-actions"><button class="icon-btn" data-edit="${it._id}">✎</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-toggle]').forEach(b=> b.addEventListener('click', ()=> toggleTraite(b.dataset.toggle)));
  tbody.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openItemModal(b.dataset.edit)));
}
function toggleTraite(id){
  const m = getMonth(currentKey);
  const items = m.items.map(it=> it._id===id ? {...it, traite: !it.traite} : it);
  setMonthItems(currentKey, items);
  const updated = getMonth(currentKey);
  renderTxRows(updated);
  renderKpiBar(updated);
  renderDashboard();
}
function createNextMonth(){
  const nextKey = shiftKey(currentKey, 1);
  const cur = getMonth(currentKey);
  if(!cur){ showToast('Rien à dupliquer.'); return; }
  const existing = getMonth(nextKey);
  if(existing && existing.items.some(it=>it.item||it.montant)){
    if(!confirm(`${monthLabel(nextKey)} contient déjà ${existing.items.length} lignes. Les remplacer par les lignes récurrentes de ${monthLabel(currentKey)} ?`)) return;
  }
  const recurring = cur.items.filter(it=>it.item && it.recurrent).map(it=>({
    item: it.item, echeance: null, categorie: it.categorie, categorieType: it.categorieType, montant: it.montant, traite:false, recurrent:true
  }));
  if(!recurring.length){ showToast("Aucune ligne récurrente à reprendre — marquez vos dépenses/recettes fixes comme récurrentes."); }
  // Les livrets partent du solde réellement atteint ce mois-ci (départ + versements/retraits traités),
  // pas du solde figé de début de mois — sinon toute évolution saisie dans l'app serait perdue au mois suivant.
  const liveLivrets = computeLiveLivretBalances(cur);
  overlay[nextKey] = {
    summary: { balance_prec: cur.summary.previsionnel ?? cur.summary.encours ?? null, revenu: cur.summary.revenu, livretA: liveLivrets.livretA, livretA_leandre: liveLivrets.livretA_leandre, livretDDS: liveLivrets.livretDDS, livretJoint: liveLivrets.livretJoint, encours: cur.summary.previsionnel ?? cur.summary.encours ?? null, previsionnel: cur.summary.previsionnel ?? null },
    items: recurring
  };
  saveOverlay(overlay);
  if(!keys.includes(nextKey)){ keys.push(nextKey); keys.sort(); }
  currentKey = nextKey;
  refreshAll();
  showToast('Mois '+monthLabel(nextKey)+' créé à partir des lignes récurrentes.');
}

// ===================== ITEM MODAL =====================
function populateSelects(){
  const catSel = document.getElementById('f_categorie');
  catSel.innerHTML = CATEGORIES_COMPTE.map(c=>`<option value="${c}">${c}</option>`).join('');
  const typeSel = document.getElementById('f_categorie_type');
  typeSel.innerHTML = CATEGORY_TYPES.map(c=>`<option value="${c}">${c}</option>`).join('');
}
function openItemModal(id){
  editingId = id || null;
  const bg = document.getElementById('itemModalBg');
  document.getElementById('itemModalTitle').textContent = id? 'Modifier la ligne' : 'Nouvelle ligne';
  document.getElementById('btnDeleteItem').style.display = id? 'inline-block':'none';
  const monthSel = document.getElementById('f_month');
  monthSel.innerHTML = keys.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join('');
  monthSel.value = currentKey;
  if(id){
    const m = getMonth(currentKey);
    const it = m.items.find(x=>x._id===id);
    document.getElementById('f_item').value = it.item||'';
    const isCredit = it.montant<0;
    document.getElementById('f_montant').value = it.montant!==null? Math.abs(it.montant):'';
    document.getElementById('f_sens').value = isCredit? 'recette':'depense';
    document.getElementById('f_categorie_type').value = getCategoryType(it);
    document.getElementById('f_categorie').value = it.categorie || 'LCL';
    document.getElementById('f_echeance').value = it.echeance || new Date().toISOString().slice(0,10);
    document.getElementById('f_echeance_confirm').checked = !!it.echeance;
    document.getElementById('f_traite').checked = !!it.traite;
    document.getElementById('f_recurrent').checked = !!it.recurrent;
  }else{
    document.getElementById('f_item').value = '';
    document.getElementById('f_montant').value = '';
    document.getElementById('f_sens').value = 'depense';
    document.getElementById('f_categorie_type').value = 'Autre';
    document.getElementById('f_categorie').value = 'LCL';
    document.getElementById('f_echeance').value = new Date().toISOString().slice(0,10);
    document.getElementById('f_echeance_confirm').checked = false;
    document.getElementById('f_traite').checked = false;
    document.getElementById('f_recurrent').checked = false;
  }
  categoryTypeTouched = false;
  updateSensLabels();
  bg.classList.add('show');
}
// Sur un compte d'épargne, "Dépense"/"Recette" est trompeur (verser sur son Livret A n'est pas
// vécu comme une "dépense") : on reformule selon le sens réel de l'argent pour ce compte-là.
function updateSensLabels(){
  const isEpargne = /^epargne/i.test(document.getElementById('f_categorie').value);
  const sensSel = document.getElementById('f_sens');
  sensSel.options[0].text = isEpargne ? "Versement vers l'épargne" : 'Dépense';
  sensSel.options[1].text = isEpargne ? 'Retrait vers le compte courant' : 'Recette';
}
document.getElementById('f_categorie').addEventListener('change', updateSensLabels);
// Pour une nouvelle ligne (tant que l'utilisateur n'a pas choisi la catégorie lui-même),
// on la déduit automatiquement du libellé au fil de la saisie.
let categoryTypeTouched = false;
document.getElementById('f_item').addEventListener('input', e=>{
  if(!editingId && !categoryTypeTouched) document.getElementById('f_categorie_type').value = deriveCategoryType(e.target.value);
});
// Pour une nouvelle ligne, suggère automatiquement "récurrent" si la catégorie choisie
// est habituellement fixe (loyer, salaire, abonnement...) — reste modifiable par l'utilisateur.
document.getElementById('f_categorie_type').addEventListener('change', e=>{
  categoryTypeTouched = true;
  if(!editingId) document.getElementById('f_recurrent').checked = RECURRING_DEFAULT_CATEGORIES.includes(e.target.value);
});
function closeItemModal(){ document.getElementById('itemModalBg').classList.remove('show'); editingId=null; }
function saveItemModal(){
  const item = document.getElementById('f_item').value.trim();
  let montant = parseFloat(document.getElementById('f_montant').value);
  if(isNaN(montant)) montant = null;
  const sens = document.getElementById('f_sens').value;
  const categorie = document.getElementById('f_categorie').value;
  const categorieType = document.getElementById('f_categorie_type').value;
  const echeance = document.getElementById('f_echeance_confirm').checked ? (document.getElementById('f_echeance').value || null) : null;
  const traite = document.getElementById('f_traite').checked;
  const recurrent = document.getElementById('f_recurrent').checked;
  if(montant!==null && sens==='recette' && categorie!=='Salaire') montant = -Math.abs(montant);
  else if(montant!==null) montant = Math.abs(montant);

  const monthField = document.getElementById('f_month').value;
  const targetKey = keys.includes(monthField) ? monthField : currentKey;
  const wasEditing = !!editingId;
  const payload = { item, montant, categorie, categorieType, echeance, traite, recurrent };

  if(targetKey === currentKey){
    let m = getMonth(currentKey);
    if(!m){ m = {summary:{}, items:[]}; }
    let items = [...m.items];
    if(wasEditing) items = items.map(it=> it._id===editingId? {...it, ...payload} : it);
    else items.push(payload);
    setMonthItems(currentKey, items);
  }else{
    // Ligne saisie/déplacée vers un autre mois que celui affiché : on garde currentKey
    // inchangé (l'utilisateur reste sur sa page) et on écrit dans les données du mois cible.
    if(wasEditing){
      const cur = getMonth(currentKey);
      setMonthItems(currentKey, cur.items.filter(it=>it._id!==editingId));
    }
    const target = getMonth(targetKey) || {summary:{}, items:[]};
    setMonthItems(targetKey, [...target.items, payload]);
  }

  closeItemModal();
  refreshAll();

  if(targetKey === currentKey){
    showToast('Ligne enregistrée.');
  }else{
    const verb = wasEditing ? 'déplacée vers' : 'ajoutée à';
    showToast(`Ligne ${verb} ${monthLabel(targetKey)}.`, { actionLabel:'Voir', onAction: ()=>{ currentKey = targetKey; refreshAll(); } });
  }
}
function deleteItemModal(){
  if(!editingId) return;
  const m = getMonth(currentKey);
  const items = m.items.filter(it=>it._id!==editingId);
  setMonthItems(currentKey, items);
  closeItemModal();
  refreshAll();
  showToast('Ligne supprimée.');
}

// ===================== RENDER: ANALYSES =====================
function renderAnalyses(){
  const el = document.getElementById('view-analyses');
  const range = last12KeysEndingAt(currentKey);
  el.innerHTML = `
    <div class="section-title">Évolution du solde <span class="hint">12 derniers mois disponibles</span></div>
    <div class="panel"><canvas id="chartBalance" width="900" height="220"></canvas></div>

    <div class="section-title">Revenus vs dépenses traitées</div>
    <div class="panel"><canvas id="chartIncomeExpense" width="900" height="220"></canvas></div>

    <div class="section-title">Répartition des dépenses <span class="hint">cumul depuis août 2026</span></div>
    ${last12KeysEndingAt(currentKey).some(hasCategoryData) ? `
    <div class="panel" style="display:flex;gap:22px;flex-wrap:wrap;align-items:center;">
      <canvas id="chartDonutAll" width="200" height="200"></canvas>
      <div class="legend" id="donutAllLegend"></div>
    </div>` : `<div class="panel"><div class="empty">Disponible à partir d'août 2026 (avant cette date, les dépenses n'étaient pas catégorisées).</div></div>`}
  `;
  const monthsData = range.map(k=>({key:k, m:getMonth(k)})).filter(x=>x.m);
  safeDraw(()=>drawLine('chartBalance', monthsData.map(x=>({label:monthLabel(x.key).split(' ')[0].slice(0,3), value:x.m.summary.encours}))));
  safeDraw(()=>drawGroupedBars('chartIncomeExpense', monthsData.map(x=>{
    const s = computeMonthStats(x.m);
    return {label:monthLabel(x.key).split(' ')[0].slice(0,3), a:s.realRec, b:s.realDep};
  })));
  const combinedCat = {};
  monthsData.filter(x=>hasCategoryData(x.key)).forEach(x=>{
    const s = computeMonthStats(x.m);
    Object.entries(s.byCat).forEach(([k,v])=> combinedCat[k]=(combinedCat[k]||0)+v);
  });
  if(last12KeysEndingAt(currentKey).some(hasCategoryData)) safeDraw(()=>drawDonut('chartDonutAll', combinedCat, 'donutAllLegend'));
}
function last12KeysEndingAt(key){
  const idx = keys.indexOf(key);
  const upto = idx>=0? keys.slice(0, idx+1) : keys;
  return upto.slice(-12);
}

// ===================== RENDER: EPARGNE =====================
function renderEpargne(){
  const el = document.getElementById('view-epargne');
  const range = last12KeysEndingAt(currentKey);
  const m = getMonth(currentKey);
  const liveLivrets = m ? computeLiveLivretBalances(m) : {};
  el.innerHTML = `
    <div class="section-title">Évolution de l'épargne <span class="hint">Livret A</span></div>
    <div class="panel"><canvas id="chartLivretA" width="900" height="220"></canvas></div>
    <div class="section-title">Évolution de l'épargne <span class="hint">Livret A · Léandre</span></div>
    <div class="panel"><canvas id="chartLivretALeandre" width="900" height="220"></canvas></div>
    <div class="grid" style="margin-top:16px;">
      <div class="card"><div class="eyebrow">Livret A</div><div class="value">${fmt(liveLivrets.livretA)}</div></div>
      <div class="card"><div class="eyebrow">Livret A Léandre</div><div class="value">${fmt(liveLivrets.livretA_leandre)}</div></div>
      <div class="card"><div class="eyebrow">LDDS</div><div class="value">${fmt(liveLivrets.livretDDS)}</div></div>
      <div class="card"><div class="eyebrow">Livret Joint</div><div class="value">${fmt(liveLivrets.livretJoint)}</div></div>
    </div>
  `;
  const monthsData = range.map(k=>({key:k, m:getMonth(k)})).filter(x=>x.m);
  safeDraw(()=>drawLine('chartLivretA', monthsData.map(x=>({label:monthLabel(x.key).split(' ')[0].slice(0,3), value:computeLiveLivretBalances(x.m).livretA}))));
  safeDraw(()=>drawLine('chartLivretALeandre', monthsData.map(x=>({label:monthLabel(x.key).split(' ')[0].slice(0,3), value:computeLiveLivretBalances(x.m).livretA_leandre}))));
}

// ===================== CANVAS CHARTS (no dependencies) =====================
function setupCanvas(id){
  const c = document.getElementById(id);
  if(!c) return null;
  const dpr = window.devicePixelRatio||1;
  if(!c.dataset.baseH) c.dataset.baseH = c.getAttribute('height') || c.height;
  const w = c.clientWidth || c.width, h = parseInt(c.dataset.baseH);
  c.width = w*dpr; c.height = h*dpr;
  c.style.width = w+'px'; c.style.height = h+'px';
  const ctx = c.getContext('2d');
  if(!ctx) return null;
  ctx.scale(dpr,dpr);
  return {ctx, w, h};
}
// Couleurs de graphique dépendantes du thème actif (clair/sombre), lues sur les variables CSS
function chartColors(){
  const cs = getComputedStyle(document.body);
  return {
    grid: cs.getPropertyValue('--line').trim() || '#dde3e7',
    label: cs.getPropertyValue('--muted').trim() || '#63727b',
    ink: cs.getPropertyValue('--ink').trim() || '#182028',
    teal: cs.getPropertyValue('--teal').trim() || '#2f8f85',
    tealBright: cs.getPropertyValue('--teal-bright').trim() || '#1f6f66',
    pos: cs.getPropertyValue('--pos').trim() || '#1f9d63',
    neg: cs.getPropertyValue('--neg').trim() || '#c8503d',
  };
}
function safeDraw(fn){ try{ fn(); }catch(e){ console.warn('chart draw failed', e); } }
function drawLine(id, points){
  const setup = setupCanvas(id); if(!setup) return;
  const {ctx,w,h} = setup;
  const th = chartColors();
  ctx.clearRect(0,0,w,h);
  const pad = {l:50,r:16,t:16,b:26};
  const vals = points.map(p=>p.value).filter(v=>v!==null && v!==undefined);
  if(!vals.length){ ctx.fillStyle=th.label; ctx.font='12px sans-serif'; ctx.fillText('Pas de données', pad.l, h/2); return; }
  const min = Math.min(0, ...vals), max = Math.max(...vals);
  const range = (max-min)||1;
  const plotW = w-pad.l-pad.r, plotH = h-pad.t-pad.b;
  const x = i => pad.l + (points.length<=1?0:(i/(points.length-1))*plotW);
  const y = v => pad.t + plotH - ((v-min)/range)*plotH;
  // grid
  ctx.strokeStyle=th.grid; ctx.lineWidth=1;
  for(let i=0;i<=3;i++){
    const gy = pad.t + (plotH/3)*i;
    ctx.beginPath(); ctx.moveTo(pad.l,gy); ctx.lineTo(w-pad.r,gy); ctx.stroke();
  }
  ctx.fillStyle=th.label; ctx.font='11.5px sans-serif'; ctx.textAlign='right';
  ctx.fillText(fmtShort(max), pad.l-6, pad.t+4);
  ctx.fillText(fmtShort(min), pad.l-6, pad.t+plotH+2);
  // zero line
  if(min<0){ ctx.strokeStyle=th.label; ctx.beginPath(); ctx.moveTo(pad.l,y(0)); ctx.lineTo(w-pad.r,y(0)); ctx.stroke(); }
  // line + area
  ctx.beginPath();
  points.forEach((p,i)=>{ const px=x(i), py = p.value==null? null : y(p.value); if(py===null) return; i===0||points[i-1].value==null ? ctx.moveTo(px,py):ctx.lineTo(px,py); });
  ctx.strokeStyle=th.teal; ctx.lineWidth=2; ctx.stroke();
  ctx.lineTo(x(points.length-1), pad.t+plotH); ctx.lineTo(x(0), pad.t+plotH); ctx.closePath();
  ctx.globalAlpha=0.12; ctx.fillStyle=th.teal; ctx.fill(); ctx.globalAlpha=1;
  // points
  points.forEach((p,i)=>{ if(p.value==null) return; ctx.beginPath(); ctx.arc(x(i), y(p.value), 2.6, 0, 7); ctx.fillStyle=th.tealBright; ctx.fill(); });
  // x labels
  ctx.fillStyle=th.label; ctx.textAlign='center'; ctx.font='11.5px sans-serif';
  points.forEach((p,i)=>{ if(points.length>14 && i%2) return; ctx.fillText(p.label, x(i), h-8); });
}
function drawGroupedBars(id, rows){
  const setup = setupCanvas(id); if(!setup) return;
  const {ctx,w,h} = setup;
  const th = chartColors();
  ctx.clearRect(0,0,w,h);
  const pad={l:50,r:16,t:16,b:26};
  const vals = rows.flatMap(r=>[r.a||0,r.b||0]);
  const max = Math.max(1,...vals);
  const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const groupW = plotW/rows.length;
  const barW = Math.min(16, groupW/3);
  ctx.strokeStyle=th.grid;
  for(let i=0;i<=3;i++){ const gy=pad.t+(plotH/3)*i; ctx.beginPath(); ctx.moveTo(pad.l,gy); ctx.lineTo(w-pad.r,gy); ctx.stroke(); }
  ctx.fillStyle=th.label; ctx.font='11.5px sans-serif'; ctx.textAlign='right';
  ctx.fillText(fmtShort(max), pad.l-6, pad.t+4);
  rows.forEach((r,i)=>{
    const cx = pad.l + groupW*i + groupW/2;
    const ah = ((r.a||0)/max)*plotH, bh=((r.b||0)/max)*plotH;
    ctx.fillStyle=th.pos; ctx.fillRect(cx-barW-2, pad.t+plotH-ah, barW, ah);
    ctx.fillStyle=th.neg; ctx.fillRect(cx+2, pad.t+plotH-bh, barW, bh);
    ctx.fillStyle=th.label; ctx.textAlign='center'; ctx.fillText(r.label, cx, h-8);
  });
}
function drawBarPairs(id, groups){
  const setup = setupCanvas(id); if(!setup) return;
  const {ctx,w,h} = setup;
  ctx.clearRect(0,0,w,h);
  const pad={l:14,r:14,t:14,b:26};
  const vals = groups.flatMap(g=>[g.a||0,g.b||0]);
  const max = Math.max(1,...vals);
  const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const groupW = plotW/groups.length;
  const barW = Math.min(34, groupW/3.2);
  groups.forEach((g,i)=>{
    const cx = pad.l+groupW*i+groupW/2;
    const ah=((g.a||0)/max)*plotH, bh=((g.b||0)/max)*plotH;
    ctx.fillStyle=g.colorA; ctx.fillRect(cx-barW-3, pad.t+plotH-ah, barW, ah);
    ctx.fillStyle=g.colorB; ctx.fillRect(cx+3, pad.t+plotH-bh, barW, bh);
    ctx.fillStyle=chartColors().ink; ctx.font='12px sans-serif'; ctx.textAlign='center';
    ctx.fillText(g.label, cx, h-8);
  });
}
function drawDonut(id, byCat, legendId){
  const setup = setupCanvas(id); if(!setup) return;
  const {ctx,w,h} = setup;
  ctx.clearRect(0,0,w,h);
  const entries = Object.entries(byCat).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const legend = document.getElementById(legendId);
  if(!entries.length){
    ctx.fillStyle=chartColors().label; ctx.font='12px sans-serif'; ctx.textAlign='center'; ctx.fillText('Pas de dépenses', w/2, h/2);
    if(legend) legend.innerHTML='';
    return;
  }
  const total = entries.reduce((s,[,v])=>s+v,0);
  const cx=w/2, cy=h/2, rOuter=Math.min(w,h)/2-6, rInner=rOuter*0.58;
  let ang=-Math.PI/2;
  entries.forEach(([cat,val])=>{
    const slice = (val/total)*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,rOuter,ang,ang+slice);
    ctx.closePath();
    ctx.fillStyle = getCatColor(cat);
    ctx.fill();
    ang += slice;
  });
  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath(); ctx.arc(cx,cy,rInner,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=chartColors().ink; ctx.font='13px sans-serif'; ctx.textAlign='center';
  ctx.fillText(fmtShort(total), cx, cy+4);

  if(legend){
    legend.innerHTML = entries.map(([cat,val])=>`<div><span class="dot" style="background:${getCatColor(cat)}"></span>${cat} — ${fmt(val)} (${Math.round(val/total*100)}%)</div>`).join('');
  }
}

// ===================== NAVIGATION =====================
function updateHeaderHeight(){
  const header = document.querySelector('header.top');
  if(header) document.documentElement.style.setProperty('--header-h', header.offsetHeight+'px');
}
function refreshAll(){
  document.getElementById('monthLabel').textContent = monthLabel(currentKey);
  const jump = document.getElementById('monthJump');
  const prevVal = jump.value;
  jump.innerHTML = keys.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join('');
  jump.value = keys.includes(currentKey)? currentKey : prevVal;
  updateHeaderHeight();
  renderDashboard();
  renderTransactions();
  renderAnalyses();
  renderEpargne();
  updateScrollJumpButtons();
}
document.getElementById('prevMonth').addEventListener('click', ()=>{ currentKey = shiftKey(currentKey,-1); if(!keys.includes(currentKey)) keys.push(currentKey), keys.sort(); refreshAll(); });
document.getElementById('nextMonth').addEventListener('click', ()=>{ currentKey = shiftKey(currentKey,1); if(!keys.includes(currentKey)) keys.push(currentKey), keys.sort(); refreshAll(); });
document.getElementById('monthJump').addEventListener('change', e=>{ currentKey = e.target.value; refreshAll(); });

document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
    window.scrollTo(0, 0); // change d'onglet = nouvel écran : on repart du haut, pas du scroll laissé par l'onglet précédent
    updateScrollJumpButtons();
  });
});

document.getElementById('fabAdd').addEventListener('click', ()=>openItemModal(null));

// ===================== BOUTONS SAUT HAUT/BAS DU TABLEAU =====================
// Visibles uniquement sur l'onglet "Suivi du mois" : flèche bas en haut de page, flèche haut en bas de page.
// Sur petit écran (<=640px), la flèche bas flottante est remplacée par une variante inline
// dans la filter-bar (#scrollDownBtnMobile, réinjectée à chaque renderTransactions).
const scrollDownBtn = document.getElementById('scrollDownBtn');
const scrollUpBtn = document.getElementById('scrollUpBtn');
function scrollToTableBottom(){ window.scrollTo({top: document.documentElement.scrollHeight, behavior:'smooth'}); }
function scrollToTableTop(){ window.scrollTo({top:0, behavior:'smooth'}); }
function updateScrollJumpButtons(){
  const onTransactions = document.getElementById('view-transactions').classList.contains('active');
  const downMobile = document.getElementById('scrollDownBtnMobile');
  if(!onTransactions){
    scrollDownBtn.classList.remove('show');
    scrollUpBtn.classList.remove('show');
    if(downMobile) downMobile.classList.remove('show');
    return;
  }
  const doc = document.documentElement;
  const threshold = 40;
  const scrollable = doc.scrollHeight > window.innerHeight + threshold;
  const nearTop = window.scrollY <= threshold;
  const nearBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - threshold;
  const showDown = scrollable && nearTop;
  scrollDownBtn.classList.toggle('show', showDown);
  if(downMobile) downMobile.classList.toggle('show', showDown);
  scrollUpBtn.classList.toggle('show', scrollable && nearBottom && !nearTop);
}
scrollDownBtn.addEventListener('click', scrollToTableBottom);
scrollUpBtn.addEventListener('click', scrollToTableTop);
window.addEventListener('scroll', updateScrollJumpButtons, {passive:true});

// Redessine les graphiques quand la fenêtre change de taille (rotation iPhone, redimensionnement PC)
let _resizeT = null;
window.addEventListener('resize', ()=>{ clearTimeout(_resizeT); _resizeT = setTimeout(()=>refreshAll(), 250); updateScrollJumpButtons(); });
document.getElementById('btnCancelItem').addEventListener('click', closeItemModal);
document.getElementById('btnSaveItem').addEventListener('click', saveItemModal);
document.getElementById('btnDeleteItem').addEventListener('click', deleteItemModal);
document.getElementById('itemModalBg').addEventListener('click', e=>{ if(e.target.id==='itemModalBg') closeItemModal(); });

document.getElementById('btnExport').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(overlay,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'budget_alex_sauvegarde_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
});
document.getElementById('btnImport').addEventListener('click', ()=> document.getElementById('fileImport').click());
document.getElementById('fileImport').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const imported = JSON.parse(reader.result);
      overlay = imported;
      saveOverlay(overlay);
      showToast('Sauvegarde importée.');
      location.reload();
    }catch(err){ showToast('Fichier invalide.'); }
  };
  reader.readAsText(file);
});

// ===================== ONEDRIVE SYNC (MSAL + Graph) =====================
const MSAL_CONFIG = {
  auth: {
    clientId: "d40ad8c2-12e1-4c29-bbb2-7207b4e9a9d0",
    authority: "https://login.microsoftonline.com/consumers",
    redirectUri: window.location.origin + window.location.pathname
  },
  cache: { cacheLocation: "localStorage" }
};
const SYNC_SCOPES = ["Files.ReadWrite.AppFolder", "User.Read"];
const REMOTE_FILE = "budget_overlay.json";
const OV_META_KEY = "budgetAlex_overlay_meta_v1";

let msalInstance = null;
let syncAccount = null;
let syncInProgress = false;

function getOverlayMeta(){
  try{ return JSON.parse(localStorage.getItem(OV_META_KEY)) || {updatedAt:0}; }catch(e){ return {updatedAt:0}; }
}
function touchOverlayMeta(){
  localStorage.setItem(OV_META_KEY, JSON.stringify({updatedAt: Date.now()}));
}
// wrap the existing saveOverlay so every local change is timestamped
const _saveOverlayOriginal = saveOverlay;
saveOverlay = function(ov){
  _saveOverlayOriginal(ov);
  touchOverlayMeta();
  scheduleSync();
};

function setSyncStatus(state, label){
  const dot = document.getElementById('syncDot');
  const lbl = document.getElementById('syncLabel');
  if(!dot) return;
  dot.className = 'sync-dot' + (state? ' '+state : '');
  if(lbl) lbl.textContent = label;
}

async function initMsal(){
  if(typeof msal === 'undefined'){
    setSyncStatus('error', 'OneDrive indisponible');
    return;
  }
  try{
    msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
    await msalInstance.initialize();
  }catch(e){
    console.error('MSAL init failed', e);
    msalInstance = null;
    setSyncStatus('error', 'OneDrive indisponible');
    return;
  }
  try{
    const resp = await msalInstance.handleRedirectPromise();
    if(resp && resp.account) syncAccount = resp.account;
  }catch(e){ console.warn('redirect handling error', e); }
  if(!syncAccount){
    const accounts = msalInstance.getAllAccounts();
    if(accounts.length) syncAccount = accounts[0];
  }
  if(syncAccount){
    msalInstance.setActiveAccount(syncAccount);
    setSyncStatus('', 'Connexion…');
    syncNow();
  }else{
    setSyncStatus('', 'Se connecter à OneDrive');
  }
}
async function signIn(){
  if(!msalInstance){ showToast("OneDrive indisponible sur cet appareil."); return; }
  try{
    setSyncStatus('syncing', 'Connexion…');
    let resp = null;
    try{
      resp = await msalInstance.loginPopup({ scopes: SYNC_SCOPES });
    }catch(popupErr){
      console.warn('popup login failed, falling back to redirect', popupErr);
      // Repli : certains navigateurs bloquent les popups → redirection pleine page
      await msalInstance.loginRedirect({ scopes: SYNC_SCOPES });
      return;
    }
    if(resp && resp.account){
      syncAccount = resp.account;
      msalInstance.setActiveAccount(syncAccount);
      showToast('Connecté à OneDrive.');
      syncNow();
    }
  }catch(e){
    console.error(e);
    setSyncStatus('error', 'Échec de connexion');
    showToast('Échec de connexion : ' + (e.errorCode || e.message || 'erreur inconnue'));
  }
}
async function signOut(){
  if(!msalInstance || !syncAccount) return;
  syncAccount = null;
  setSyncStatus('', 'Se connecter à OneDrive');
  showToast('Déconnecté de OneDrive.');
}
async function getGraphToken(){
  if(!msalInstance || !syncAccount) return null;
  try{
    const res = await msalInstance.acquireTokenSilent({ scopes: SYNC_SCOPES, account: syncAccount });
    return res.accessToken;
  }catch(e){
    // Ne PAS enchaîner sur acquireTokenPopup ici : après un premier await (acquireTokenSilent),
    // le geste utilisateur d'origine est déjà "consommé" et les navigateurs (surtout Safari iOS)
    // bloquent silencieusement ce second popup — l'utilisateur cliquait alors sans rien voir se
    // passer. On efface plutôt le compte pour qu'un nouveau clic relance signIn() (loginPopup),
    // qui est lui appelé en tout premier depuis le clic et bénéficie d'un geste utilisateur frais.
    console.warn('silent token failed, reconnexion nécessaire', e);
    syncAccount = null;
    setSyncStatus('error', 'Reconnexion nécessaire');
    showToast('Reconnexion à OneDrive nécessaire — appuie à nouveau sur le bouton.');
    return null;
  }
}

async function downloadRemoteOverlay(token){
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${REMOTE_FILE}:/content`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if(res.status === 404) return null;
  if(!res.ok) throw new Error('download failed: ' + res.status);
  return res.json();
}
async function uploadRemoteOverlay(token, payload){
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${REMOTE_FILE}:/content`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('upload failed: ' + res.status);
}

let syncDebounceTimer = null;
function scheduleSync(){
  if(!syncAccount) return;
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(()=> syncNow(), 1500);
}

async function syncNow(){
  if(!syncAccount || syncInProgress) return;
  if(!navigator.onLine){ setSyncStatus('error', 'Hors ligne — sera synchronisé au retour du réseau'); return; }
  syncInProgress = true;
  setSyncStatus('syncing', 'Synchronisation…');
  try{
    const token = await getGraphToken();
    if(!token){ syncInProgress = false; return; } // redirect in progress
    const remote = await downloadRemoteOverlay(token);
    const localMeta = getOverlayMeta();
    if(remote && remote.updatedAt && remote.updatedAt > localMeta.updatedAt){
      // remote is newer: adopt it locally
      overlay = remote.data || {};
      _saveOverlayOriginal(overlay);
      localStorage.setItem(OV_META_KEY, JSON.stringify({updatedAt: remote.updatedAt}));
      keys.length = 0; keys.push(...allMonthKeys());
      refreshAll();
      showToast('Données synchronisées depuis OneDrive.');
    }else{
      // local is newer or remote absent: push local up
      await uploadRemoteOverlay(token, { updatedAt: localMeta.updatedAt || Date.now(), data: overlay });
    }
    const now = new Date();
    setSyncStatus('ok', 'Synchronisé à ' + now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}));
  }catch(e){
    console.error('sync error', e);
    setSyncStatus('error', 'Erreur de synchronisation');
  }finally{
    syncInProgress = false;
  }
}

document.getElementById('btnSync').addEventListener('click', ()=>{
  if(syncAccount){ syncNow(); } else { signIn(); }
});
window.addEventListener('online', ()=>{ if(syncAccount) syncNow(); });
window.addEventListener('offline', ()=> setSyncStatus('error', 'Hors ligne'));

initMsal();

// ===================== INIT =====================
populateSelects();
refreshAll();
