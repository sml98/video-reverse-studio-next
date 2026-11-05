import React from "react";
import {AbsoluteFill,Img,useCurrentFrame,useVideoConfig} from "remotion";
import {fontStack,useVrs} from "../core/theme";
import {prog} from "../core/easing";
import {computeSpeechState} from "./characters";

type P=Record<string,any>;
const lime="#C3FF5F",violet="#9C7BFF",ink="#111015",paper="#F1EDDF";

export function typedPrompt(text:string, progress:number):string {
  return [...text].slice(0,Math.floor(Math.max(0,Math.min(1,progress))*[...text].length)).join("");
}

export const FrameMark:React.FC<{size?:number;color?:string}>=({size=100,color=lime})=><svg width={size} height={size} viewBox="0 0 100 100" fill="none"><path d="M8 31V8H31M69 8H92V31M92 69V92H69M31 92H8V69" stroke={color} strokeWidth="6"/><path d="M38 29L74 50L38 71Z" fill={color}/></svg>;

export const MascotSprite:React.FC<{poses:{asset:string}[];pose:number;x:number;y:number;height:number;talk:boolean;motion:number}>=({poses,pose,x,y,height,talk,motion})=>{
  const f=useCurrentFrame();const{fps}=useVideoConfig();const{assetUrl,words=[],narration=""}=useVrs();
  const speech=computeSpeechState(f,fps,words,narration);
  let index=pose;
  if(talk&&(pose===2||pose===3))index=speech.talking?3:2;
  if(pose===0&&(f/fps)%3.7<.12)index=1;
  const selected=poses[index]||poses[0];if(!selected?.asset)return null;
  const q=prog(f,0,fps*.42,"out");const bounce=Math.sin(f/fps*2)*5*motion;
  return <div style={{position:"absolute",left:x,top:y+bounce+(1-q)*40,width:height*1.5,height,transform:`rotate(${Math.sin(f/fps*1.8)*1.2*motion}deg) scale(${.92+.08*q})`,opacity:q,transformOrigin:"50% 85%",filter:"drop-shadow(0 15px 25px #0005)"}}><Img src={assetUrl(selected.asset)} style={{width:"100%",height:"100%",objectFit:"contain"}}/></div>;
};

const Cursor:React.FC<{x:number;y:number;pressed:boolean;ring:number}>=({x,y,pressed,ring})=><g transform={`translate(${x} ${y})`}>
  {ring>0&&ring<1&&<circle r={12+ring*45} stroke={lime} strokeWidth="4" fill="none" opacity={1-ring}/>}
  <g transform={`scale(${pressed?.78:1})`}><path d="M0 0V53L14 40L27 66L40 60L26 36L48 32Z" fill="#fff" stroke={ink} strokeWidth="3" strokeLinejoin="round"/></g>
</g>;

