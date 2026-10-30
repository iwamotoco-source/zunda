import './style.css';
import {initVoiceLibrary} from './library.js';
import {STYLES,splitText,zundafy} from '../lib/voice.js';
const $=s=>document.querySelector(s);
const el={
 led:$('#led'),connection:$('#connection'),modeName:$('#modeName'),
 log:$('#log'),empty:$('#empty'),text:$('#text'),count:$('#count'),send:$('#send'),
 settings:$('#settings'),history:$('#history'),settingsBtn:$('#settingsBtn'),historyBtn:$('#historyBtn'),
 closeSettings:$('#closeSettings'),closeHistory:$('#closeHistory'),engineMode:$('#engineMode'),
 customBlock:$('#customBlock'),engine:$('#engine'),engineNote:$('#engineNote'),testBtn:$('#testBtn'),
 styles:$('#styles'),speed:$('#speed'),speedVal:$('#speedVal'),speedHint:$('#speedHint'),
 inton:$('#inton'),intonVal:$('#intonVal'),pitch:$('#pitch'),pitchVal:$('#pitchVal'),advanced:$('#advanced'),
 zunda:$('#zunda'),sampleBtn:$('#sampleBtn'),clearHistory:$('#clearHistory'),toast:$('#toast')
};
const KEY='zunda-switch-settings-v3';
const def={mode:'cloud',engine:'',styleId:3,speed:1,inton:1,pitch:0,zunda:false};
let stored={};
try{stored=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{}
const cfg={...def,...stored};
const validStyles=new Set(STYLES.map(s=>s.id));
if(!validStyles.has(Number(cfg.styleId)))cfg.styleId=3;
if(!['cloud','custom'].includes(cfg.mode))cfg.mode='cloud';
let running=false,queue=Promise.resolve(),toastTimer=null,dbPromise=null,activeUrl=null,player=new Audio(),audioContext=null;
let voiceLibrary=null;
player.preload='auto';
const toast=(str,ms=4200)=>{
 el.toast.textContent=str;el.toast.classList.add('on');clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>el.toast.classList.remove('on'),ms);
};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(cfg))}catch{}}
function setStatus(type,label){el.led.className='led '+type;el.connection.textContent=label}
function closePanels(){el.settings.hidden=true;el.history.hidden=true;el.settingsBtn.setAttribute('aria-pressed','false');el.historyBtn.setAttribute('aria-pressed','false')}
function togglePanel(panel,button){
 const closed=panel.hidden;closePanels();
 if(closed){panel.hidden=false;button.setAttribute('aria-pressed','true')}
}
function displayMode(){
 const cloud=cfg.mode==='cloud';
 el.modeName.textContent=cloud?'VOICEVOX クラウド':'自前のVOICEVOX';
 el.customBlock.hidden=cloud;el.advanced.hidden=cloud;
 el.engineNote.textContent=cloud?'TTS Quest の無料APIに文章を送信します。APIの混雑で待ち時間や利用制限が生じます。保存したWAVは端末内で保持します。':'HTTPSで公開した、自分が管理するVOICEVOX Engineを利用。エンジン側のCORS許可が必要です。';
 el.speedHint.textContent=cloud?'クラウド利用時は再生速度のみ変更します。音程・抑揚の変更は自前エンジンで利用できます。':'エンジン側で話す速さを変更して合成します。';
 [...el.engineMode.children].forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===cfg.mode)));
 setStatus('',cloud?'クラウドモード · 音声生成時に接続':'自前エンジン · 接続を確認');
}
function renderStyles(){
 el.styles.replaceChildren();
 for(const style of STYLES){
  const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=style.name;
  b.setAttribute('aria-pressed',String(style.id===Number(cfg.styleId)));
  b.onclick=()=>{cfg.styleId=style.id;persist();renderStyles()};
  el.styles.append(b);
 }
}
function initControls(){
 el.engine.value=cfg.engine;el.speed.value=cfg.speed;el.inton.value=cfg.inton;el.pitch.value=cfg.pitch;el.zunda.checked=cfg.zunda;
 el.speedVal.textContent=Number(cfg.speed).toFixed(2)+'×';el.intonVal.textContent=Number(cfg.inton).toFixed(2);
 el.pitchVal.textContent=Number(cfg.pitch).toFixed(2);
 renderStyles();displayMode();
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function requestJSON(url,options={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
 try{
  const r=await fetch(url,{...options,signal:ctl.signal,cache:'no-store'});
  const result=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(result.error||'HTTP '+r.status);e.code=r.status;e.retryAfter=result.retryAfter;throw e}
  return result;
 }catch(e){
  if(e.name==='AbortError')throw Error('通信がタイムアウトしました');
  throw e;
 }finally{clearTimeout(timer)}
}
function remoteUrl(path){
 const str=String(cfg.engine||'').trim().replace(/\/+$/,'');
 let u;try{u=new URL(str)}catch{throw Error('HTTPSのVOICEVOX Engine URLを設定してください')}
 if(u.protocol!=='https:'||u.username||u.password)throw Error('自前エンジンはHTTPS URLを指定してください');
 return u.origin+u.pathname.replace(/\/+$/,'')+path;
}
async function testEngine(){
 try{
  const version=await requestJSON(remoteUrl('/speakers'));
  if(!Array.isArray(version)||!version.some(v=>String(v.name||'').includes('ずんだもん')))throw Error('ずんだもんの音声モデルが見つかりません');
  setStatus('on','VOICEVOX Engine 接続中');toast('ずんだもんの音声モデルを確認しました');
 }catch(e){setStatus('off','エンジン未接続');toast('接続できません: '+e.message,6000)}
}
async function customSynthesize(part,settings){
 const engine=String(settings.engine||'').replace(/\/+$/,'');
 const u=new URL(engine);if(u.protocol!=='https:')throw Error('HTTPSのエンジンURLのみ対応しています');
 const base=u.origin+u.pathname.replace(/\/+$/,'');
 const speaker=Number(settings.styleId);
 const query=await requestJSON(base+'/audio_query?text='+encodeURIComponent(part)+'&speaker='+speaker,{method:'POST'});
 query.speedScale=Number(settings.speed);query.intonationScale=Number(settings.inton);query.pitchScale=Number(settings.pitch);
 query.outputSamplingRate=24000;
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),35000);
 try{
  const r=await fetch(base+'/synthesis?speaker='+speaker,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal:ctl.signal});
  if(!r.ok)throw Error('音声合成に失敗: HTTP '+r.status);
  const blob=await r.blob();
  if(blob.size<44||blob.size>12*1048576)throw Error('音声ファイルサイズが不正です');
  return blob;
 }finally{clearTimeout(timer)}
}
async function cloudSynthesize(part,style){
 let result;
 for(let attempt=0;attempt<2;attempt++){
  try{
   result=await requestJSON('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:part,speaker:style})});
   break;
  }catch(e){
   if(e.code!==429||attempt===1)throw e;
   setStatus('',Math.min(Number(e.retryAfter)||15,50)+'秒後に再試行');
   await wait(Math.min(Number(e.retryAfter)||15,50)*1000);
  }
 }
 const ref='host='+encodeURIComponent(result.host)+'&id='+encodeURIComponent(result.id);
 let ready=false;
 for(let n=0;n<40;n++){
  const status=await requestJSON('/api/audio?kind=status&'+ref);
  if(status.error)throw Error('クラウドでの音声生成に失敗しました');
  if(status.ready){ready=true;break}
  await wait(1600);
 }
 if(!ready)throw Error('音声生成がタイムアウトしました。しばらくしてからお試しください');
 const r=await fetch('/api/audio?kind=wav&'+ref,{cache:'no-store'});
 if(!r.ok)throw Error('WAV音声を受信できませんでした');
 const blob=await r.blob();
 if(blob.size<44)throw Error('音声データが不正です');
 return blob;
}
async function mergeWavs(blobs){
 if(blobs.length===1)return blobs[0];
 const context=new (window.AudioContext||window.webkitAudioContext)();
 try{
  const decoded=await Promise.all(blobs.map(async b=>context.decodeAudioData(await b.arrayBuffer())));
  const rate=context.sampleRate;
  let totalFrames=0;for(const b of decoded)totalFrames+=b.length;
  if(totalFrames>rate*300)throw Error('合成音声が長すぎます');
  const raw=new ArrayBuffer(44+totalFrames*2),view=new DataView(raw);
  const put=(offset,str)=>{for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i))};
  put(0,'RIFF');view.setUint32(4,36+totalFrames*2,true);put(8,'WAVE');put(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  put(36,'data');view.setUint32(40,totalFrames*2,true);
  let cursor=44;
  for(const buf of decoded){
   const ch=buf.numberOfChannels;const channels=Array.from({length:ch},(_,i)=>buf.getChannelData(i));
   for(let i=0;i<buf.length;i++){
    let sample=0;for(const c of channels)sample+=c[i]/ch;
    sample=Math.max(-1,Math.min(1,sample));
    view.setInt16(cursor,sample<0?sample*32768:sample*32767,true);cursor+=2;
   }
  }
  return new Blob([raw],{type:'audio/wav'});
 }finally{await context.close().catch(()=>{})}
}
function releaseAudio(){
 try{player.pause()}catch{}
 if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl=null}
}
function primeAudio(){
 try{
  if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  const source=audioContext.createBufferSource();
  source.buffer=audioContext.createBuffer(1,1,22050);
  source.connect(audioContext.destination);source.start(0);
 }catch{}
}
async function playAudio(blob,card,speed){
 if(!blob)return;
 releaseAudio();
 const url=URL.createObjectURL(blob);activeUrl=url;
 player.src=url;player.playbackRate=Number(speed)||1;
 const wave=card.querySelector('.waves');
 player.onended=()=>{card.classList.remove('playing');if(activeUrl===url){URL.revokeObjectURL(url);activeUrl=null}};
 player.onerror=()=>{card.classList.remove('playing');toast('音声を再生できませんでした')};
 try{
  await player.play();card.classList.add('playing');
 }catch{card.classList.remove('playing');toast('音声を作成しました。「▶ 再生」をタップしてください',5500)}
}
async function saveWav(blob,name){
 const file=new File([blob],name,{type:'audio/wav'});
 if(navigator.canShare?.({files:[file]})){
  try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==='AbortError')return}
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),90000);
}
function cardFor(item){
 el.empty.hidden=true;
 const msg=document.createElement('div');msg.className='msg';msg.dataset.id=item.id;
 const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=item.text;
 const card=document.createElement('div');card.className='voicecard';
 const line=document.createElement('div');line.className='voicetop';
 const who=document.createElement('span');who.className='voicetag';who.textContent='ずんだもん · '+(STYLES.find(x=>x.id===item.styleId)?.name||'ノーマル');
 const status=document.createElement('span');status.className='voicestatus';status.textContent=item.state||'合成中…';
 const waves=document.createElement('div');waves.className='waves';
 for(let i=0;i<12;i++)waves.append(document.createElement('i'));
 line.append(who,waves);
 const actions=document.createElement('div');actions.className='voice-actions';
 const play=document.createElement('button');play.type='button';play.textContent='▶ 再生';play.disabled=!item.blob;
 const save=document.createElement('button');save.type='button';save.textContent='↓ WAV保存';save.disabled=!item.blob;
 const retry=document.createElement('button');retry.type='button';retry.textContent='↻ やり直す';retry.hidden=item.state!=='エラー';
 actions.append(play,save,retry);if(voiceLibrary)actions.append(voiceLibrary.favoriteButton(item));card.append(line,status,actions);msg.append(bubble,card);el.log.append(msg);
 if(item.state==='エラー')card.classList.add('error');
 play.onclick=()=>{primeAudio();playAudio(item.blob,card,item.speed||1)};
 save.onclick=()=>saveWav(item.blob,'zundamon-'+item.id+'.wav');
 retry.onclick=()=>{primeAudio();submitText(item.text,true)};
 el.log.scrollTop=el.log.scrollHeight;
 return {
  success(blob){item.blob=blob;play.disabled=false;save.disabled=false;retry.hidden=true;status.textContent='音声の準備ができました';card.classList.remove('error')},
  state(t){status.textContent=t},
  fail(t){status.textContent=t;retry.hidden=false;card.classList.add('error')},
  audio(){return card}
 };
}
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open('zunda-switch-history',2);
  req.onupgradeneeded=()=>{for(const name of ['records','favorites','clips'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'})};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
 return dbPromise;
}
async function storeRecord(item){
 try{
  const db=await openDB();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('records','readwrite');
   tx.objectStore('records').put({id:item.id,text:item.text,styleId:item.styleId,speed:item.speed,state:item.state,blob:item.blob||null,time:item.time,originPresetId:item.originPresetId||null,cacheKey:item.cacheKey||null});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  const history=await readRecords();
  for(const old of history.slice(40))await deleteRecord(old.id);
 }catch(e){console.warn('History unavailable',e)}
}
async function readRecords(){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('records','readonly'),req=tx.objectStore('records').getAll();
  req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.time-a.time));
  req.onerror=()=>reject(req.error);
 });
}
async function deleteRecord(id){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('records','readwrite');
  tx.objectStore('records').delete(id);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
async function loadHistory(){
 try{
  const records=await readRecords();
  for(const item of records.slice(0,40).reverse())cardFor(item);
 }catch(e){toast('履歴ストレージにアクセスできません')}
}
async function process(item,card,settings){
 setStatus('',settings.mode==='cloud'?'クラウドで音声合成中…':'音声合成中…');
 const chunks=splitText(settings.zunda?zundafy(item.text):item.text,105);
 const blobs=[];
 try{
  for(let i=0;i<chunks.length;i++){
   card.state('音声を生成中 '+(i+1)+' / '+chunks.length);
   const blob=settings.mode==='cloud'
     ?await cloudSynthesize(chunks[i],settings.styleId)
     :await customSynthesize(chunks[i],settings);
   blobs.push(blob);
  }
  card.state('WAVをまとめています…');
  const merged=await mergeWavs(blobs);
  item.blob=merged;item.state='完了';card.success(merged);
  await storeRecord(item);
  await voiceLibrary?.recordGenerated(item,settings);
  setStatus('on','音声の準備ができました');
  // Try automatic play; manual control is always available for iOS autoplay restrictions.
  await playAudio(merged,card.audio(),settings.mode==='cloud'?settings.speed:1);
 }catch(e){
  item.state='エラー';card.fail(e.message||'合成に失敗しました');
  await storeRecord(item);voiceLibrary?.recordFailed(item);setStatus('off','接続・合成エラー');
  toast(e.message||'音声を生成できませんでした',6500);
 }
}
function submitText(value,retry=false,extras={}){
 const text=String(value||'').trim();if(!text)return;
 if(text.length>700)return toast('700文字以内にしてください');
 primeAudio();
 const settings={...cfg,...extras};
 const item={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),text,styleId:Number(settings.styleId),speed:Number(settings.speed),originPresetId:extras.presetId||null,cacheKey:extras.cacheKey||null,libraryId:extras.libraryId||null,time:Date.now(),state:'合成中…',blob:null};
 const card=cardFor(item);
 if(!retry){el.text.value='';el.count.textContent='0 / 700'}
 queue=queue.then(()=>process(item,card,settings)).catch(e=>{console.error(e);voiceLibrary?.recordFailed(item)});
 return item;
}
el.send.onclick=()=>submitText(el.text.value);
el.text.oninput=()=>{el.count.textContent=el.text.value.length+' / 700'};
el.text.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!(e.ctrlKey||e.metaKey)){
  e.preventDefault();submitText(el.text.value);
 }
});
el.settingsBtn.onclick=()=>togglePanel(el.settings,el.settingsBtn);
el.historyBtn.onclick=()=>togglePanel(el.history,el.historyBtn);
el.closeSettings.onclick=closePanels;el.closeHistory.onclick=closePanels;
el.engineMode.onclick=e=>{
 const b=e.target.closest('button');if(!b)return;
 cfg.mode=b.dataset.mode;persist();displayMode();
};
el.engine.onchange=()=>{cfg.engine=el.engine.value.trim().replace(/\/+$/,'');persist();displayMode()};
el.testBtn.onclick=testEngine;
for(const [input,key,label] of [[el.speed,'speed',el.speedVal],[el.inton,'inton',el.intonVal],[el.pitch,'pitch',el.pitchVal]]){
 input.oninput=()=>{cfg[key]=Number(input.value);label.textContent=cfg[key].toFixed(2)+(key==='speed'?'×':'');persist()};
}
el.zunda.onchange=()=>{cfg.zunda=el.zunda.checked;persist()};
el.sampleBtn.onclick=()=>{closePanels();submitText('こんにちはなのだ。今日もよろしくなのだ。')};
el.clearHistory.onclick=async()=>{
 if(!window.confirm('端末に保存した生成履歴とWAVをすべて削除しますか？'))return;
 try{
  const records=await readRecords();
  for(const item of records)await deleteRecord(item.id);
  releaseAudio();el.log.replaceChildren();el.log.append(el.empty);el.empty.hidden=false;toast('履歴を削除しました');
 }catch{toast('履歴の削除に失敗しました')}
};
initControls();
voiceLibrary=initVoiceLibrary({openDB,primeAudio,playAudio,submitText,toast,cfg,generateBlob:async(text,styleId)=>{const blobs=[];for(const part of splitText(text,105))blobs.push(cfg.mode==='cloud'?await cloudSynthesize(part,styleId):await customSynthesize(part,{...cfg,styleId}));return mergeWavs(blobs);}});
loadHistory();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
