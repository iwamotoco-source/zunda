import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,FlatList,Keyboard,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import * as Voicevox from '@faiare/expo-voicevox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {File,Directory,Paths} from 'expo-file-system';
import {createAudioPlayer,setAudioModeAsync} from 'expo-audio';
import * as Sharing from 'expo-sharing';
import {PRESETS,CATEGORIES} from './src/presets';
import {searchPresets} from './src/search';

const COLOR={bg:'#080d0b',surface:'#122019',panel:'#15261d',edge:'#254333',green:'#8efbb1',light:'#ecfff3',muted:'#93b7a2',gold:'#ffd788'};
const STYLE_NAME={3:'ノーマル',1:'あまあま',7:'ツンツン',5:'セクシー',22:'ささやき',38:'ヒソヒソ',75:'ヘロヘロ',76:'なみだめ'};
const FAV_KEY='zunda-offline:favorites:v1';
const HISTORY_KEY='zunda-offline:history:v1';
const VOICE_DIRECTORY='zunda-voice-favorites';
const VOICE_ID=(id,style)=>String(id).replace(/[^a-z0-9-]/gi,'_')+'-'+String(style)+'.wav';
const info={styleId:3,speedScale:1,intonationScale:1,pitchScale:0};

const MonoText=({children,style})=><Text style={[styles.label,style]}>{children}</Text>;
const Pill=({selected,children,onPress,disabled})=><Pressable disabled={disabled} onPress={onPress} style={[styles.pill,selected&&styles.pillSelected,disabled&&{opacity:.35}]} accessibilityRole="button" accessibilityState={{selected,disabled}}><Text style={[styles.pillText,selected&&styles.pillTextSelected]}>{children}</Text></Pressable>;
function messageError(error){return String(error?.message||error||'不明なエラー').slice(0,160)}
function fileFor(fav){return new File(Paths.document,VOICE_DIRECTORY,fav.fileName||VOICE_ID(fav.id,fav.styleId))}
function ensureDirectory(){
 const dir=new Directory(Paths.document,VOICE_DIRECTORY);
 if(!dir.exists)dir.create({intermediates:true});
 return dir;
}

