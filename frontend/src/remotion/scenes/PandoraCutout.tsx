import React from 'react';
import {AbsoluteFill, OffthreadVideo, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {useVrs, withAlpha, fmtNumber, fontStack} from '../core/theme';
import {AssetImg} from './common';
import {StickFigureSVG,computeSpeechState} from './characters';

export const PandoraCutoutScene: React.FC<{params:Record<string,any>}> = ({params:p}) => {
 const frame=useCurrentFrame();const {width,height,fps}=useVideoConfig();
 const {theme,layout,assetUrl,words,narration}=useVrs();const u=layout.u;
 const q=Math.min(1,Math.max(0,spring({frame:frame-8,fps,config:{damping:20,stiffness:100}})));
 const speech=computeSpeechState(frame,fps,words,narration||'');
 const right=p.presenterSide!=='left';const presenterW=width*(layout.vertical?.58:.35);
 const background=p.backgroundAsset;
 return <AbsoluteFill style={{background:theme.background,overflow:'hidden',fontFamily:fontStack(theme.font)}}>
  {background ? /\.(mp4|webm|mov)$/i.test(background) ? <OffthreadVideo src={assetUrl(background)} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <AssetImg src={background} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <>
   <AbsoluteFill style={{background:`radial-gradient(ellipse at 50% 40%, ${withAlpha(theme.accent2,.23)}, transparent 65%)`}}/>
   <div style={{position:'absolute',inset:'50% -35% -50%',backgroundImage:`linear-gradient(${withAlpha(theme.accent,.16)} 2px,transparent 2px),linear-gradient(90deg,${withAlpha(theme.accent,.16)} 2px,transparent 2px)`,backgroundSize:`${80*u}px ${80*u}px`,transform:`perspective(600px) rotateX(62deg) translateY(${frame*.35}px)`}}/>
  </>}
  {background && <AbsoluteFill style={{background:'radial-gradient(ellipse,rgba(0,0,0,.12),rgba(0,0,0,.66))'}}/>}
  <div style={{position:'absolute',top:layout.padTop,left:layout.padX,right:layout.padX,textAlign:'center'}}>
   {p.kicker && <div style={{color:theme.accent,fontSize:30*u,fontWeight:800,letterSpacing:3*u}}>{p.kicker}</div>}
   <div style={{color:theme.foreground,fontSize:(layout.vertical?74:86)*u,fontWeight:900,lineHeight:1.08,marginTop:16*u,overflowWrap:'anywhere'}}>{p.title}</div>
  </div>
  <div style={{position:'absolute',top:height*.32,left:layout.padX,right:layout.padX,textAlign:'center',transform:`translateY(${(1-q)*30*u}px)`,opacity:q}}>
   <div style={{fontSize:(layout.vertical?125:150)*u,fontWeight:900,lineHeight:1,color:theme.accent,textShadow:`0 0 ${35*u}px ${withAlpha(theme.accent,.3)}`}}>{p.metricPrefix}{fmtNumber(Number(p.metricValue||0)*q)}{p.metricSuffix}</div>
   <div style={{fontSize:34*u,color:theme.foreground,marginTop:20*u}}>{p.metricLabel}</div>
  </div>
  <div style={{position:'absolute',left:!right?undefined:layout.padX,right:right?undefined:layout.padX,top:height*.51,width:width*(layout.vertical?.42:.44),display:'grid',gap:16*u}}>
   {(p.cards||[]).slice(0,4).map((card:any,i:number)=>{
    const z=spring({frame:frame-16-i*12,fps,config:{damping:16,stiffness:150}});
    return <div key={i} style={{padding:`${16*u}px ${20*u}px`,borderLeft:`${5*u}px solid ${theme.accent}`,background:withAlpha(theme.background,.86),color:theme.foreground,fontSize:30*u,fontWeight:700,opacity:Math.min(1,z),transform:`translateX(${(1-z)*(right?-70:70)*u}px)`}}>{typeof card==='string'?card:card.label}</div>;
   })}
  </div>
  <div style={{position:'absolute',width:presenterW,height:height*.40,right:right?width*.015:undefined,left:right?undefined:width*.015,top:height*.47,filter:`drop-shadow(0 0 ${12*u}px ${withAlpha(theme.accent,.55)})`,transform:`translateY(${Math.sin(frame/fps*2)*5*u}px) scale(${1+(p.cameraMode==='closeup'?.12:p.cameraMode==='auto_cut'&&Math.floor(frame/fps/2)%2?.06:0)+(speech.talking?speech.syllablePulse*.015:0)})`,transformOrigin:'bottom center'}}>
   {p.presenterAsset ? <AssetImg src={p.presenterAsset} style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'bottom'}}/> : <svg width="100%" height="100%" viewBox="0 0 260 420"><StickFigureSVG frame={frame} fps={fps} action="explain_board" expression="happy" accessory="none" viseme={speech.viseme} talking={speech.talking} syllablePulse={speech.syllablePulse} strokeColor={theme.foreground} accentColor={theme.accent}/></svg>}
  </div>
  {p.highlightBadge && <div style={{position:'absolute',left:width*.2,right:width*.2,top:height*.83,textAlign:'center',fontWeight:900,fontSize:32*u,color:theme.background,background:theme.accent,borderRadius:8*u,padding:12*u}}>{p.highlightBadge}</div>}
  {p.stickerAsset && <div style={{position:'absolute',right:width*.08,top:height*.23,width:120*u,height:120*u,transform:`scale(${q})`}}><AssetImg src={p.stickerAsset} style={{width:'100%',height:'100%',objectFit:'contain'}}/></div>}
 </AbsoluteFill>;
};
