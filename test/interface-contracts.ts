import assert from 'node:assert/strict';
import { createMockApp } from '../mock-server';
async function main(){
 const server=createMockApp().listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 const post=async(path:string,data:any,method='POST')=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json() as Promise<any>};
 let checks=0;
 try{
  for(const name of ['triggerAutoTermination','trigger_auto_termination']){
   const path=name.includes('_')?'/'+name:'/secure/agentTool/ownerTermination/'+name;
   const r=await post(path,{contractId:600001,terminationType:7,backDate:'2026-11-01'});assert.equal(r.errno,'0');assert.equal(r.data.autoApplyId,700001);assert.equal(r.autoApplyId,undefined);checks++;
  }
  for(const bad of [{contractId:0,terminationType:7,backDate:'2026-11-01'},{contractId:600001,terminationType:2,backDate:'2026-11-01'},{contractId:600001,terminationType:1,backDate:'2026-02-30'}]){assert.equal((await post('/trigger_auto_termination',bad)).errno,'1003');checks++;}
  assert.equal((await post('/query_asset_manager_next_contact_time',{orderId:900001})).errno,'1003');checks++;
  for(const [count,next]of [[1,'2026-10-28T12:00:00+08:00'],[2,'2026-10-28T14:00:00+08:00'],[3,'2026-10-29T10:00:00+08:00'],[4,null]]as const){
   await post('/mock/session/time',{state:{assetContact:{count,lastContactAt:'2026-10-28T10:00:00+08:00'}}});
   const r=await post('/mock/session/time/call',{name:'query_asset_manager_next_contact_time',payload:{executionId:500001}});assert.deepEqual(r.data,{remindCount:count-1,nextContactTime:next});checks++;
  }
  await post('/mock/session/accepted',{state:{contactDelivery:{status:'ACCEPTED'}}});
  const c=await post('/mock/session/accepted/call',{name:'contact_zuwu_and_asset_manager',payload:{executionId:500001,target:'ASSET_MANAGER',contactReason:'Mock测试',content:'Mock咨询'}});assert.deepEqual(c.data.contactedTargets,[]);
  const t=await post('/mock/session/accepted/call',{name:'query_asset_manager_next_contact_time',payload:{executionId:500001}});assert.equal(t.errno,'1004');checks++;
  const a=await post('/query_asset_manager_authorization',{orderId:900001});assert.equal(a.data.executionId,'123');assert.notEqual(a.data.executionId,'900001');checks++;
  console.log('接口契约校验通过：'+checks);
 }finally{server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
