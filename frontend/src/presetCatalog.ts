import type {Niche} from "./api";
export const PRESET_FAMILIES=[{id:"featured",label:"Em destaque"},{id:"all",label:"Todos"},{id:"apresentadores",label:"Mascotes e avatares"},{id:"documental",label:"Documentais"},{id:"dados",label:"Dados"},{id:"tipografia",label:"Tipografia"},{id:"explicativos",label:"Explicativos"}];
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function filterPresets(items:Niche[],query:string,family:string):Niche[]{
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  return items.filter(n=>(family==="all"||family==="featured"&&n.featured||n.family===family)&&terms.every(q=>normalize([n.title,n.description,...n.visualLanguages,...(n.capabilities||[])].join(" ")).includes(q))).sort((a,b)=>Number(b.id==="framerise-chibi")-Number(a.id==="framerise-chibi")||Number(b.featured)-Number(a.featured)||a.title.localeCompare(b.title,"pt-BR"));
}
export function creationMode(content:"example"|"script"|"idea",text:string,agent:string):{idea:string;agent:string}{
  if(content==="example")return {idea:"",agent:"draft"};
  if(!text.trim())throw new Error(content==="script"?"Cole o roteiro que será narrado.":"Descreva o tema que o agente deve desenvolver.");
  if(content==="idea"&&agent==="auto_local")throw new Error("Para desenvolver um tema, escolha um agente conectado. A montagem local usa um roteiro pronto.");
  return {idea:text.trim(),agent};
}