/** A deliberately labelled interface illustration; none of these buttons automate the real app. */
export const ProductWindow:React.FC<{p:P;t:number;action:number;mode:string;preview:string}>=({p,t,action,mode,preview})=>{
  const typing=typedPrompt(p.prompt,Math.max(0,Math.min(1,t/Math.max(.1,action-.15))));
  const generated=t>=action;const processing=["script","voice","cuts"].includes(mode);
  const playProgress=(t*2)%1;const ring=(t-action)/.12;
  const x=mode==="prompt"?310+410*prog(t,.35,.25):mode==="finish"?865:450+200*prog(t,.2,.35);
  const y=mode==="prompt"?410+255*prog(t,.35,.25):mode==="finish"?85:810;
  return <svg viewBox="0 0 1000 1000" width="100%" height="100%" style={{overflow:"visible",fontFamily:fontStack("sans")}}>
    <rect width="1000" height="1000" rx="24" fill="#191723" stroke="#51465d" strokeWidth="2"/>
    <rect x="1" y="1" width="998" height="116" rx="24" fill="#232030"/>
    <circle cx="40" cy="32" r="6" fill="#ef7994"/><circle cx="61" cy="32" r="6" fill="#f0d58e"/><circle cx="82" cy="32" r="6" fill={lime}/>
    <text x="45" y="90" fontSize="31" fontWeight="800" fill={lime}>{p.appName}</text><text x="300" y="90" fontSize="22" fill="#bdb2ca">Seu próximo vídeo</text>
    <rect x="768" y="49" width="190" height="54" rx="12" fill={lime}/><text x="863" y="84" textAnchor="middle" fontSize="24" fontWeight="800" fill={ink}>{mode==="finish"?"Exportar":"Novo vídeo"}</text>
    <text x="500" y="160" textAnchor="middle" fontSize="18" letterSpacing="2" fill={violet}>DEMONSTRAÇÃO VISUAL DO FLUXO</text>
    {mode==="prompt"?<>
      <text x="80" y="259" fontSize="39" fill={paper} fontWeight="800">O que vamos criar?</text>
      <rect x="75" y="308" width="850" height="275" rx="20" fill="#111015" stroke={violet} strokeWidth="3"/>
      <foreignObject x="105" y="344" width="790" height="210"><div style={{fontSize:35,color:paper,lineHeight:1.5,overflowWrap:"anywhere"}}>{typing}<span style={{color:lime,opacity:Math.floor(t*14)%2?1:.2}}>│</span></div></foreignObject>
      <rect x="558" y="619" width="365" height="85" rx="14" fill={generated?violet:lime}/><text x="740" y="672" textAnchor="middle" fontSize="32" fontWeight="800" fill={ink}>{generated?"Criando cenas…":"Criar meu vídeo"}</text>
      <text x="80" y="807" fontSize="24" fill="#b5a9c0">Roteiro → Voz → Cenas → Exportação</text>
    </>:processing?<>
      <text x="80" y="257" fontSize="39" fill={paper} fontWeight="800">Sua ideia ganha forma</text>
      {["Roteiro","Voz e legendas","Cenas e animações"].map((name,i)=>{const done=t>(i+1)*.2;return <g key={name} opacity={done?1:.55}><rect x="75" y={325+i*110} width="850" height="83" rx="14" fill={done?"#31283d":"#211d2b"}/><circle cx="120" cy={366+i*110} r="17" stroke={done?lime:violet} strokeWidth="3" fill="none"/><text x="165" y={376+i*110} fontSize="30" fill={paper}>{name}</text>{done&&<path d={`M110 ${365+i*110}l8 8 17-18`} stroke={lime} strokeWidth="4" fill="none"/>}</g>;})}
      {Array.from({length:35},(_,i)=>{const hh=20+90*Math.abs(Math.sin(i*1.2+t*10));return <rect key={i} x={100+i*23} y={800-hh/2} width="11" height={hh} rx="4" fill={i%3?lime:violet}/>;})}
    </>:<>
      <rect x="46" y="210" width="235" height="499" rx="14" fill="#101016"/>
      {[0,1,2].map((i)=><g key={i}><rect x="67" y={242+i*141} width="192" height="117" rx="10" fill={i===(generated?1:0)?"#544a68":"#2e2938"} stroke={i===(generated?1:0)?lime:"none"} strokeWidth="3"/><text x="90" y={310+i*141} fill={paper} fontSize="22">Cena 0{i+1}</text></g>)}
      <rect x="315" y="210" width="620" height="499" rx="12" fill="#0b1011"/>
      {preview&&<image href={preview} x="335" y="226" width="580" height="465" preserveAspectRatio="xMidYMid slice"/>}
      <rect x="445" y="730" width="310" height="45" rx="22" fill="#332d40"/><text x="600" y="760" fill={paper} textAnchor="middle" fontSize="22">▶ Prévia em reprodução</text>
      {[0,1,2].map((row)=><g key={row}><rect x="80" y={811+row*43} width="840" height="28" rx="5" fill="#2b2634"/>{[0,1,2].map((i)=><rect key={i} x={85+i*275+(row%2)*18} y={814+row*43} width={250-row*16} height="22" rx="4" fill={row===0?lime:row===1?violet:"#638864"}/>)}</g>)}
      <path d={`M${90+playProgress*810} 795V950`} stroke={paper} strokeWidth="3"/>
    </>}
    {mode==="finish"&&generated&&<g><rect x="110" y="300" width="780" height="400" rx="24" fill="#251f31" stroke={violet} strokeWidth="2"/><text x="500" y="388" textAnchor="middle" fill={lime} fontSize="42" fontWeight="800">{t>action+.12?"Vídeo pronto!":"Exportando…"}</text><text x="500" y="463" textAnchor="middle" fill={paper} fontSize="27">{p.fileName}</text><rect x="175" y="520" width="650" height="13" rx="6" fill="#4e435f"/><rect x="175" y="520" width={650*prog(t,action,.12)} height="13" rx="6" fill={lime}/><text x="500" y="615" textAnchor="middle" fill={paper} fontSize="25">MP4 · pronto para baixar</text></g>}
    <Cursor x={x} y={y} pressed={t>=action&&t<action+.025} ring={ring}/>
  </svg>;
};

