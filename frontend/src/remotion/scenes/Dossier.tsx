import React from "react";
import {AbsoluteFill, Img, Loop, OffthreadVideo, useCurrentFrame, useVideoConfig} from "remotion";
import {fontStack, useVrs, type WordTiming} from "../core/theme";
import {prog} from "../core/easing";

type Params = Record<string, any>;
const ink = "#262522";
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const token = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** An explicit missing cue stays disabled; it is never reassigned to another word. */
export function dossierCue(words: WordTiming[], cue: string, occurrence: number, fallbackSeconds: number): number {
  if (!cue.trim()) return fallbackSeconds;
  const match = words.filter(w => token(w.word) === token(cue))[Math.floor(occurrence) - 1];
  return match ? match.start / 1000 : Infinity;
}

/** Position a scaled copy so the selected source point remains under the lens centre. */
export function lensOffset(center: number, zoom: number): number {
  return center * (1 - zoom);
}

export const PaperField: React.FC<{color: string; w: number; h: number}> = ({color, w, h}) => (
  <AbsoluteFill style={{backgroundColor: color, backgroundImage: "radial-gradient(rgba(58,46,32,.12) .6px, transparent .7px), linear-gradient(120deg, rgba(255,255,255,.65), transparent 60%)", backgroundSize: "7px 9px, 100% 100%"}}>
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{opacity: .12}}>
      {Array.from({length: 24}, (_, i) => <path key={i} d={`M ${-100 + i * 91} 0 l ${120 + i * 3} ${h}`} stroke="#9f9586" strokeWidth=".6" />)}
    </svg>
  </AbsoluteFill>
);

export const DossierCallout: React.FC<{x: number; y: number; w: number; label: string; detail: string; value?: string; accent: string; progress: number}> = ({x,y,w,label,detail,value,accent,progress}) => (
  <div style={{position:"absolute", left:x, top:y, width:w, padding:"22px 26px", background:ink, color:"#fff", boxSizing:"border-box", borderLeft:`4px solid ${accent}`, boxShadow:"7px 12px 24px #28251c25", opacity:progress, transform:`translateY(${(1-progress)*18}px)`}}>
    <div style={{fontFamily:fontStack("mono"), fontSize:16, letterSpacing:1.7, lineHeight:1.4, overflowWrap:"anywhere"}}>{label}</div>
    {value !== undefined && <div style={{fontFamily:fontStack("serif"), fontSize:Math.min(64,(w-52)/Math.max(1,value.length*.64)), fontWeight:700, color:accent, lineHeight:1.25, fontVariantNumeric:"tabular-nums", overflowWrap:"anywhere"}}>{value}</div>}
    {detail && <div style={{fontSize:23, lineHeight:1.35, marginTop:10, overflowWrap:"anywhere"}}>{detail}</div>}
  </div>
);

/** Editable paper graphics, used both on the desk and inside the magnifier. */
export const EvidencePaper: React.FC<{p: Params; w: number; h: number; accent: string; imageUrl: string}> = ({p,w,h,accent,imageUrl}) => (
  <div style={{position:"relative", width:w, height:h, background:"#f5f0e2", color:ink, padding:h<500?"24px 48px":"42px 48px", boxSizing:"border-box", fontFamily:fontStack("mono"), overflow:"hidden", border:"1px solid #bcb4a3"}}>
    <div style={{fontSize:h<500?12:16, letterSpacing:3, borderBottom:"1px solid #a49e90", paddingBottom:h<500?10:16}}>{p.documentId}</div>
    <div style={{fontFamily:fontStack("serif"), fontSize:h<500?32:43, lineHeight:1.12, fontWeight:700, marginTop:h<500?12:20, maxWidth:"94%", overflowWrap:"anywhere"}}>{p.title}</div>
    <div style={{fontSize:h<500?16:20, lineHeight:1.5, marginTop:h<500?12:24, whiteSpace:"pre-line", overflowWrap:"anywhere"}}>{p.documentText}</div>
    {imageUrl ? <Img src={imageUrl} style={{width:w-96, height:h*.34, marginTop:h<500?12:24, objectFit:"contain", objectPosition:"center", filter:"grayscale(.5) sepia(.2)"}} /> : (
      <svg width={w-96} height={h*.32} viewBox="0 0 600 210" style={{marginTop:22}}>
        <g stroke="#77766a" fill="none" strokeWidth="1.5">
          <path d="M20 175L112 75L240 112L350 30L485 122L580 65M20 55L140 175L260 45L405 180L580 150" />
          {[20,112,240,350,485,580].map((x,i)=><circle key={x} cx={x} cy={[175,75,112,30,122,65][i]} r="9" />)}
          <path d="M0 200H600M0 0V200" strokeDasharray="4 7" />
        </g>
        <circle cx="350" cy="30" r="24" stroke={accent} strokeWidth="3" fill="none" />
        <text x="355" y="95" fill={ink} fontSize="17" fontFamily="monospace">{p.documentId}</text>
      </svg>
    )}
    <div style={{position:"absolute",bottom:h<500?15:25,left:48,right:48,borderTop:"1px solid #a49e90",paddingTop:h<500?7:12,fontSize:h<500?12:15,color:"#676256"}}>{p.credit || "DOCUMENTO ILUSTRATIVO · SUBSTITUA PELO SEU MATERIAL"}</div>
  </div>
);

