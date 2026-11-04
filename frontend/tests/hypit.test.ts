import {describe,it,expect} from 'vitest';
import {SceneAnchorSchema,PlanSceneSchema} from '../src/contracts/plan';
import {validAnchors} from '../src/remotion/HypitEffects';
import {computeSpeechState} from '../src/remotion/scenes/characters';

describe('word cue integration',()=>{
 it('resolves repeated tokens and safely ignores removed words',()=>{
  const sc=PlanSceneSchema.parse({id:'s1',component:'vrs-title',durationInFrames:60,words:[{id:'a',word:'Lua',start:0,end:300},{id:'b',word:'lua',start:500,end:800}],anchors:[{word:'lua',occurrence:2,effect:'zoom_punch'},{word:'removed'}]});
  expect(validAnchors(sc)).toHaveLength(1);
  expect(SceneAnchorSchema.safeParse({word:'lua',spanWords:0}).success).toBe(false);
 });
 it('uses current word bounds for mouth shape and closes during a pause',()=>{
  const words=[{id:'a',word:'mapa',start:0,end:800},{id:'b',word:'fava',start:1000,end:1800}];
  expect(computeSpeechState(0,30,words,'').viseme).toBe('M');
  expect(computeSpeechState(30,30,words,'').viseme).toBe('F');
  expect(computeSpeechState(27,30,words,'').talking).toBe(false);
 });
});

import {redistributeMix} from '../src/studioMix';
it('keeps percentages nonnegative and exactly 100 at rounding boundaries',()=>{
 for(let value=0;value<=100;value++){
  const mix=redistributeMix({motion_pct:0,cutout_pct:50,gameplay_pct:50,broll_pct:0},'motion_pct',value);
  expect(Object.values(mix).reduce((a,b)=>a+b,0)).toBe(100);
  expect(Math.min(...Object.values(mix))).toBeGreaterThanOrEqual(0);
 }
});
