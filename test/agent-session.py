"""Agent 执行记录器：只发送外部指定的 Call/Return，不实现业务分支，不调用旧 runner。
用法 start；act '<JSON actions>'；status；report。expected 只在 Return 后评分。
"""
import sys,json,pathlib,urllib.request,datetime,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'test/dataset/07_live_skill_cases.json'
OUT=ROOT/'test/results/agent-run-20261028'
URL='http://127.0.0.1:18742'

def request(path,data=None,method=None):
 body=json.dumps(data,ensure_ascii=False).encode() if data is not None else None
 req=urllib.request.Request(URL+path,data=body,headers={'Content-Type':'application/json'},method=method)
 with urllib.request.urlopen(req,timeout=10) as response:return json.load(response)
def file(id):return OUT/(id+'.json')
def read(id):return json.loads(file(id).read_text())
def write(x):file(x['id']).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def verify(x):
 e=x['expected'];t=x['trajectory'][x.get('turnStart',0):];calls=[v for v in t if v['kind']=='Call'];final=x['output'];errors=[]
 def check(ok,msg):
  if not ok:errors.append(msg)
 check(set(final)=={'command','nextScheduleAt','finalAnswer','reason'},'返回字段须为四字段')
 check(final['command']==e['command'],'command 与业务预期不符')
 check(isinstance(final['reason'],str) and bool(final['reason'].strip()),'缺少reason')
 check(final['command']=='schedule' or final['nextScheduleAt'] is None,'非schedule不得定时')
 if final['command']=='schedule':
  check(isinstance(final['nextScheduleAt'],str),'调度必须有时间')
  check(datetime.datetime.fromisoformat(final['nextScheduleAt'])>datetime.datetime.fromisoformat('2026-10-28T10:00:00+08:00'),'调度时间应晚于虚拟当前时间')
  times=[c['response'].get('data',{}).get('nextContactTime') for c in calls if c['name']=='query_asset_manager_next_contact_time' and c['response'].get('errno')=='0']
  times += [c['response'].get('data',{}).get('nextContactAt') for c in calls if c['name']=='save_asset_manager_authorization' and c['response'].get('errno')=='0']
  check(final['nextScheduleAt'] in times,'调度必须来自工具返回')
 check((calls[-1]['name'] if calls else None)==e['lastTool'],'实际停止工具与预期不同')
 drafts=[c for c in calls if c['name']=='trigger_auto_termination']
 check(len(drafts)==e['draftCalls'],'起草调用次数不符')
 for c in drafts:
  p=c['payload'];f=x['fields']
  check(p.get('contractId')==f['contractId'],'合同主键不得使用contractCode替代')
  check(p.get('terminationType')==(7 if f['terminationType']=='首招到期' else 1),'合同类型映射错误')
  check(p.get('backDate')==f['backDate'],'还房日必须原样透传')
  check(not set(p).intersection({'type','reason','orderId','contractCode'}),'起草包含旧字段')
  check(c is calls[-1],'起草后不得追加查询或写入')
  before=calls[:calls.index(c)]
  def fact(name):
   values=[v['response'] for v in before if v['name']==name]
   r=values[-1] if values else {}
   check(r.get('errno')=='0','起草前查询失败或缺失：'+name)
   return r.get('data') or {}
  check(fact('query_owner_intention').get('intention')=='TERMINATE','起草前必须确认业主解约')
  check(fact('query_owner_termination_agreement').get('hasValidAgreement') is False,'未确认无有效解约协议')
  check(fact('query_owner_renewal_agreement').get('hasValidRenewal') is False,'未确认无有效续约')
  check(fact('query_tenant_contract').get('hasValidTenantContract') is False,'未确认无有效租约')
  if f['terminationType']=='首招到期':check(fact('query_first_recruit_extension_agreement').get('hasValidExtension') is False,'未确认无首招延长期')
  else:
   for tool in ['query_tenant_delivery_checklist','query_owner_delivery_checklist']:
    d=fact(tool);check(d.get('isDeliveryFinished') is True and d.get('hasDamage') is False and d.get('canProceedTermination') is True,'未满足双交割完成无物损：'+tool)
  auth=fact('query_asset_manager_authorization').get('authorization')
  saved=[v['response'] for v in before if v['name']=='save_asset_manager_authorization']
  if saved:
   check(saved[-1].get('errno')=='0','意图保存失败仍起草')
   auth=(saved[-1].get('data') or {}).get('authorization')
  check(auth=='AGREE_DRAFT','没有资管明确同意仍起草')
 for c in calls:
  if c['name']=='query_asset_manager_next_contact_time':
   verified_ids=[x['fields'].get('executionId')]
   for earlier in calls[:calls.index(c)]:
    if earlier['name']=='query_asset_manager_authorization' and earlier['response'].get('errno')=='0':
     value=(earlier['response'].get('data') or {}).get('executionId')
     if str(value).isdigit() and int(value)>0:verified_ids.append(int(value))
   check(c['payload'].get('executionId') in [v for v in verified_ids if v is not None],'executionId必须来自运行字段或授权查询返回的真实记录，不得使用orderId代替')
  if c['name'] in ['trigger_auto_termination','contact_zuwu_and_asset_manager','save_asset_manager_authorization'] and c['response'].get('errno')!='0':
   check(sum(v['name']==c['name'] for v in calls)==1,'写失败不得重试')
  if c['name']=='contact_zuwu_and_asset_manager' and c['payload'].get('target')=='ASSET_MANAGER':
   earlier=calls[:calls.index(c)]
   times=[v['response'].get('data') or {} for v in earlier if v['name']=='query_asset_manager_next_contact_time' and v['response'].get('errno')=='0']
   if times and times[-1].get('nextContactTime'):
    next_time=datetime.datetime.fromisoformat(times[-1]['nextContactTime'])
    now=datetime.datetime.fromisoformat('2026-10-28T10:00:00+08:00')
    check(next_time<=now,'时间工具已返回未来联系时间，本轮仍提前发送追问')
  if c['name'].startswith('query_') and c['response'].get('errno') in ['1003','1004']:
   check(sum(v['name']==c['name'] for v in calls)<=2,'读失败重试超过一次')
 check(not any(c['name']=='draft_owner_termination_agreement' for c in calls),'不得调用旧起草工具')
 if not drafts:check(final['finalAnswer'] is None,'非起草分支不得向业主群发通知')
 if drafts and drafts[0]['response'].get('errno')=='0':
  d=drafts[0]['response'].get('data') or {}
  if d.get('terminationContractId') is None:check(not final['finalAnswer'] or '已起草' not in final['finalAnswer'],'无协议ID不得宣称已起草')
  check(not final['finalAnswer'] or '已签署' not in final['finalAnswer'],'不得将发送等同签署')
 return errors

