import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {PlanScene, SceneAnchor, FilmPlan} from '../contracts/plan';
import {fontStack} from './core/theme';
import {WordAnchor} from './WordAnchor';
import {resolveAnchor} from './core/words';

export function validAnchors(scene: PlanScene): SceneAnchor[] {
  return (scene.anchors || []).filter(a => {
    try { resolveAnchor(scene.words, {triggerWord: a.word, occurrence: a.occurrence, spanWords: a.spanWords, wordId: a.wordId}); return true; }
    catch { return false; }
  });
}
const Visual: React.FC<{anchor: SceneAnchor; plan: FilmPlan; assetUrls: Record<string,string>}> = ({anchor:a,plan,assetUrls}) => {
  const f=useCurrentFrame(); const {fps,width,height}=useVideoConfig();
  const q=spring({frame:f,fps,config:{damping:14,stiffness:180}}); const u=Math.min(width,height)/1080;
  const src=a.asset ? assetUrls[a.asset] : '';
  if(a.effect==='zoom_punch' || a.effect==='camera_shake') return null;
  const full=a.effect==='broll_overlay';
  const media=src ? (/\.(mp4|webm|mov)$/i.test(a.asset) ? <OffthreadVideo src={src} muted style={{width:'100%',height:'100%',objectFit:full?'cover':'contain'}}/> : <Img src={src} style={{width:'100%',height:'100%',objectFit:full?'cover':'contain'}}/>) : null;
  if(full) return media ? <AbsoluteFill>{media}</AbsoluteFill> : null;
  return <div style={{position:'absolute',top:height*.26,left:width*.2,width:width*.6,display:'flex',justifyContent:'center',transform:`scale(${q})`,pointerEvents:'none',fontFamily:fontStack(plan.theme.font)}}>
    {media ? <div style={{height:300*u,width:'100%',filter:`drop-shadow(0 0 ${12*u}px ${plan.theme.accent})`}}>{media}</div> : <div style={{background:plan.theme.accent,color:plan.theme.background,padding:`${18*u}px ${30*u}px`,fontSize:58*u,fontWeight:900,borderRadius:12*u,textAlign:'center',maxWidth:'100%',overflowWrap:'anywhere'}}>{a.label || a.word.toUpperCase()}</div>}
  </div>;
};
export const HypitWordAnchorLayer: React.FC<{plan:FilmPlan;scene:PlanScene;assetUrls:Record<string,string>}> = props => <AbsoluteFill style={{pointerEvents:'none'}}>
  {validAnchors(props.scene).map((a,i)=><WordAnchor key={i} words={props.scene.words} triggerWord={a.word} occurrence={a.occurrence} spanWords={a.spanWords} wordId={a.wordId} holdFrames={18}><Visual anchor={a} plan={props.plan} assetUrls={props.assetUrls}/></WordAnchor>)}
</AbsoluteFill>;
export const WordMotionWrap: React.FC<{scene:PlanScene;children:React.ReactNode}> = ({scene,children}) => {
  const f=useCurrentFrame();const {fps}=useVideoConfig();let scale=1,x=0,y=0;
  for(const a of validAnchors(scene)) {
    const r=resolveAnchor(scene.words,{triggerWord:a.word,occurrence:a.occurrence,spanWords:a.spanWords,wordId:a.wordId});
    const ms=f/fps*1000;if(ms<r.startMs || ms>=r.endMs+180)continue;
    const q=Math.max(0,Math.min(1,(ms-r.startMs)/Math.max(1,r.endMs+180-r.startMs)));
    if(a.effect==='zoom_punch')scale=Math.max(scale,1+.08*Math.sin(q*Math.PI));
    if(a.effect==='camera_shake'){x+=Math.sin(f*2.9)*5*(1-q);y+=Math.cos(f*2.1)*3*(1-q);}
  }
  return <AbsoluteFill style={{transform:`translate(${x}px,${y}px) scale(${scale})`}}>{children}</AbsoluteFill>;
};
