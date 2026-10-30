import {PRESETS,CATEGORIES} from './presets.js';
import {searchLibrary} from './search.js';

const $=selector=>document.querySelector(selector);
const MAX_VISIBLE=400;
function transact(db,store,mode,action){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,mode);
  const os=tx.objectStore(store),request=action(os);
  let result;
  if(request){request.onsuccess=()=>{result=request.result};request.onerror=()=>reject(request.error)}
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error||new Error('DB transaction failed'));
  tx.onabort=()=>reject(tx.error||new Error('DB transaction aborted'));
 });
}
function now(){return Date.now()}
function cacheId(preset,mode){return preset.id+':'+preset.styleId+':'+mode}
export function initVoiceLibrary({openDB,primeAudio,playAudio,submitText,toast,cfg,generateBlob}){
 const el={
  search:$('#voiceSearch'),clear:$('#clearSearch'),tabs:$('#libraryTabs'),categories:$('#categories'),
  count:$('#matchCount'),summary:$('#librarySummary'),list:$('#phraseList'),more:$('#morePhrases'),
  editor:$('#favoriteEditor'),form:$('#favoriteForm'),title:$('#favTitle'),reading:$('#favReading'),
  close:$('#dismissFavorite'),remove:$('#removeFavorite')
 };
 const favorites=new Map(),clips=new Map(),pending=new Set();
 const bulk={count:$('#bulkCount'),fill:$('#bulkFill'),button:$('#bulkStart'),hint:$('#bulkHint')};
 let bulkRunning=false,bulkCancel=false;
 function countReady(){return PRESETS.filter(p=>clips.get(cacheId(p,cfg.mode))?.blob?.size>44).length}
 function syncBulk(){const n=countReady();bulk.count.textContent=n+' / '+PRESETS.length+' 件';bulk.fill.style.width=(n/PRESETS.length*100)+'%';bulk.button.textContent=bulkRunning?'生成を中断':n===PRESETS.length?'全件準備完了':n?'未生成分をまとめて生成':'229フレーズを一括生成';bulk.button.disabled=!loaded||(!bulkRunning&&n===PRESETS.length)}
 bulk.button.onclick=async()=>{
  if(bulkRunning){bulkCancel=true;bulk.hint.textContent='現在の1件が完成したら中断するのだ';return}
  if(!navigator.onLine){toast('初回生成にはネット接続が必要なのだ');return}
  bulkRunning=true;bulkCancel=false;syncBulk();let failed=0;
  try{
   for(const p of PRESETS){
    if(bulkCancel)break;
    const id=cacheId(p,cfg.mode);
    if(clips.get(id)?.blob?.size>44)continue;
    bulk.hint.textContent='生成中：'+p.text;
    try{
     const blob=await generateBlob(p.text,p.styleId);
     if(!blob||blob.size<44)throw Error('空のWAV');
     const record={id,blob,time:now(),styleId:p.styleId,mode:cfg.mode};
     if(!await put('clips',record))throw Error('保存失敗');
     clips.set(id,record);syncBulk();
    }catch(e){
     failed++;console.warn('Batch error',p.id,e);
     if(failed>=3){bulk.hint.textContent='合成サービスまたは保存先でエラーが続いたため中断。後から再開できるのだ';break}
    }
    await new Promise(resolve=>setTimeout(resolve,1600));
   }
  }finally{
   bulkRunning=false;syncBulk();render();
   if(countReady()===PRESETS.length)bulk.hint.textContent='全件保存完了！通信なしで再生できるのだ';
   else if(bulkCancel)bulk.hint.textContent='中断済み。未生成分から再開できるのだ';
   else if(!failed)bulk.hint.textContent='保存できた音声は残っているのだ';
  }
 };
 let filter='all',category='すべて',visibleCount=14,editingId=null,loaded=false,playingRow=null;
 const categories=['すべて','マイボイス',...CATEGORIES.slice(1)];
 const items=()=>{
  const base=PRESETS.map(p=>{
   const favorite=favorites.get(p.id);
   return {...p,title:favorite?.title||p.title,reading:favorite?.reading||p.reading,isFavorite:Boolean(favorite)};
  });
  for(const fav of favorites.values())if(!fav.seed)base.unshift({...fav,isFavorite:true,category:'マイボイス'});
  return base.filter(p=>filter==='all'||(filter==='favorite'&&p.isFavorite)||(filter==='preset'&&p.seed));
 };
 async function put(store,item){
  try{const db=await openDB();await transact(db,store,'readwrite',os=>os.put(item));return true}
  catch(e){console.warn('Library storage failed',e);toast('端末への音声保存に失敗しました。空き容量を確認してください',5500);return false}
 }
 async function drop(store,id){
  try{const db=await openDB();await transact(db,store,'readwrite',os=>os.delete(id));return true}
  catch{toast('端末内データの変更に失敗しました');return false}
 }
 function audioFor(p){
  const fav=favorites.get(p.id);
  if(fav?.blob instanceof Blob && fav.blob.size>44)return fav.blob;
  if(p.blob instanceof Blob && p.blob.size>44)return p.blob;
  const clip=clips.get(cacheId(p,cfg.mode));
  return clip?.blob instanceof Blob&&clip.blob.size>44?clip.blob:null;
 }
 function renderCategories(){
  const previousScroll=el.categories.scrollLeft;
  el.categories.replaceChildren();
  for(const label of categories){
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.setAttribute('aria-pressed',String(category===label));
   b.onclick=()=>{category=label;visibleCount=14;render()};
   el.categories.append(b);
  }
  el.categories.hidden=filter==='favorite';
  el.categories.scrollLeft=previousScroll;
 }
 function render(){
  const q=el.search.value;
  el.clear.hidden=!q;
  const selection=items();
  const cat=filter==='favorite'?'すべて':category;
  const result=searchLibrary(selection,q,cat,MAX_VISIBLE);
  const showing=result.slice(0,visibleCount);
  el.summary.textContent=PRESETS.length+'種類＋登録 '+favorites.size+'件';
  el.count.textContent=result.length+(result.length===MAX_VISIBLE?'件以上':'件')+'の候補'+(!loaded?' · 読込中':'');
  el.list.replaceChildren();
  for(const item of showing){
   const row=document.createElement('div');row.className='phrase-row';row.dataset.id=item.id;
   const main=document.createElement('button');main.type='button';main.className='phrase-trigger';
   const playIcon=document.createElement('span');playIcon.className='play-icon';playIcon.textContent='▶';playIcon.setAttribute('aria-hidden','true');
   const labels=document.createElement('span');labels.className='phrase-copy';
   const title=document.createElement('strong');title.textContent=item.title||item.text;
   const hint=document.createElement('small');
   const ready=Boolean(audioFor(item));
   hint.textContent=(pending.has(item.id)?'生成中…':ready?'保存済み · 即再生':'初回は音声生成')+'  ·  '+(item.category||'マイボイス');
   labels.append(title,hint);main.append(playIcon,labels);
   main.disabled=pending.has(item.id);
   main.onclick=()=>tap(item,row);
   const star=document.createElement('button');star.type='button';star.className='phrase-star';
   star.textContent=item.isFavorite?'★':'☆';
   star.title=item.isFavorite?'お気に入り解除':'お気に入りに登録';
   star.setAttribute('aria-pressed',String(item.isFavorite));
   star.setAttribute('aria-label',star.title);
   star.onclick=()=>toggle(item);
   row.append(main,star);
   if(item.isFavorite){
    const edit=document.createElement('button');edit.type='button';edit.className='phrase-edit';
    edit.textContent='✎';edit.title='表示名・読みを編集';edit.setAttribute('aria-label',item.title+'の登録情報を編集');
    edit.onclick=()=>openEditor(item.id);
    row.append(edit);
   }
   el.list.append(row);
  }
  if(!showing.length){
   const empty=document.createElement('div');empty.className='no-results';
   empty.textContent=filter==='favorite'?'お気に入りはまだないのだ。☆で登録できるのだ！':'一致するフレーズが見つからなかったのだ。';
   el.list.append(empty);
  }
  el.more.hidden=result.length<=visibleCount;
  renderCategories();
  [...el.tabs.children].forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
 }
 function favoriteRecord(p){
  return {id:p.id,text:p.text,title:p.title||p.text,reading:p.reading||'',keywords:p.keywords||'',category:p.seed?p.category:'マイボイス',
   styleId:Number(p.styleId)||3,seed:Boolean(p.seed),mode:p.mode||cfg.mode,speed:Number(p.speed)||1,blob:audioFor(p)||null,time:now()};
 }
 async function toggle(p){
  const id=p.id;
  if(favorites.has(id)){
   if(await drop('favorites',id)){favorites.delete(id);render()}
  }else{
   const record=favoriteRecord(p);
   if(await put('favorites',record)){favorites.set(id,record);render();toast('★ お気に入りに登録したのだ！')}
  }
 }
 function tap(p,row){
  primeAudio();
  const blob=audioFor(p);
  if(blob){
   if(playingRow)playingRow.classList.remove('playing');
   playingRow=row;
   playAudio(blob,row,p.speed||cfg.speed).catch(()=>{});
   return;
  }
  if(pending.has(p.id))return;
  if(!navigator.onLine) return toast('初回の音声生成にはネット接続が必要なのだ');
  pending.add(p.id);render();
  const options={styleId:Number(p.styleId)||3,mode:cfg.mode,zunda:false,speed:cfg.speed,presetId:p.seed?p.id:null,
   cacheKey:p.seed?cacheId(p,cfg.mode):null,libraryId:p.id};
  submitText(p.text,false,options);
  toast('初めてのフレーズなので、ずんだもんの声を作っているのだ！',4300);
 }
 async function recordGenerated(item,settings){
  if(item.cacheKey&&item.blob){
   const record={id:item.cacheKey,blob:item.blob,time:now(),styleId:item.styleId,mode:settings.mode};
   if(await put('clips',record))clips.set(item.cacheKey,record);
  }
  const faveId=item.originPresetId||('u-'+item.id);
  if(favorites.has(faveId)){
   const f={...favorites.get(faveId),blob:item.blob,styleId:item.styleId,mode:settings.mode,speed:item.speed,time:now()};
   if(await put('favorites',f))favorites.set(faveId,f);
  }
  pending.delete(item.libraryId||item.originPresetId||'');
  render();syncBulk();
 }
 function recordFailed(item){
  pending.delete(item.libraryId||item.originPresetId||'');
  render();
 }
 function favoriteButton(item){
  const btn=document.createElement('button');btn.type='button';btn.className='fave-btn';
  const id=item.originPresetId||('u-'+item.id);
  const update=()=>{const on=favorites.has(id);btn.textContent=on?'★ 登録済み':'☆ 登録';btn.setAttribute('aria-pressed',String(on));btn.setAttribute('aria-label',on?'登録解除':'ボイスをお気に入りに登録')};
  update();
  btn.onclick=async()=>{
   const p=PRESETS.find(x=>x.id===item.originPresetId);
   await toggle(p||{...item,id,title:item.text,reading:item.reading||'',seed:false,category:'マイボイス'});
   update();
  };
  return btn;
 }
 function openEditor(id){
  const p=favorites.get(id);if(!p)return;
  editingId=id;el.title.value=p.title||p.text;el.reading.value=p.reading||'';
  el.editor.showModal();
 }
 el.form.onsubmit=async e=>{
  e.preventDefault();
  const item=favorites.get(editingId);if(!item)return;
  const title=el.title.value.trim(),reading=el.reading.value.trim();
  if(!title)return toast('表示名を入力してください');
  const updated={...item,title,reading,time:now()};
  if(await put('favorites',updated)){
   favorites.set(editingId,updated);el.editor.close();editingId=null;render();toast('登録ボイスを更新したのだ');
  }
 };
 el.remove.onclick=async()=>{
  if(editingId&&await drop('favorites',editingId)){favorites.delete(editingId);el.editor.close();editingId=null;render()}
 };
 el.close.onclick=()=>el.editor.close();
 el.editor.onclose=()=>{editingId=null};
 el.search.addEventListener('input',()=>{visibleCount=14;render()});
 el.clear.onclick=()=>{el.search.value='';el.search.focus();visibleCount=14;render()};
 el.tabs.onclick=e=>{const btn=e.target.closest('button');if(!btn)return;filter=btn.dataset.filter;category='すべて';visibleCount=14;render()};
 el.more.onclick=()=>{visibleCount=Math.min(MAX_VISIBLE,visibleCount+18);render()};
 async function load(){
  try{
   const db=await openDB();
   const [fav,clip]=await Promise.all([transact(db,'favorites','readonly',os=>os.getAll()),transact(db,'clips','readonly',os=>os.getAll())]);
   for(const f of fav||[])favorites.set(f.id,f);
   for(const c of clip||[])clips.set(c.id,c);
  }catch(e){console.warn(e);toast('端末の保存データを読み込めませんでした')}
  finally{loaded=true;render();syncBulk()}
 }
 render();load();
 return {favoriteButton,recordGenerated,recordFailed,reload:render};
}