export const DossierScene: React.FC<{params: Params}> = ({params:p}) => {
  const frame = useCurrentFrame();
  const {width,height,fps,durationInFrames} = useVideoConfig();
  const {theme,assetUrl,words=[]} = useVrs();
  const portrait = height > width * 1.15;
  const square = !portrait && width < height * 1.2;
  const w = portrait || square ? 900 : 1600;
  const h = portrait ? 1600 : 900;
  const scale = Math.min(width/w,height/h);
  const accent = p.accent || theme.accent;
  const cue = dossierCue(words,p.cueWord,p.cueOccurrence,p.cueSeconds);
  const enter = p.entry === "none" ? 1 : prog(frame,0,fps*.65,"out");
  const reveal = Number.isFinite(cue) ? prog(frame,cue*fps,fps*.45,"out") : 0;
  const count = Number.isFinite(cue) ? prog(frame,cue*fps,p.counterSeconds*fps,"out") : 0;
  const t = clamp(frame/Math.max(1,durationInFrames-1));
  const mediaUrl = p.media ? assetUrl(p.media) : "";
  const docUrl = p.documentImage ? assetUrl(p.documentImage) : "";
  const full = !portrait && !square;
  const paperW = full ? 970 : 720;
  const paperH = full ? 620 : portrait ? 650 : 360;
  const paperX = full ? 130 : 82;
  const paperY = portrait ? 200 : 138;
  const cx = (p.focusFromX + (p.focusToX-p.focusFromX)*prog(frame,fps*.3,Math.max(1,durationInFrames-fps*.6),"smooth"))*paperW;
  const cy = (p.focusFromY + (p.focusToY-p.focusFromY)*prog(frame,fps*.3,Math.max(1,durationInFrames-fps*.6),"smooth"))*paperH;
  const lensR = full ? 142 : square ? 100 : 125;
  const callX = full ? 1160 : 84;
  const callY = portrait ? 900 : square ? 510 : 235;
  const callW = full ? 340 : 732;
  const value = p.showCounter ? `${p.prefix}${(p.value*count).toLocaleString("pt-BR",{minimumFractionDigits:Math.floor(p.decimals),maximumFractionDigits:Math.floor(p.decimals)})}${p.suffix}` : undefined;
  const planeTransform = p.entry === "perspective" ? `perspective(1800px) translateX(${(1-enter)*w*.3}px) rotateY(${(1-enter)*-32}deg) rotateZ(${(1-enter)*4}deg)` : `translateX(${(1-enter)*80}px)`;
  const media = mediaUrl ? p.mediaType === "video" ? (
    p.videoLoopSeconds > 0 ? <Loop durationInFrames={Math.max(1,Math.round(p.videoLoopSeconds*fps))}><OffthreadVideo src={mediaUrl} trimBefore={Math.round(p.videoStartSeconds*fps)} muted style={{width:"100%",height:"100%",objectFit:p.fit}} /></Loop> : <OffthreadVideo src={mediaUrl} trimBefore={Math.round(p.videoStartSeconds*fps)} muted style={{width:"100%",height:"100%",objectFit:p.fit}} />
  ) : <Img src={mediaUrl} style={{width:"100%",height:"100%",objectFit:p.fit}} /> : null;
  return (
    <AbsoluteFill style={{background:p.paperColor, alignItems:"center",justifyContent:"center",fontFamily:fontStack("sans")}}>
      <div style={{position:"relative",width:w,height:h,flexShrink:0,transform:`scale(${scale})`,overflow:"hidden",color:ink}}>
        <PaperField color={p.paperColor} w={w} h={h}/>
        <div style={{position:"absolute",left:70,right:70,top:52,display:"flex",justifyContent:"space-between",fontFamily:fontStack("mono"),fontSize:15,letterSpacing:2,color:"#6b675f"}}><span>{p.eyebrow}</span><span>{p.documentId}</span></div>
        <div style={{position:"absolute",inset:0,opacity:.25+.75*enter,transform:planeTransform,transformOrigin:"55% 50%"}}>
          {p.mode === "frame" ? (
            <div style={{position:"absolute",left:paperX,top:paperY,width:paperW,height:portrait?600:square?350:560,background:"#fff",padding:14,boxSizing:"border-box",transform:`rotate(${p.rotation}deg) translate(${t*7*p.motion}px,${-t*5*p.motion}px) scale(${1+t*.025*p.motion})`,boxShadow:"12px 22px 35px #28251c32"}}>
              <div style={{width:"100%",height:"100%",overflow:"hidden",background:"#d9d6cc",position:"relative"}}>{media || <div style={{height:"100%",padding:48,boxSizing:"border-box",display:"flex",flexDirection:"column",justifyContent:"center",background:"linear-gradient(140deg,#d5d7cb,#f4f0e7)"}}><div style={{fontSize:16,letterSpacing:3,color:"#676256"}}>ARQUIVO VISUAL</div><div style={{fontFamily:fontStack("serif"),fontSize:portrait?54:68,lineHeight:1.08,marginTop:24,overflowWrap:"anywhere"}}>{p.title}</div><div style={{fontSize:20,marginTop:28,lineHeight:1.5}}>{p.documentText}</div></div>}</div>
              <svg style={{position:"absolute",inset:-9,overflow:"visible"}} width="100%" height="100%"><path d={`M0 30V0H30M${paperW-30} 0H${paperW}V30M0 ${portrait?570:square?320:530}v30h30`} stroke={accent} strokeWidth="3" fill="none"/></svg>
            </div>
          ) : (
            <div style={{position:"absolute",left:paperX,top:paperY,width:paperW,height:paperH,transform:`rotate(${p.rotation}deg) translateY(${-t*4*p.motion}px)`,boxShadow:"12px 22px 35px #28251c32"}}>
              <EvidencePaper p={p} w={paperW} h={paperH} accent={accent} imageUrl={docUrl}/>
              {p.mode === "lens" && <>
                <div style={{position:"absolute",left:0,top:0,width:paperW,height:paperH,clipPath:`circle(${lensR}px at ${cx}px ${cy}px)`}}>
                  <div style={{transformOrigin:"0 0",transform:`translate(${lensOffset(cx,p.zoom)}px,${lensOffset(cy,p.zoom)}px) scale(${p.zoom})`}}><EvidencePaper p={p} w={paperW} h={paperH} accent={accent} imageUrl={docUrl}/></div>
                </div>
                <div style={{position:"absolute",left:cx-lensR,top:cy-lensR,width:lensR*2,height:lensR*2,border:"9px solid #393832",boxSizing:"border-box",borderRadius:"50%",boxShadow:"0 12px 22px #16150e30, inset 0 0 22px #fff9",background:"linear-gradient(130deg,#fff6,transparent 45%)"}}/>
                <div style={{position:"absolute",left:cx+lensR*.7,top:cy+lensR*.7,width:lensR*.95,height:24,borderRadius:10,background:"linear-gradient(#46453e,#22221d)",transform:"rotate(45deg)",transformOrigin:"12px 12px"}}/>
                <svg width={paperW} height={paperH} style={{position:"absolute",inset:0,pointerEvents:"none",opacity:reveal,overflow:"visible"}}><circle cx={cx} cy={cy} r="28" fill="none" stroke={accent} strokeWidth="3"/></svg>
              </>}
            </div>
          )}
          {p.mode !== "closing" && <>
            <svg width={w} height={h} style={{position:"absolute",inset:0,pointerEvents:"none",opacity:reveal}}><path d={full ? `M${p.mode==="lens"?paperX+cx:paperX+paperW*.8} ${p.mode==="lens"?paperY+cy:paperY+150} L${callX-36} ${callY+24}H${callX}` : `M${paperX+paperW*.7} ${paperY+paperH*.75}V${callY-22}H${callX+30}V${callY}`} fill="none" stroke={accent} strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset={1-reveal}/></svg>
            <DossierCallout x={callX} y={callY} w={callW} label={p.calloutLabel} detail={p.calloutText} value={value} accent={accent} progress={reveal}/>
          </>}
          {p.mode === "closing" && <div style={{position:"absolute",left:full?130:84,right:full?130:84,top:portrait?930:620,padding:"20px 28px",background:ink,color:"#fff",fontFamily:fontStack("serif"),fontWeight:700,fontSize:full?64:44,lineHeight:1.12,borderLeft:`5px solid ${accent}`,opacity:reveal,overflowWrap:"anywhere"}}>{p.closingTitle}</div>}
        </div>
        <div style={{position:"absolute",left:72,right:72,bottom:32,display:"flex",justifyContent:"space-between",fontFamily:fontStack("mono"),fontSize:13,letterSpacing:1,color:"#6b675f"}}><span>{p.credit}</span><span>{p.fictional?"FICÇÃO · DEMONSTRAÇÃO":""}</span></div>
      </div>
    </AbsoluteFill>
  );
};
