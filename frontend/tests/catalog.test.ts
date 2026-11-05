import {describe,it,expect} from "vitest";
import {creationMode,filterPresets} from "../src/presetCatalog";
import {typedPrompt} from "../src/remotion/scenes/FrameRiseChibi";
import type {Niche} from "../src/api";
const item=(id:string,title:string,featured=false,family="documental")=>({id,title,description:"Imagens e animações",visualLanguages:["lupa"],capabilities:["Voz feminina"],featured,family} as Niche);
describe("FrameRise creation flow",()=>{
 it("finds accents across title, effects and capabilities, keeping the featured preset first",()=>{
  const list=[item("dossie","Dossiê",true),item("framerise-chibi","FrameRise Chibi",true,"apresentadores"),item("old","Outro")];
  expect(filterPresets(list,"dossie","all").map(n=>n.id)).toEqual(["dossie"]);
  expect(filterPresets(list,"feminina","featured").map(n=>n.id)).toEqual(["framerise-chibi","dossie"]);
  expect(filterPresets(list,"","apresentadores")).toHaveLength(1);
 });
 it("uses the complete example explicitly, accepts a script and never treats a topic as locally written copy",()=>{
  expect(creationMode("example","ignored draft","mcp")).toEqual({idea:"",agent:"draft"});
  expect(creationMode("script"," Minha história. ","auto_local")).toEqual({idea:"Minha história.",agent:"auto_local"});
  expect(()=>creationMode("script"," ","auto_local")).toThrow();
  expect(()=>creationMode("idea","História da Lua","auto_local")).toThrow();
  expect(creationMode("idea","História da Lua","mcp").agent).toBe("mcp");
 });
 it("finishes typing without splitting Unicode or overshooting the prompt",()=>{
  expect(typedPrompt("Olá 🌙",1)).toBe("Olá 🌙");
  expect(typedPrompt("Olá 🌙",5)).toBe("Olá 🌙");
  expect(typedPrompt("Olá 🌙",-1)).toBe("");
 });
});
