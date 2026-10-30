import {validSpeaker} from '../lib/voice.js';
const FAIL=(res,code,error,extra={})=>res.status(code).json({error,...extra});
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return FAIL(res,405,'POSTのみ対応');
 const text=String(req.body?.text||'').trim(),speaker=Number(req.body?.speaker);
 if(!validSpeaker(speaker))return FAIL(res,400,'利用できないスタイルです');
 if(!text||text.length>150)return FAIL(res,400,'1回の合成は1〜150文字で指定してください');
 const origin=req.headers.origin;
 const host=req.headers.host;
 // Restrict ordinary cross-origin browser callers; not a substitute for authenticated quota controls.
 if(origin&&host){try{if(new URL(origin).host!==host)return FAIL(res,403,'異なるサイトからは利用できません')}catch{return FAIL(res,403,'不正なOrigin')}}
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  const body=new URLSearchParams({text});
  let response;
  try{
   response=await fetch('https://api.tts.quest/v3/voicevox/synthesis?speaker='+speaker,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body,signal:controller.signal,redirect:'error'
   });
  }finally{clearTimeout(timer)}
  const result=await response.json().catch(()=>({}));
  if(response.status===429||result.retryAfter){
   return FAIL(res,429,'無料音声APIの利用が集中しています。時間をおいて再試行してください',{retryAfter:Math.max(2,Math.min(300,Number(result.retryAfter)||15))});
  }
  if(!response.ok||result.success===false)return FAIL(res,502,'音声APIが合成を受け付けませんでした');
  const status=result.audioStatusUrl,wav=result.wavDownloadUrl;
  const {parseAudioRef}=await import('../lib/voice.js');
  const a=parseAudioRef(status),b=parseAudioRef(wav);
  if(!a||!b||a.host!==b.host||a.id!==b.id)return FAIL(res,502,'音声APIが不正な結果を返しました');
  return res.status(200).json({host:a.host,id:a.id,provider:'tts.quest',speakerName:result.speakerName||'ずんだもん'});
 }catch(e){return FAIL(res,502,'音声サービスへ接続できませんでした')}
}
