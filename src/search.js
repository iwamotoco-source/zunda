import {toHiragana,toRomaji} from 'wanakana';
export function compact(value){
 return String(value??'').normalize('NFKC').toLowerCase()
  .replace(/[\u3000\s\u200b、。，．・！!？?「」『』（）()〜～…ー\-_\u30fb]/g,'');
}
export function hira(value){return compact(toHiragana(String(value??'')))}
export function romaji(value){return compact(toRomaji(toHiragana(String(value??'')),{upcaseKatakana:false}))}
const INDEX_CACHE=new Map();
function strings(item){
 const key=JSON.stringify([item.id,item.title,item.text,item.reading,item.keywords,item.category]);
 if(INDEX_CACHE.has(key))return INDEX_CACHE.get(key);
 const raw=[item.title||'',item.text||'',item.reading||'',item.keywords||'',item.category||''];
 const normalized={
  texts:raw.map(compact).filter(Boolean),
  readings:raw.map(hira).filter(Boolean),
  romajis:raw.map(romaji).filter(Boolean)
 };
 if(INDEX_CACHE.size>750)INDEX_CACHE.clear();
 INDEX_CACHE.set(key,normalized);
 return normalized;
}
export function scoreItem(item,query){
 const raw=compact(query);if(!raw)return 0;
 const queryHira=hira(query),queryRoma=romaji(query);
 const data=strings(item);
 const variants=[
  [raw,data.texts,120],
  [queryHira,data.readings,110],
  [queryRoma,data.romajis,104]
 ];
 let best=-1;
 for(const [q,values,base] of variants){
  if(!q)continue;
  for(let i=0;i<values.length;i++){
   const s=values[i];if(!s)continue;
   const roleWeight=i===0?8:i===1?6:i===2?5:i===3?0:-4;
   if(s===q)best=Math.max(best,base+24+roleWeight);
   else if(s.startsWith(q))best=Math.max(best,base+12+roleWeight);
   else if(s.includes(q))best=Math.max(best,base-24+roleWeight);
  }
 }
 return best;
}
export function searchLibrary(items,query,category='すべて',limit=400){
 const q=String(query||'').trim();
 return items.filter(x=>category==='すべて'||x.category===category)
  .map((x,i)=>({...x,_rank:q?scoreItem(x,q):0,_order:i}))
  .filter(x=>!q||x._rank>=0)
  .sort((a,b)=>{
   const ra=a._rank+(a.isFavorite?18:0),rb=b._rank+(b.isFavorite?18:0);
   return rb-ra||a._order-b._order;
  })
  .slice(0,limit);
}