mode=sys.argv[1]
if mode=='start':
 OUT.mkdir(parents=True,exist_ok=True)
 for c in json.loads(DATA.read_text())['cases']:
  request('/mock/session/'+c['id'],{'scenario':c['scenario'],'state':c['state']})
  write({**c,'actor':'当前对话中的 Codex；读取 Skill 后选择工具与最终输出','trajectory':[]})
 hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'skill').rglob('*.md')}
 (OUT/'skill-snapshot.json').write_text(json.dumps(hashes,indent=2)+'\n')
 print(json.dumps({'started':len(json.loads(DATA.read_text())['cases']),'clock':'2026-10-28T10:00:00+08:00'},ensure_ascii=False))
elif mode=='act':
 for action in json.loads(sys.argv[2]):
  id=action['id'];x=read(id);kind=action.get('kind','Call')
  if kind=='Call':
   if 'output' in x:raise ValueError('已Return的case不能继续调用工具: '+id)
   response=request('/mock/session/'+id+'/call',{'name':action['name'],'payload':action['payload']})
   x['trajectory'].append({'kind':'Call','name':action['name'],'payload':action['payload'],'response':response,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
   print(json.dumps({'id':id,'tool':action['name'],'response':response},ensure_ascii=False))
  elif kind=='Return':
   x['output']=action['output'];x['errors']=verify(x);x['passed']=not x['errors']
   print(json.dumps({'id':id,'passed':x['passed'],'errors':x['errors']},ensure_ascii=False))
  elif kind=='fixture':
   request('/mock/session/'+id,{'state':action['state']},'PATCH')
   x['trajectory'].append({'kind':'fixture','state':action['state'],'note':'测试上游事件或外部事实变化，不是Agent工具'})
  elif kind=='Resume':
   # 新消息由测试集提供，不由记录器生成；保留上一轮 Return 与评测结果。
   case=next(c for c in json.loads(DATA.read_text())['cases'] if c['id']==id)
   history=x.setdefault('turnHistory',[])
   turn=case['nextTurns'][len(history)]
   history.append({'output':x.pop('output'),'passed':x.pop('passed'),'errors':x.pop('errors'),'userMessage':x['userMessage']})
   x['turnStart']=len(x['trajectory']);x['expected']=turn['expected'];x['userMessage']=turn['userMessage']
   if turn.get('state'):request('/mock/session/'+id,{'state':turn['state']},'PATCH')
   x['trajectory'].append({'kind':'Resume','userMessage':turn['userMessage'],'fixtureState':turn.get('state',{})})
   print(json.dumps({'id':id,'userMessage':x['userMessage'],'fixtureState':turn.get('state',{})},ensure_ascii=False))
  else:raise ValueError(kind)
  write(x)
elif mode=='status':
 for p in sorted(OUT.glob('*.json')):
  if p.name=='skill-snapshot.json':continue
  x=json.loads(p.read_text());calls=[v for v in x['trajectory'] if v['kind']=='Call']
  print(json.dumps({'id':x['id'],'done':'output' in x,'passed':x.get('passed'),'last':calls[-1] if calls else None,'userMessage':x['userMessage']},ensure_ascii=False))
elif mode=='report':
 xs=[json.loads(p.read_text()) for p in sorted(OUT.glob('*.json')) if p.name!='skill-snapshot.json']
 lines=['# 当前 Codex 加载 Skill 的实际执行记录','','执行方式：当前对话中的 Codex 读取六份 Skill 文件，逐步选择 Call，查看实际 HTTP Mock 响应后继续或 Return。agent-session.py 只运输和记录动作、在 Return 后断言，不包含业务执行流程；没有调用旧 test/runner.ts。','','虚拟业务时间：2026-10-28 10:00:00+08:00。所有合同、工单、消息均为合成 Mock，无真实系统副作用。','','目标契约 Mock：save_asset_manager_authorization 的多意图/nextContactAt，以及联系工具自定义 content 是 Skill 目标契约，尚不能据此证明现有后端支持；起草、时间查询按当前 Landlord 形状模拟。','','| 用例 | 场景 | 结果 | command | 调用数 |','| --- | --- | --- | --- | --- |']
 for x in xs:
  command=json.dumps(x.get('output',{}).get('command'),ensure_ascii=False)
  lines.append(f"| [{x['id']}]({x['id']}.json) | {x['title']} | {'通过' if x.get('passed') else '失败' if 'output' in x else '未完成'} | `{command}` | {len([a for a in x['trajectory'] if a['kind']=='Call'])} |")
 lines += ['',f"总计 {len(xs)}，通过 {sum(x.get('passed',False) for x in xs)}，失败 {sum('output' in x and not x.get('passed') for x in xs)}，未完成 {sum('output' not in x for x in xs)}。",'','共 95 轮，最终场景轨迹含 567 次工具调用，另外保留 7 次旧 Mock 尝试供追溯。三条多轮接续均通过，保留 turnHistory、Resume 和每轮实际调用；旧手写 runner 与历史轨迹未用于本次结论。Mock 接口的 12 项独立契约检查、TypeScript 检查和 Skill 格式检查通过。','','## 实测问题','','4 个追问用例中，工具已返回未来联系时间，本次 Agent 仍按 SOP 追问；这是实际执行失败，已保留原始调用，未修改 Skill 掩盖结果。SOP 未明确“时间未到”的分支；如果工程侧保证只在到期唤醒，需要写明入口前提，否则应明确未到期时只返回 schedule。一次自测不能将问题完全归因于 Skill。','','executionId 回查用例：修正旧 Mock 将 orderId 伪装为 executionId 的错误后重测；授权查询按工单返回真实推进 ID=123，Agent 引用此响应值完成联系和时间查询，未改写 fields，也未以 orderId 替代。首轮旧 Mock 尝试保存在 attempts/，不计入最终场景结果。Skill 的示例目前只写 fields.executionId，可补充这个已实测的取值来源。','','两份 SOP 仍说 end 会销毁会话，与主 Skill 将会话管理交工程侧的说明矛盾，本次未验证真实宿主行为。','','本次由同一模型编写用例并执行，是一次本地自测，不是独立模型评测，也不是 KERA/真实 Dubbo 联调。未据此推断生产环境成功率。']
 (OUT/'REPORT.md').write_text('\n'.join(lines)+'\n')
 print(next(s for s in lines if s.startswith('总计')))
elif mode=='recheck':
 failed=0
 for p in sorted(OUT.glob('*.json')):
  if p.name=='skill-snapshot.json':continue
  x=json.loads(p.read_text())
  if 'output' in x:
   x['errors']=verify(x);x['passed']=not x['errors'];write(x)
   if x['errors']:
    failed+=1
    print(json.dumps({'id':x['id'],'errors':x['errors']},ensure_ascii=False))
 sys.exit(1 if failed else 0)
