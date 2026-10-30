import test from 'node:test';import assert from 'node:assert/strict';
import {compact,scoreItem,searchLibrary} from '../src/search.js';
import {PRESETS,CATEGORIES} from '../src/presets.js';
test('presets include 200+ distinct lines across 10+ categories',()=>{
 assert.ok(PRESETS.length>=200);assert.ok(CATEGORIES.length>=12);
 assert.equal(new Set(PRESETS.map(x=>x.id)).size,PRESETS.length);
});
test('partial romaji matches kana and kanji-reading preset',()=>{
 const p=PRESETS.find(x=>x.text.startsWith('ありがとう'));assert.ok(p);
 assert.ok(scoreItem(p,'ari')>0);
 assert.ok(scoreItem(p,'arigat')>0);
 assert.ok(scoreItem(p,'ありが')>0);
 assert.ok(scoreItem(p,'ありがとう')>0);
 const morning=PRESETS.find(x=>x.text.startsWith('おはよう'));
 assert.ok(scoreItem(morning,'ohay')>0);
});
test('kanji phrase matches phonetic kana even when text does not',()=>{
 const p=PRESETS.find(x=>x.text.startsWith('確認'));
 assert.ok(scoreItem(p,'kaku')>0);assert.ok(scoreItem(p,'かく')>0);
});
test('favourites can use manually specified reading',()=>{
 const f={title:'承認しました',text:'承認しました',reading:'しょうにんしました',category:'お気に入り'};
 assert.ok(scoreItem(f,'shounin')>0);
});
test('search orders prefix before substring and filters categories',()=>{
 const arr=[{id:'1',text:'きょうありがとう',reading:'きょうありがとう',category:'a'},
 {id:'2',text:'ありがとう',reading:'ありがとう',category:'a'},
 {id:'3',text:'ありがとう！',reading:'ありがとう',category:'b'}];
 const found=searchLibrary(arr,'arig','a');
 assert.equal(found[0].id,'2');
 assert.equal(found.length,2);
});
test('NFKC normalizes full-width roman input',()=>{
 assert.equal(compact('ＡＲＩＧＡＴＯＵ'),'arigatou');
});