export const FrameRiseChibiScene:React.FC<{params:P}>=({params:p})=>{
  const f=useCurrentFrame();const{fps,width,height,durationInFrames}=useVideoConfig();const{assetUrl}=useVrs();
  const vertical=height>=width;const w=vertical?1080:1920;const h=vertical?1920:1080;const scale=Math.min(width/w,height/h);
  const t=f/Math.max(1,durationInFrames-1);const enter=prog(f,0,fps*.4,"out");const mode=p.mode;const action=p.actionProgress;
  const bg=p.backgroundAsset?assetUrl(p.backgroundAsset):"";const previews=(p.previews||[]).filter((x:P)=>x.asset).map((x:P)=>assetUrl(x.asset));
  const preview=previews[Math.min(previews.length-1,Math.floor(t*previews.length))]||bg;
  const ui=["prompt","script","voice","edit","finish","cuts"].includes(mode);const hero=["hello","mascot"].includes(mode);
  const titleStyle:React.CSSProperties={position:"absolute",left:vertical?150:100,top:vertical?335:160,width:vertical?780:730,fontSize:Math.max(44,Math.min(vertical?66:72,2300/Math.max(20,p.title.length))),fontWeight:900,lineHeight:1.06,color:p.accent,letterSpacing:-1.5,transform:`translateY(${(1-enter)*24}px)`,opacity:enter,overflowWrap:"anywhere"};
  return <AbsoluteFill style={{background:ink,alignItems:"center",justifyContent:"center",fontFamily:fontStack("sans")}}><div style={{position:"relative",width:w,height:h,flexShrink:0,overflow:"hidden",transform:`scale(${scale})`,color:paper}}>
    {bg&&<Img src={bg} style={{position:"absolute",inset:0,width:w,height:h,objectFit:"cover",transform:`scale(${1.035+t*.035*p.motion}) translateX(${Math.sin(t*3)*6*p.motion}px)`}}/>}
    <AbsoluteFill style={{background:ui?"linear-gradient(160deg,#111015fa,#21192eea)":"linear-gradient(180deg,#11101592,transparent 45%,#111015a0)"}}/>
    <div style={{position:"absolute",left:vertical?80:100,top:vertical?60:60,display:"flex",gap:18,alignItems:"center",fontSize:27,fontWeight:800,color:paper}}><FrameMark size={48} color={p.accent}/>{p.appName}<span style={{fontSize:15,color:violet,letterSpacing:2}}>STUDIO</span></div>
    <div style={titleStyle}>{p.title}</div>
    {ui?<div style={{position:"absolute",left:vertical?52:950,top:vertical?570:170,width:vertical?976:850,height:vertical?730:670,transform:`translateY(${(1-enter)*40}px) scale(${.96+.04*enter})`,opacity:enter}}><ProductWindow p={p} t={t} action={action} mode={mode} preview={preview}/></div>:mode==="styles"?<div style={{position:"absolute",left:vertical?100:900,top:vertical?650:220,display:"flex",gap:15}}>{previews.slice(0,3).map((url:string,i:number)=><div key={url} style={{width:vertical?270:250,height:vertical?470:420,border:`6px solid ${Math.min(2,Math.floor(t*3))===i?p.secondary:"#26212e"}`,borderRadius:18,overflow:"hidden",transform:`rotate(${(i-1)*7}deg) translateY(${Math.sin(t*4+i)*8}px)`}}><Img src={url} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>)}</div>:mode==="sound"?<div style={{position:"absolute",left:vertical?240:1020,top:vertical?650:260}}><svg width="600" height="540" viewBox="0 0 600 540">{[0,1,2,3,4].map(i=><circle key={i} cx="300" cy="270" r={65+i*40+Math.sin(f/fps*2-i)*7} stroke={i%2?p.accent:p.secondary} strokeWidth="3" fill="none" opacity={.8-i*.12}/>)}<path d="M270 220L350 270L270 320Z" fill={p.accent}/></svg></div>:mode==="cta"||mode==="brand"?<div style={{position:"absolute",left:vertical?180:950,top:vertical?640:250,width:vertical?720:800,textAlign:"center",transform:`scale(${.92+.08*enter})`,opacity:enter}}><FrameMark size={150} color={p.accent}/><div style={{fontSize:vertical?112:120,fontWeight:900,marginTop:25,color:p.accent,background:"#111015e8",border:"1px solid #83729c",borderRadius:16,padding:"8px 12px"}}>{p.appName}</div><div style={{marginTop:36,padding:"24px 20px",borderRadius:16,background:p.accent,color:ink,fontSize:34,fontWeight:900}}>{p.cta}</div></div>:!hero&&preview?<div style={{position:"absolute",left:vertical?175:975,top:vertical?580:220,width:vertical?730:740,height:vertical?650:530,border:`8px solid ${mode==="after"?p.accent:paper}`,borderRadius:20,overflow:"hidden",transform:`rotate(${mode==="before"?0:Math.sin(t*2)*2}deg) scale(${mode==="after"?1+t*.08:1})`,boxShadow:mode==="after"?`0 0 60px ${p.secondary}66`:"0 18px 60px #0007"}}><Img src={preview} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>:null}
    {hero&&<>{previews.slice(0,2).map((url:string,i:number)=><div key={url} style={{position:"absolute",left:vertical?620+i*70:1250+i*120,top:vertical?650+i*270:230+i*180,width:220,height:310,border:`6px solid ${p.secondary}`,borderRadius:18,overflow:"hidden",transform:`rotate(${i?-9:9}deg)`}}><Img src={url} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>)}</>}
    <MascotSprite poses={p.poses} pose={p.pose} x={vertical?(hero?-50:490):80} y={vertical?(hero?650:1370):360} height={vertical?(hero?770:350):450} talk={p.reactToSpeech} motion={p.motion}/>
    {mode==="after"&&Array.from({length:12},(_,i)=><div key={i} style={{position:"absolute",left:(i*137+140)%w,top:(i*211+580)%(h*.7),fontSize:20,color:i%2?p.secondary:p.accent,opacity:.25+.5*Math.abs(Math.sin(f/fps+i)),transform:`rotate(${f*2+i*30}deg)`}}>✦</div>)}
    <div style={{position:"absolute",left:vertical?80:100,bottom:vertical?64:40,fontSize:15,letterSpacing:2,color:"#c1b4cc"}}>{p.footer}</div>
  </div></AbsoluteFill>;
};