export default function App(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('VOICEVOXの音声モデルを初期化中…');
 const [search,setSearch]=useState(''),[category,setCategory]=useState('すべて'),[tab,setTab]=useState('all');
 const [styleId,setStyleId]=useState(3),[available,setAvailable]=useState([3]),[speed,setSpeed]=useState(1);
 const [text,setText]=useState(''),[favs,setFavs]=useState({}),[history,setHistory]=useState([]),[playing,setPlaying]=useState('');
 const playerRef=useRef(null),queueRef=useRef(false),mountedRef=useRef(true);

 useEffect(()=>{
  mountedRef.current=true;
  (async()=>{
   try{
    const [favorites,h]=await Promise.all([AsyncStorage.getItem(FAV_KEY),AsyncStorage.getItem(HISTORY_KEY)]);
    if(favorites)setFavs(JSON.parse(favorites));
    if(h)setHistory(JSON.parse(h));
   }catch(e){console.warn('Local storage',e)}
   try{
    await setAudioModeAsync({playsInSilentMode:true});
    await Voicevox.initialize({synthesisCacheBytes:32*1024*1024});
    const chars=await Voicevox.getCharacters();
    const z=chars.find(c=>String(c.name).includes('ずんだもん'));
    const ids=(z?.styles||[]).map(a=>Number(a.id)).filter(a=>a in STYLE_NAME);
    if(!ids.length)throw new Error('ずんだもんのモデルを読み込めませんでした');
    if(!mountedRef.current)return;
    setAvailable(ids);setStyleId(ids.includes(3)?3:ids[0]);setReady(true);
    setStatus('オフライン生成の準備ができたのだ！');
   }catch(e){setStatus('エンジンの初期化失敗：'+messageError(e))}
  })();
  return ()=>{
   mountedRef.current=false;
   if(playerRef.current){playerRef.current.release();playerRef.current=null}
  };
 },[]);

 const catalogue=useMemo(()=>{
  const arr=PRESETS.map(p=>({...p,favorite:Boolean(favs[p.id]),favoriteTitle:favs[p.id]?.title}));
  const extra=Object.values(favs).filter(f=>f.custom)
   .map(f=>({id:f.id,text:f.text,reading:f.reading||'',keywords:f.keywords||'',title:f.title||f.text,
    styleId:f.styleId,category:'マイボイス',favorite:true,custom:true}));
  return [...extra,...arr].map(x=>({...x,title:x.favoriteTitle||x.title||x.text}));
 },[favs]);
 const categories=useMemo(()=>['すべて','マイボイス',...CATEGORIES.filter(x=>x!=='すべて')],[ ]);
 const results=useMemo(()=>{
  const arr=catalogue.filter(p=>(tab==='all'||(tab==='favorites'&&p.favorite))&&(category==='すべて'||p.category===category));
  const found=searchPresets(arr,search);
  return found.slice(0,100);
 },[catalogue,category,search,tab]);
 const persistFavs=async next=>{setFavs(next);await AsyncStorage.setItem(FAV_KEY,JSON.stringify(next))};
 const recordHistory=async(t,id)=>{
  const item={id:'h-'+Date.now(),text:t,styleId:id,time:Date.now()};
  const next=[item,...history].slice(0,60);
  setHistory(next);
  await AsyncStorage.setItem(HISTORY_KEY,JSON.stringify(next));
 };

 const stopAll=async()=>{
  try{await Voicevox.stopSpeaking()}catch{}
  if(playerRef.current){playerRef.current.release();playerRef.current=null}
 };
 const playbackFile=async fav=>{
  const path=fileFor(fav);
  if(!path.exists)return false;
  await stopAll();
  const player=createAudioPlayer({uri:path.uri});
  playerRef.current=player;
  player.play();
  return true;
 };
 const speak=async phrase=>{
  if(!ready||queueRef.current)return;
  queueRef.current=true;setBusy(true);setPlaying(phrase.id||'free');
  try{
   const fav=favs[phrase.id];
   if(fav?.fileName && await playbackFile(fav)){
    setStatus('登録済みWAVを再生中なのだ');
   }else{
    await stopAll();
    const opts={speedScale:speed,prePhonemeLength:0,audioSession:'exclusive'};
    const {started}=await Voicevox.speak(phrase.text,phrase.styleId||styleId,opts);
    setStatus(started?'iPhone内で音声生成・再生したのだ！':'新しい音声に切り替わったのだ');
   }
  }catch(e){Alert.alert('読み上げに失敗',messageError(e));setStatus('音声生成に失敗したのだ')}
  finally{queueRef.current=false;setBusy(false);setPlaying('')}
 };
 const favorite=async phrase=>{
  if(!ready||queueRef.current)return;
  const id=phrase.id||'u-'+Date.now().toString(36),exists=Boolean(favs[id]);
  if(exists){
   try{
    const old=favs[id],path=fileFor(old);
    if(path.exists)path.delete();
    const next={...favs};delete next[id];await persistFavs(next);setStatus('お気に入りを解除したのだ');
   }catch(e){Alert.alert('保存データの削除に失敗',messageError(e))}
   return;
  }
  queueRef.current=true;setBusy(true);
  try{
   const sp=phrase.styleId||styleId;
   setStatus('お気に入りWAVを端末内で生成中なのだ…');
   const wav=await Voicevox.tts(phrase.text,sp,{directory:'document',speedScale:speed});
   const src=new File(wav);
   const dir=ensureDirectory();
   const fileName=VOICE_ID(id,sp);
   const dest=new File(dir,fileName);
   if(dest.exists)dest.delete();
   await src.copy(dest);
   if(!dest.exists)throw Error('音声ファイルの保存を確認できません');
   const fav={id,text:phrase.text,title:phrase.title||phrase.text,reading:phrase.reading||'',keywords:phrase.keywords||'',styleId:sp,
    speedScale:speed,fileName,custom:!phrase.id,createdAt:Date.now()};
   await persistFavs({...favs,[id]:fav});
   setStatus('★ 音声を保存したのだ！次からワンタップ即再生なのだ');
  }catch(e){Alert.alert('お気に入り保存に失敗',messageError(e))}
  finally{queueRef.current=false;setBusy(false)}
 };
 const saveFavorite=async fav=>{
  try{
   const file=fileFor(fav);
   if(!file.exists)throw Error('登録音声がありません。再登録してください');
   if(!await Sharing.isAvailableAsync())throw Error('共有機能が利用できません');
   await Sharing.shareAsync(file.uri,{dialogTitle:'ずんだもんWAVを保存',mimeType:'audio/wav',UTI:'com.microsoft.waveform-audio'});
  }catch(e){Alert.alert('WAV保存に失敗',messageError(e))}
 };
 const speakCustom=async()=>{
  const t=text.trim();
  if(!t)return;
  Keyboard.dismiss();
  setText('');
  await recordHistory(t,styleId);
  await speak({id:'',text:t,styleId});
 };
 const renderRow=({item})=>{
  const fav=favs[item.id];
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" onPress={()=>speak(item)} disabled={!ready||busy} style={styles.rowPrimary}>
     <View style={styles.playCircle}><Text style={styles.playSymbol}>▶</Text></View>
     <View style={styles.rowCopy}>
      <Text numberOfLines={2} style={styles.rowTitle}>{item.title||item.text}</Text>
      <Text style={styles.rowSub}>{fav?.fileName?'保存済み / 即再生':'端末内で音声生成'} · {item.category}</Text>
     </View>
    </Pressable>
    <Pressable disabled={!ready||busy} onPress={()=>favorite(item)} accessibilityLabel={fav?'お気に入り解除':'お気に入りへ保存'} style={styles.star}>
     <Text style={{color:fav?COLOR.gold:COLOR.muted,fontSize:23}}>{fav?'★':'☆'}</Text>
    </Pressable>
    {fav&&<Pressable onPress={()=>saveFavorite(fav)} accessibilityLabel="WAVを書き出す" style={styles.share}><Text style={{color:COLOR.green,fontSize:16}}>↓</Text></Pressable>}
   </View>;
 };
 return <SafeAreaView style={styles.safe}>
  <StatusBar barStyle="light-content" backgroundColor={COLOR.bg}/>
  <View style={styles.header}>
   <Text style={styles.title}>ずんだ<Text style={{color:COLOR.green}}>スイッチ</Text></Text>
   <Text style={styles.subtitle}>VOICEVOX:ずんだもん · iPhone内で音声生成</Text>
   <Text style={[styles.status,!ready&&{color:COLOR.gold}]}>{ready?'● ': '◌ '}{status}</Text>
  </View>
  <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="検索：ari / ありが / ありがとう" placeholderTextColor="#769985" autoCapitalize="none" autoCorrect={false} returnKeyType="search"/>
  <View style={styles.tabs}>
   <Pill selected={tab==='all'} onPress={()=>setTab('all')}>定型フレーズ</Pill>
   <Pill selected={tab==='favorites'} onPress={()=>{setTab('favorites');setCategory('すべて')}}>★ お気に入り ({Object.keys(favs).length})</Pill>
  </View>
  <View style={{height:44}}>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
    {categories.map(c=><Pill key={c} selected={category===c} onPress={()=>setCategory(c)}>{c}</Pill>)}
   </ScrollView>
  </View>
  <View style={styles.stylesbar}>
   <MonoText>声のスタイル</MonoText>
   <ScrollView horizontal showsHorizontalScrollIndicator={false}>
    {Object.entries(STYLE_NAME).filter(([id])=>available.includes(Number(id))).map(([id,name])=><Pill key={id} selected={Number(id)===styleId} onPress={()=>setStyleId(Number(id))}>{name}</Pill>)}
   </ScrollView>
  </View>
  <View style={styles.speedrow}><MonoText>速度</MonoText>
   {[.8,1,1.2,1.4].map(n=><Pill key={n} selected={speed===n} onPress={()=>setSpeed(n)}>{n.toFixed(1)}×</Pill>)}
  </View>
  <FlatList
   data={results} keyExtractor={item=>item.id} renderItem={renderRow}
   contentContainerStyle={{paddingHorizontal:13,paddingBottom:12,gap:7}}
   keyboardShouldPersistTaps="handled"
   ListEmptyComponent={<View style={styles.empty}><Text style={{color:COLOR.muted}}>一致するボイスがないのだ</Text></View>}
   ListHeaderComponent={<Text style={styles.count}>{results.length}件を表示 · お気に入りはWAVごと保存されるのだ</Text>}
   windowSize={8} initialNumToRender={10}/>
  <View style={styles.compose}>
   <TextInput style={styles.input} value={text} onChangeText={setText} multiline
    placeholder="新しい文章を入力するのだ…" placeholderTextColor="#759b82" maxLength={500}/>
   <Pressable style={[styles.speak,busy&&{opacity:.45}]} disabled={!ready||busy} onPress={speakCustom}>
    <Text style={{color:'#082819',fontWeight:'800'}}>▶ 読む</Text>
   </Pressable>
   <Pressable style={styles.saveManual} disabled={!ready||busy||!text.trim()} onPress={()=>{const value=text.trim();if(value)favorite({text:value,title:value,styleId})}}>
    <Text style={{color:COLOR.gold,fontWeight:'800'}}>☆ 登録</Text>
   </Pressable>
  </View>
  <View style={styles.footer}><Text style={{color:COLOR.muted,fontSize:10}}>保存済みモデルによる完全オフライン合成 · Macやクラウド不要</Text></View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:COLOR.bg},
 header:{paddingHorizontal:18,paddingTop:10,paddingBottom:10},
 title:{fontSize:27,fontWeight:'900',color:COLOR.light,letterSpacing:-.7},
 subtitle:{fontSize:11,color:COLOR.muted,marginTop:2},
 status:{fontSize:11,color:COLOR.green,marginTop:7},
 search:{height:49,marginHorizontal:13,borderWidth:1,borderColor:'#386c4b',backgroundColor:COLOR.surface,borderRadius:16,color:'#fff',fontSize:15,paddingHorizontal:13},
 tabs:{flexDirection:'row',gap:6,padding:11},
 pill:{paddingVertical:8,paddingHorizontal:12,marginRight:6,borderRadius:100,backgroundColor:'#12221a',borderWidth:1,borderColor:'#355443',alignSelf:'center'},
 pillSelected:{backgroundColor:COLOR.green,borderColor:COLOR.green},
 pillText:{color:'#b0d0b9',fontSize:11,fontWeight:'700'},
 pillTextSelected:{color:'#08311b'},
 categories:{paddingHorizontal:12,alignItems:'center'},
 stylesbar:{paddingHorizontal:12,paddingVertical:5,gap:7},
 label:{color:COLOR.muted,fontSize:11,fontWeight:'700'},
 speedrow:{paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6,paddingVertical:6},
 count:{color:COLOR.muted,fontSize:10,paddingBottom:8,paddingTop:7},
 row:{flexDirection:'row',alignItems:'center',backgroundColor:COLOR.surface,borderWidth:1,borderColor:COLOR.edge,borderRadius:14,padding:8,minHeight:58},
 rowPrimary:{flex:1,flexDirection:'row',alignItems:'center',gap:10,minWidth:0},
 playCircle:{width:32,height:32,backgroundColor:COLOR.green,borderRadius:11,justifyContent:'center',alignItems:'center'},
 playSymbol:{fontSize:12,color:'#052e1a'},
 rowCopy:{flex:1},rowTitle:{color:COLOR.light,fontWeight:'700',fontSize:12},rowSub:{fontSize:10,color:COLOR.muted,marginTop:3},
 star:{minWidth:32,alignItems:'center',padding:3},share:{minWidth:28,alignItems:'center',padding:3},
 empty:{padding:24,alignItems:'center'},
 compose:{paddingHorizontal:10,paddingVertical:11,borderTopWidth:1,borderColor:COLOR.edge,backgroundColor:'#0e1a13',flexDirection:'row',gap:7,alignItems:'center'},
 input:{flex:1,backgroundColor:COLOR.surface,borderWidth:1,borderColor:COLOR.edge,borderRadius:12,color:'#fff',fontSize:14,maxHeight:100,paddingHorizontal:9,paddingVertical:8},
 speak:{paddingHorizontal:12,alignSelf:'stretch',justifyContent:'center',borderRadius:12,backgroundColor:COLOR.green},
 saveManual:{paddingHorizontal:9,alignSelf:'stretch',justifyContent:'center',borderRadius:12,backgroundColor:'#352f17'},
 footer:{alignItems:'center',paddingBottom:5}
});
