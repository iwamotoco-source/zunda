import test from 'node:test';import assert from 'node:assert/strict';
import {STYLES,validSpeaker,splitText,zundafy,parseAudioRef,validAudioRef} from '../lib/voice.js';
test('zundamon style IDs include whisper and sweet',()=>{assert.equal(validSpeaker(3),true);assert.equal(validSpeaker(22),true);assert.equal(validSpeaker(1),true);assert.equal(validSpeaker(9999),false)});
test('chunks preserve text without overflow',()=>{const s='あ'.repeat(250);const c=splitText(s,105);assert.ok(c.every(p=>p.length<=105));assert.equal(c.join(''),s)});
test('zunda punctuation converts once',()=>{assert.equal(zundafy('こんにちは。'),'こんにちはなのだ。');assert.equal(zundafy('そうなのだ。'),'そうなのだ。')});
test('external refs are only tts.quest audio hosts',()=>{assert.ok(parseAudioRef('https://audio1.tts.quest/v1/data/'+'a'.repeat(64)+'/audio.wav'));assert.equal(parseAudioRef('https://evil.com/v1/data/'+'a'.repeat(64)+'/audio.wav'),null);assert.equal(validAudioRef('audio1.tts.quest.evil.com','a'.repeat(64)),false)});
