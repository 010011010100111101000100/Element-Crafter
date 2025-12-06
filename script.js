// script.js - main game logic (drag & drop, craft, shop, gallery, persistence)
(function(){
  // utilities
  function uid(){ return 'u_' + Math.random().toString(36).slice(2,10); }
  function qs(id){ return document.getElementById(id); }
  function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}

  // user isolation: per-browser unique id
  let userId = localStorage.getItem('ec_user_id');
  if(!userId){ userId = 'user_' + Math.random().toString(36).slice(2,9); localStorage.setItem('ec_user_id', userId); }
  const LS_PREFIX = 'ec_' + userId + '_v1_';

  // persistence helpers
  function saveState(s){ try{ localStorage.setItem(LS_PREFIX + 'state', JSON.stringify(s)); }catch(e){} }
  function loadState(){ try{ const raw = localStorage.getItem(LS_PREFIX + 'state'); return raw ? JSON.parse(raw) : null; }catch(e){ return null; } }

  // universe
  const DB = window.ELEMENTS_DB;
  const ELEMENTS = DB.elements;
  const RECIPES = DB.recipes;
  const TOTAL = Object.keys(ELEMENTS).length;

  // initial state
  let saved = loadState();
  if(!saved){
    saved = { discovered: [], inventory: ['Fire','Water','Earth','Air'], coins: 0, seed: DB.seed };
    // ensure base discovered
    ['Fire','Water','Earth','Air'].forEach(b=>{ if(!saved.discovered.includes(b)) saved.discovered.push(b); });
    saveState(saved);
  }
  let discovered = new Set(saved.discovered || []);
  let inventory = (saved.inventory || []).slice();
  let coins = saved.coins || 0;

  // UI refs
  const invGrid = qs('inventoryGrid'), galleryGrid = qs('galleryGrid'), shopGrid = qs('shopGrid');
  const discoveredCount = qs('discoveredCount'), inventoryCount = qs('inventoryCount'), totalElements = qs('totalElements');
  const coinCount = qs('coinCount'), shopCoins = qs('shopCoins'), progressFill = qs('progressFill'), seedDisplay = qs('seedDisplay');

  // selection + drag
  let slotA = null, slotB = null;
  const selected = []; // objects {name,uid}

  // rarity
  function rarityOf(name){
    if(['Fire','Water','Earth','Air'].includes(name)) return { rarity:'Common', weight:1 };
    const len = name.length;
    if(len < 14) return { rarity:'Uncommon', weight:0.6 };
    if(len < 24) return { rarity:'Rare', weight:0.25 };
    return { rarity:'Legendary', weight:0.05 };
  }
  function percentOf(name){
    const totalWeight = Object.keys(ELEMENTS).reduce((acc,n)=>acc + rarityOf(n).weight, 0);
    return ((rarityOf(name).weight / totalWeight) * 100).toFixed(3);
  }

  // render helpers
  function renderInventory(filter=''){
    invGrid.innerHTML = '';
    const list = inventory.filter(n => n.toLowerCase().includes(filter.toLowerCase()));
    list.forEach((name, idx) => {
      const info = ELEMENTS[name] || { name, emoji:'❓' };
      const card = document.createElement('div');
      card.className = 'elem-card';
      card.draggable = true;
      card.innerHTML = `<div class="emoji">${info.emoji}</div><div style="min-width:0"><div class="name">${info.name}</div><div class="sub">${ELEMENTS[name]?.category||''}</div></div>`;
      // click to select (duplicates allowed)
      card.onclick = ()=> {
        selected.push({ name: name, uid: uid() });
        renderSelected();
      };
      // drag handlers
      card.addEventListener('dragstart', (e)=>{
        e.dataTransfer.setData('text/plain', JSON.stringify({ name, idx }));
      });
      invGrid.appendChild(card);
    });
    inventoryCount.textContent = inventory.length;
    updateProgress();
  }

  function renderSelected(){
    const selRow = qs('selectedRow');
    selRow.innerHTML = '';
    selected.forEach(s=>{
      const info = ELEMENTS[s.name] || { name: s.name, emoji:'❓' };
      const card = document.createElement('div');
      card.className = 'selected-card';
      card.innerHTML = `<div class="emoji">${info.emoji}</div><div style="font-weight:800;margin-top:8px">${info.name}</div><div class="sub">uid:${s.uid.slice(0,6)}</div>`;
      selRow.appendChild(card);
    });
  }

  function renderGallery(filter=''){
    galleryGrid.innerHTML = '';
    const keys = Object.keys(ELEMENTS).filter(n => n.toLowerCase().includes(filter.toLowerCase()));
    keys.forEach(name=>{
      const info = ELEMENTS[name];
      const u = discovered.has(name);
      const r = rarityOf(name);
      const card = document.createElement('div');
      card.className = 'gallery-card' + (u ? ' unlocked' : '');
      card.innerHTML = `<div class="emoji">${info.emoji}</div><div style="flex:1"><div style="font-weight:800">${info.name}</div><div class="sub">${r.rarity} · ${info.category||''}</div></div><div style="text-align:right"><div class="percent">${percentOf(name)}%</div><div style="font-size:12px;margin-top:6px">${u?'<span style="color:var(--good);font-weight:800">Unlocked</span>':'<span style="color:var(--muted)">Locked</span>'}</div></div>`;
      galleryGrid.appendChild(card);
    });
  }

  function renderShop(){
    shopGrid.innerHTML = '';
    // show a curated list of locked items for sale (up to 20)
    const candidates = Object.keys(ELEMENTS).filter(n=>!discovered.has(n) && !['Fire','Water','Earth','Air'].includes(n));
    for(let i=0;i<20 && i<candidates.length;i++){
      const name = candidates[i];
      const r = rarityOf(name);
      const price = Math.max(20, Math.round(10 + (1/r.weight)*12 + (name.length%50)));
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.innerHTML = `<div class="emoji">${ELEMENTS[name].emoji}</div><div style="flex:1"><div style="font-weight:800">${ELEMENTS[name].name}</div><div class="sub">${r.rarity}</div></div><div style="text-align:right"><div style="font-weight:900">${price}¢</div><button data-name="${name}" data-price="${price}" ${coins<price?'disabled':''} class="buy-btn">Buy</button></div>`;
      shopGrid.appendChild(card);
    }
    shopGrid.querySelectorAll('.buy-btn').forEach(btn=>{
      btn.onclick = (e)=>{
        const name = e.currentTarget.getAttribute('data-name');
        const price = Number(e.currentTarget.getAttribute('data-price'));
        if(coins < price) { showToast('Insufficient coins','❌'); return; }
        coins -= price;
        if(!inventory.includes(name)) inventory.push(name);
        if(!discovered.has(name)){ discovered.add(name); coins += 10; showToast('Bought & discovered '+name,'🛒'); playBeep(); }
        saveAndRender();
      };
    });
  }

  function updateProgress(){
    discoveredCount.textContent = discovered.size;
    totalElements.textContent = TOTAL;
    const pct = Math.round((discovered.size / TOTAL) * 100);
    progressFill.style.width = pct + '%';
    inventoryCount.textContent = inventory.length;
  }

  function showResult(name, wasNew){
    const panel = qs('resultPanel');
    panel.style.display = 'block';
    const info = ELEMENTS[name] || { emoji:'❓', name };
    panel.innerHTML = `<div style="display:flex;align-items:center;gap:12px"><div style="font-size:28px">${info.emoji}</div><div><div style="font-weight:900">${info.name}</div><div class="sub">${rarityOf(info.name).rarity}</div></div></div><div style="margin-top:8px">${wasNew?'<strong style="color:var(--good)">New discovery! +10 coins</strong>':'Crafted (already discovered)'}</div>`;
  }

  function craftSelected(){
    if(selected.length < 2){ showToast('Select two items','⚠️'); return; }
    const a = selected[0].name, b = selected[1].name;
    const pair = [a,b].sort().join('+');
    let result = RECIPES[pair];
    if(!result){
      // fallback mapping for identical base combos
      if(a===b && a==='Water') result='Pond';
      else if(a===b && a==='Fire') result='Ember';
      else if(a===b && a==='Earth') result='Hill';
      else if(a===b && a==='Air') result='Breeze';
    }
    if(!result){ showToast('Nothing happened','❌'); selected.length=0; renderSelected(); return; }
    const wasNew = !discovered.has(result);
    inventory.push(result);
    if(wasNew){ discovered.add(result); coins += 10; playBeep(); showToast('Discovered '+result,'✨'); }
    saveAndRender();
    showResult(result, wasNew);
    selected.length = 0; renderSelected();
  }

  function clearSelection(){ selected.length = 0; renderSelected(); qs('resultPanel').style.display='none'; }

  function showToast(msg, emoji='✨'){
    const t = qs('toast');
    t.style.display='flex';
    t.querySelector('.t-emoji').textContent = emoji;
    t.querySelector('#toastText').textContent = msg;
    clearTimeout(t._timer);
    t._timer = setTimeout(()=> t.style.display='none', 2600);
  }

  function playBeep(){
    try{
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type='sine'; o.frequency.value = 880; g.gain.value = 0.03;
      o.connect(g); g.connect(ctx.destination); o.start(); setTimeout(()=>{ o.stop(); ctx.close(); }, 160);
    }catch(e){}
  }

  function saveAndRender(){
    saveState();
    renderInventory(qs('invFilter').value||qs('globalSearch').value);
    renderGallery(qs('globalSearch').value);
    renderShop();
    updateProgress();
    updateUI();
  }

  function saveState(){
    const s = { discovered: Array.from(discovered), inventory: inventory, coins: coins, seed: DB.seed };
    saveStateToLS(s);
  }
  function saveStateToLS(obj){ saveStateToGlobal(obj); }
  function saveStateToGlobal(obj){ try{ localStorage.setItem(LS_PREFIX + 'state', JSON.stringify(obj)); }catch(e){} }

  function updateUI(){
    qs('coinCount').textContent = coins;
    qs('shopCoins').textContent = coins;
  }

  // slot drag/drop
  function wireSlots(){
    const slotAEl = qs('slotA'), slotBEl = qs('slotB');
    [slotAEl, slotBEl].forEach(el=>{
      el.addEventListener('dragover', e=> e.preventDefault());
      el.addEventListener('drop', e=>{
        e.preventDefault();
        try{
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          const name = data.name;
          if(el.id==='slotA'){ slotA = name; el.textContent = name; }
          else { slotB = name; el.textContent = name; }
        }catch(e){}
      });
      el.addEventListener('click', ()=>{
        // support click: take first selected if present
        if(selected.length>0){
          const top = selected.shift();
          if(el.id==='slotA'){ slotA = top.name; el.textContent = top.name; }
          else { slotB = top.name; el.textContent = top.name; }
          renderSelected();
        }
      });
    });
  }

  // render loop
  function renderInventory(filter=''){
    renderInventoryUI(filter);
  }
  function renderInventoryUI(filter=''){
    invGrid.innerHTML='';
    const list = inventory.filter(n => n.toLowerCase().includes(filter.toLowerCase()));
    list.forEach(name=>{
      const info = ELEMENTS[name] || { name, emoji:'❓' };
      const card = document.createElement('div');
      card.className='elem-card';
      card.draggable=true;
      card.innerHTML = `<div class="emoji">${info.emoji}</div><div style="min-width:0"><div class="name">${info.name}</div><div class="sub">${ELEMENTS[name]?.category||''}</div></div>`;
      card.onclick = ()=>{ selected.push({ name: name, uid: uid() }); renderSelected(); };
      card.addEventListener('dragstart', e=> e.dataTransfer.setData('text/plain', JSON.stringify({ name })));
      invGrid.appendChild(card);
    });
    inventoryCount.textContent = inventory.length;
  }

  function renderGallery(filter=''){ renderGalleryUI(filter); }
  function renderGalleryUI(filter=''){
    galleryGrid.innerHTML='';
    const keys = Object.keys(ELEMENTS).filter(n=> n.toLowerCase().includes(filter.toLowerCase()));
    keys.forEach(name=>{
      const info = ELEMENTS[name];
      const u = discovered.has(name);
      const r = rarityOf(name);
      const card = document.createElement('div');
      card.className = 'gallery-card' + (u? ' unlocked':'');
      card.innerHTML = `<div class="emoji">${info.emoji}</div><div style="flex:1"><div style="font-weight:800">${info.name}</div><div class="sub">${r.rarity} · ${info.category||''}</div></div><div style="text-align:right"><div class="percent">${percentOf(name)}%</div><div style="font-size:12px;margin-top:6px">${u?'<span style="color:var(--good);font-weight:800">Unlocked</span>':'<span style="color:var(--muted)">Locked</span>'}</div></div>`;
      galleryGrid.appendChild(card);
    });
  }

  function renderShop(){ renderShopUI(); }
  function renderShopUI(){
    shopGrid.innerHTML='';
    const candidates = Object.keys(ELEMENTS).filter(n=> !discovered.has(n) && !['Fire','Water','Earth','Air'].includes(n));
    for(let i=0;i<20 && i<candidates.length;i++){
      const name = candidates[i];
      const r = rarityOf(name);
      const price = Math.max(30, Math.round(10 + (1/r.weight)*14 + (name.length%60)));
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.innerHTML = `<div class="emoji">${ELEMENTS[name].emoji}</div><div style="flex:1"><div style="font-weight:800">${ELEMENTS[name].name}</div><div class="sub">${r.rarity}</div></div><div style="text-align:right"><div style="font-weight:900">${price}¢</div><button data-name="${name}" data-price="${price}" ${coins<price?'disabled':''} class="buy-btn">Buy</button></div>`;
      shopGrid.appendChild(card);
    }
    shopGrid.querySelectorAll('.buy-btn').forEach(btn=>{
      btn.onclick = (e)=>{
        const name = e.currentTarget.getAttribute('data-name');
        const price = Number(e.currentTarget.getAttribute('data-price'));
        if(coins < price){ showToast('Not enough coins','❌'); return; }
        coins -= price;
        if(!inventory.includes(name)) inventory.push(name);
        if(!discovered.has(name)){ discovered.add(name); coins += 10; showToast('Bought & discovered '+name,'🛒'); playBeep(); }
        saveAndRender();
      };
    });
  }

  // wire events
  qs('combineBtn').onclick = craftSelected;
  qs('clearSelected').onclick = clearSelection;
  qs('resetBtn').onclick = ()=>{
    if(!confirm('Reset progress?')) return;
    discovered = new Set(['Fire','Water','Earth','Air']);
    inventory = ['Fire','Water','Earth','Air'];
    coins = 0;
    saveAndRender();
    showToast('Reset done','⚠️');
  };
  qs('openGalleryBtn').onclick = ()=> qs('galleryGrid').scrollIntoView({behavior:'smooth'});
  qs('invFilter').oninput = ()=> renderInventory(qs('invFilter').value);
  qs('globalSearch').oninput = ()=> { renderInventory(qs('globalSearch').value); renderGallery(qs('globalSearch').value); };

  // initial render
  function init(){
    renderInventory();
    renderGallery();
    renderShop();
    updateProgress();
    updateUI();
    seedDisplay.textContent = DB.seed;
  }
  init();

  // animated background
  (function animateBg(){
    const c = qs('bgCanvas'), ctx = c.getContext('2d');
    function resize(){ c.width = innerWidth; c.height = innerHeight; }
    addEventListener('resize', resize); resize();
    const rng = mulberry32(DB.seed);
    const circles = [];
    const count = Math.max(12, Math.floor(innerWidth/120));
    for(let i=0;i<count;i++) circles.push({ x: rng()*c.width, y: rng()*c.height, r: 30 + rng()*140, vx:(rng()-0.5)*0.6, vy:(rng()-0.5)*0.6, hue: Math.floor(180 + rng()*160), alpha: 0.03 + rng()*0.08 });
    function draw(){
      ctx.clearRect(0,0,c.width,c.height);
      for(const s of circles){
        s.x += s.vx; s.y += s.vy;
        if(s.x - s.r > c.width) s.x = -s.r;
        if(s.x + s.r < 0) s.x = c.width + s.r;
        if(s.y - s.r > c.height) s.y = -s.r;
        if(s.y + s.r < 0) s.y = c.height + s.r;
        const g = ctx.createRadialGradient(s.x,s.y,10,s.x,s.y,s.r);
        g.addColorStop(0, `hsla(${s.hue},90%,70%,${s.alpha*1.2})`);
        g.addColorStop(0.4, `hsla(${(s.hue+40)%360},80%,55%,${s.alpha})`);
        g.addColorStop(1, `hsla(${(s.hue+80)%360},80%,40%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  // expose for debug
  window.NF_DEBUG = { ELEMENTS, RECIPES, discovered, inventory };

})();