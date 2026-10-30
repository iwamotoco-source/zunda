export const STYLES=[
{id:3,name:'ノーマル'},{id:1,name:'あまあま'},{id:7,name:'ツンツン'},{id:22,name:'ささやき'},
{id:38,name:'ヒソヒソ'},{id:5,name:'セクシー'},{id:75,name:'ヘロヘロ'},{id:76,name:'なみだめ'}
];
export const STYLE_IDS=new Set(STYLES.map(s=>s.id));
export function validSpeaker(id){return STYLE_IDS.has(Number(id))}
export function splitText(source,limit=105){
 const input=String(source||'').trim();if(!input)return [];
 const fragments=input.match(/[^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+/g)||[input];
 const result=[];let buffer='';
 for(const piece of fragments){
  if((buffer+piece).length>limit&&buffer.trim()){result.push(buffer.trim());buffer=''}
  if(piece.length>limit){
   for(let i=0;i<piece.length;i+=limit){if(buffer.trim()){result.push(buffer.trim());buffer=''}result.push(piece.slice(i,i+limit).trim())}
  }else buffer+=piece;
 }
 if(buffer.trim())result.push(buffer.trim());
 return result.filter(Boolean)
}
export function zundafy(t){
 return String(t||'').replace(/([^。！？!?\n]+)([。！？!?\n]*)/g,(whole,text,punctuation)=>{
  const t=text.trimEnd();if(!t)return whole;
  if(/(なのだ|なのだよ|のだ|だよ|です|ます)$/.test(t))return t+punctuation;
  return t+'なのだ'+punctuation;
 });
}
export function validAudioRef(host,id){
 return /^audio[1-9]\.tts\.quest$/.test(String(host||''))&&/^[0-9a-f]{24,128}$/i.test(String(id||''))
}
export function parseAudioRef(url){
 try{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.port||u.username||u.password)return null;
  const m=u.pathname.match(/^\/v1\/data\/([a-f0-9]{24,128})\/(?:audio\.wav|status\.json)$/i);
  if(!m||!validAudioRef(u.hostname,m[1]))return null;
  return {host:u.hostname,id:m[1]};
 }catch{return null}
}
