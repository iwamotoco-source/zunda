import {validAudioRef} from '../lib/voice.js';
const error=(res,code,message)=>res.status(code).json({error:message});
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return error(res,405,'GETのみ対応');
 const host=String(req.query.host||''),id=String(req.query.id||''),kind=String(req.query.kind||'status');
 if(!validAudioRef(host,id)||!['status','wav'].includes(kind))return error(res,400,'不正な音声参照');
 const path=kind==='status'?'status.json':'audio.wav';
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  let response;
  try{response=await fetch('https://'+host+'/v1/data/'+id+'/'+path,{signal:controller.signal,cache:'no-store',redirect:'error'});}
  finally{clearTimeout(timer)}
  if(!response.ok)return error(res,response.status===404?404:502,'生成待ちまたは配信元エラー');
  if(kind==='status'){
   const data=await response.json();
   return res.status(200).json({ready:Boolean(data.isAudioReady),error:Boolean(data.isAudioError),state:String(data.status||'')});
  }
  const ct=response.headers.get('content-type')||'';
  if(ct&&!(/audio\/|octet-stream/i.test(ct)))return error(res,502,'音声以外の内容が返されました');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<44||bytes.byteLength>12*1048576)return error(res,413,'音声ファイルのサイズが不正です');
  res.setHeader('Content-Type','audio/wav');
  res.setHeader('Content-Length',String(bytes.byteLength));
  res.status(200).send(Buffer.from(bytes));
 }catch{return error(res,502,'音声データを取得できませんでした')}
}
