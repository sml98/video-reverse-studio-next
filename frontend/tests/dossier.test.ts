import {describe,it,expect} from "vitest";
import {dossierCue,lensOffset} from "../src/remotion/scenes/Dossier";
import {paramsSchema,SCENE_SPECS} from "../src/contracts/plan";

describe("dossier cues and optical coordinates",()=>{
  it("keeps the source point centred under the magnifier at every zoom",()=>{
    for(const center of [0,125,500,970]) for(const zoom of [1.1,1.8,3]) {
      expect(center*zoom+lensOffset(center,zoom)).toBeCloseTo(center,8);
    }
  });
  it("tracks the new narration, normalizes accents and disables removed cues",()=>{
    const words=[{id:"a",word:"três,",start:1200,end:1500},{id:"b",word:"três",start:2800,end:3100}];
    expect(dossierCue(words,"tres",2,.7)).toBe(2.8);
    expect(dossierCue(words,"removed",1,.7)).toBe(Infinity);
    expect(dossierCue(words,"",1,.7)).toBe(.7);
  });
  it("rejects unsafe media paths and invalid lens modes through the shared contract",()=>{
    const schema=paramsSchema(SCENE_SPECS["vrs-dossier"]);
    expect(()=>schema.parse({media:"../secret.mp4"})).toThrow();
    expect(()=>schema.parse({mode:"unknown"})).toThrow();
  });
});
