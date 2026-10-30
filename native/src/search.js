import {toHiragana,toRomaji} from 'wanakana';
export function norm(s){return String(s??'').normalize('NFKC').toLowerCase().replace(/[\s　。、！!？?・\-ー_]/g,'')}
function keys(p){
 const parts=[p.title||'',p.text||'',p.reading||'',p.keywords||'',p.category||''];
 return parts.flatMap(t=>[norm(t),norm(toHiragana(t)),norm(toRomaji(toHiragana(t)))]);
}
const cache=new Map();
export function searchPresets(items,q){
 const s=norm(q||''),hk=norm(toHiragana(q||'')),roma=norm(toRomaji(toHiragana(q||'')));
 if(!s)return items;
 return items.map((p,index)=>{
  const key=[p.id,p.title,p.text,p.reading,p.keywords,p.category].join('|');
  let values=cache.get(key);if(!values){values=keys(p);if(cache.size>1200)cache.clear();cache.set(key,values)}
  const queries=[s,hk,roma].filter(Boolean);
  let rank=-1;
  for(const query of queries){
   for(let i=0;i<values.length;i++){
    const t=values[i];if(!t)continue;
    if(t===query)rank=Math.max(rank,160);
    else if(t.startsWith(query))rank=Math.max(rank,125-i);
    else if(t.includes(query))rank=Math.max(rank,75-i);
   }
  }
  return {p,rank,index};
 }).filter(x=>x.rank>=0).sort((a,b)=>b.rank-a.rank||a.index-b.index).map(x=>x.p);
}
