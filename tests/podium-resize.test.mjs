import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observePodiumSize} from '../components/rankme/podium-resize.js';
test('resize delivery defers layout writes, coalesces bursts and cancels work after unmount',()=>{
 const original={ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 let notify,disconnected=false,id=0,calls=0;const frames=new Map(),observed=[];
 globalThis.ResizeObserver=class{constructor(callback){notify=callback;}observe(t){observed.push(t);}disconnect(){disconnected=true;}};
 globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 try{
  const host={},label={};const controller=observePodiumSize([host,null,label],()=>{calls++;notify();});
  assert.deepEqual(observed,[host,label]);
  notify();notify();notify();assert.equal(calls,0);assert.equal(frames.size,1);
  const [key,frame]=frames.entries().next().value;frames.delete(key);frame();
  assert.equal(calls,1);assert.equal(frames.size,1); // A resulting layout change belongs to a later frame.
  controller.dispose();assert.equal(frames.size,0);assert.equal(disconnected,true);
  notify();controller.schedule();assert.equal(frames.size,0);assert.equal(calls,1);
 }finally{Object.assign(globalThis,original);}
});
