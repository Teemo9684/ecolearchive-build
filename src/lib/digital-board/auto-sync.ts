import {isDesktopRuntime} from "@/lib/db/desktop";
import {repo} from "@/lib/db/idb";
import type {BoardRecord} from "./model";
type Device={id:string;name:string;ip:string};
export type SyncState={phase:"idle"|"sending"|"success"|"offline";revision?:string;at?:number;error?:string};
let state:SyncState={phase:"idle"};let flight:Promise<void>|null=null;const listeners=new Set<(s:SyncState)=>void>();
const set=(s:SyncState)=>{state=s;listeners.forEach(fn=>fn(s));};
export function subscribeBoardSync(fn:(s:SyncState)=>void){listeners.add(fn);fn(state);return()=>{listeners.delete(fn);};}
export function syncBoard(){if(!isDesktopRuntime())return Promise.resolve();if(flight)return flight;flight=(async()=>{const invoke=window.__TAURI_INTERNALS__!.invoke;try{const paired:Device|null=await invoke("board_paired");const record=await repo<BoardRecord>("digitalBoard").get("board");if(!paired||!record?.approved){set({phase:"idle"});return;}set({...state,phase:"sending",error:undefined});const found:Device[]=await invoke("board_discover").catch(()=>[]);const r=await invoke("board_push",{ip:found.find(d=>d.id===paired.id)?.ip??paired.ip});if(!r.activated)throw new Error("No activation receipt");set({phase:"success",revision:r.revision,at:r.at});}catch(e){set({...state,phase:"offline",error:String(e)});}})().finally(()=>{flight=null;});return flight;}
