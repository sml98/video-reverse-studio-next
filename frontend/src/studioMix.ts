export type MixKey='motion_pct'|'cutout_pct'|'gameplay_pct'|'broll_pct';
export function redistributeMix<T extends Record<MixKey,number>>(old:T,key:MixKey,value:number):T {
 const keys=(['motion_pct','cutout_pct','gameplay_pct','broll_pct'] as const).filter(k=>k!==key);
 value=Math.max(0,Math.min(100,Math.round(value)));
 const sum=keys.reduce((s,k)=>s+old[k],0);
 const raw=keys.map(k=>(100-value)*(sum?old[k]/sum:1/keys.length));
 const shares=raw.map(Math.floor);let remainder=100-value-shares.reduce((a,b)=>a+b,0);
 const order=keys.map((_,i)=>i).sort((a,b)=>(raw[b]-shares[b])-(raw[a]-shares[a]));
 for(let i=0;i<remainder;i++)shares[order[i]]++;
 const next={...old,[key]:value};keys.forEach((k,i)=>{next[k]=shares[i] as T[typeof k];});return next;
}
