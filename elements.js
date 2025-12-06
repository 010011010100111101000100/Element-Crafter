// elements.js - deterministic generation of elements & recipes
(function(){
  // deterministic RNG
  function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
  const seed = 424242;
  const rng = mulberry32(seed);
  // name parts
  const PREFIX = ['Aqua','Pyro','Geo','Aero','Luna','Solar','Chron','Cyber','Bio','Electro','Nova','Proto','Meta','Neo','Iron','Crystal','Obsidian','Glass','Shadow','Star'];
  const ROOT = ['Shard','Core','Seed','Flux','Engine','Sprout','Golem','Essence','Vessel','Matrix','Field','Node','Bloom','Cloud','Echo','Forge','Glass','Alloy','Blade','Crown'];
  const SUFFIX = ['Prime','Alpha','MkI','X','Plus','II','III','Lite','9000','V','Omega','Nova','Essence'];

  const EMOJI_POOL = ['🔥','💧','🌍','💨','✨','⚡','🌿','🪨','🌪️','❄️','🌙','☀️','⚛️','🌊','🔮','🧪','🔧','⚙️','💡','📚','🎵','🍞','🍎','🍖','🚀','🏰','🏝️','🏙️','💎','🪐','🤖','👻','🐉','🧬','🪄','🥚'];

  function pick(arr){ return arr[Math.floor(rng()*arr.length)]; }
  function emojiFor(name){ let s=0; for(let i=0;i<name.length;i++) s=(s*31+name.charCodeAt(i))>>>0; return EMOJI_POOL[s%EMOJI_POOL.length]; }
  // base elements
  const BASE = ['Fire','Water','Earth','Air'];
  const elements = {};
  BASE.forEach(b => elements[b] = { name:b, emoji: emojiFor(b), category:'base' });

  // generate ~1200 meaningful elements
  const total = 1200;
  for(let i=0;i<total;i++){
    const name = pick(PREFIX)+pick(ROOT)+'-'+pick(SUFFIX)+'-'+(i+1);
    elements[name] = { name, emoji: emojiFor(name), category: 'generated' };
  }

  // sensible small mapping for base combos
  const HANDLER = {
    'Water+Water':'Pond','Water+Fire':'Steam','Fire+Fire':'Ember','Earth+Water':'Mud','Air+Air':'Breeze','Earth+Earth':'Hill','Air+Water':'Rain','Air+Fire':'Spark','Earth+Fire':'Lava'
  };

  // build pair recipes
  const keys = Object.keys(elements);
  const recipes = {};
  // include HANDLER first
  Object.keys(HANDLER).forEach(k=>{ recipes[k]=HANDLER[k]; if(!elements[HANDLER[k]]) elements[HANDLER[k]]={name:HANDLER[k], emoji: emojiFor(HANDLER[k]), category:'natural'}; });

  // create many recipes by pairing random keys
  let created=0;
  let attempts=0;
  const target = 1400;
  while(created < target && attempts < keys.length*6){
    const a = keys[Math.floor(rng()*keys.length)];
    const b = keys[Math.floor(rng()*keys.length)];
    attempts++;
    if(a===b) continue;
    const pair = [a,b].sort().join('+');
    if(recipes[pair]) continue;
    const res = pick(['Crystal','Nova','Core','Essence','Beacon','Alloy','Matrix','Bloom']) + ' ' + pick(['Gem','Heart','Node','Vessel','Shard','Lens','Field']) + ' ' + (created+1);
    recipes[pair] = res;
    if(!elements[res]) elements[res] = { name: res, emoji: emojiFor(res), category:'product' };
    created++;
  }

  window.ELEMENTS_DB = { seed: seed, elements: elements, recipes: recipes };
})();