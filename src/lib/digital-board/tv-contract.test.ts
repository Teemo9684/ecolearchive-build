import {describe,it,expect} from "vitest";
import {toTvPackage,tvChecksum} from "./tv-contract";
import type {BoardSnapshot} from "./model";
describe("TV contract",()=>{it("projects approved aggregates and matches receiver checksum",()=>{const s:BoardSnapshot={schemaVersion:1,revision:"r",approvedAt:"2026-11-24",school:"school",year:"2026",pages:[{id:"a",kind:"statistics",title:"stats",body:"private note not projected",enabled:true,seconds:20,rows:[{id:"r",cells:["first","2","10","12"]}]}]};const p=toTvPackage(s,1);expect(p.snapshot.data.levels[0].boys).toBe(10);expect(p.manifest.checksum).toBe(tvChecksum(p.snapshot.data));expect(JSON.stringify(p)).not.toContain("private note");expect(p.snapshot.data.news).toEqual([]);});});
