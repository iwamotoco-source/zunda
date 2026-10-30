import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRESETS as webPresets} from '../src/presets.js';
import {PRESETS as nativePresets} from '../native/src/presets.js';

test('iPhone offline candidate includes bundled eight Zundamon voice styles',()=>{
 const app=JSON.parse(readFileSync(new URL('../native/app.json',import.meta.url),'utf8')).expo;
 const entry=app.plugins.find(p=>Array.isArray(p)&&p[0]==='@faiare/expo-voicevox');
 assert.ok(entry);
 assert.equal(entry[1].assetSource,'bundle');
 assert.equal(entry[1].voices.length,8);
 assert.ok(entry[1].voices.includes('zundamon/normal'));
 assert.ok(entry[1].voices.includes('zundamon/sasayaki'));
});
test('native app ships the same 229 starter phrases as web app',()=>{
 assert.equal(nativePresets.length,webPresets.length);
 assert.equal(nativePresets.length,229);
 assert.deepEqual(nativePresets.slice(0,4),webPresets.slice(0,4));
});
test('native candidate has no server synthesis endpoint requirement',()=>{
 const src=readFileSync(new URL('../native/App.js',import.meta.url),'utf8');
 assert.match(src,/Voicevox\.initialize\(/);
 assert.match(src,/Voicevox\.speak\(/);
 assert.match(src,/Voicevox\.tts\(/);
 assert.doesNotMatch(src,/api\/speak|tts\.quest/);
});
