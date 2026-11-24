import {describe,it,expect} from "vitest";
import {makeSnapshot,movePage,type BoardPage} from "./model";
const p:BoardPage={id:"a",kind:"news",title:"خبر",body:"محتوى",seconds:20,enabled:true};
describe("digital board",()=>{it("publishes enabled pages only, without sharing draft references",()=>{const result=makeSnapshot([p,{...p,id:"b",enabled:false}],"school","year","r","now");expect(result.pages).toHaveLength(1);expect(result.pages[0]).not.toBe(p);});it("rejects empty and invalid schedules",()=>{expect(()=>makeSnapshot([],"s","y","r","n")).toThrow();expect(()=>makeSnapshot([{...p,seconds:0}],"s","y","r","n")).toThrow();});it("preserves order without mutation",()=>{const pages=[p,{...p,id:"b"}];expect(movePage(pages,0,1)[0].id).toBe("b");expect(pages[0].id).toBe("a");});});
