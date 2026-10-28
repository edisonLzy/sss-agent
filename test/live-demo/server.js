const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MOCK_URL = process.env.MOCK_URL || 'http://127.0.0.1:18742';
const PORT = Number(process.env.DEMO_PORT) || 8787;

const SKILL_FILES = [
  'skill/SKILL.md',
  'skill/references/first-recruit-termination.md',
  'skill/references/entrusted-termination.md',
  'skill/resources/tool-contracts.md',
  'skill/resources/output-scheme.md',
  'skill/resources/runtime-fields.md',
];

function loadSkillBundle() {
  return SKILL_FILES.map(function (rel) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return '===== ' + rel + ' =====\n' + text;
  }).join('\n\n');
}

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data.json'), 'utf8'));
function findCase(id) {
  return DATA.cases.find(function (c) { return c.id === id; });
}

function buildPrompt(c, opts) {
  opts = opts || {};
  const history = opts.history || [];
  const skillBundle = loadSkillBundle();
  const fieldsJson = JSON.stringify(c.fields, null, 2);
  const userMessage = opts.userMessage;
  const userMsgLine = userMessage
    ? ('业主或资管当前最新消息：' + userMessage)
    : '（本轮没有新消息，直接按运行时字段和 Mock 当前真实状态推进判断）';

  const historyBlock = history.length
    ? ('----- 本工单此前轮次摘要（Mock 会话状态未重置，是前序轮次真实调用遗留下来的状态）-----\n' +
        history.map(function (t, i) {
          return '第 ' + (i + 1) + ' 轮 收到的消息：' + (t.userMessage || '（无新消息）') +
            '\n第 ' + (i + 1) + ' 轮 Return 结果：' + JSON.stringify(t.output);
        }).join('\n\n'))
    : '';

  const resumeNote = history.length
    ? '这是同一个工单的新一轮推进（Resume）。请不要假设之前轮次的结论仍然成立，必须从 Skill 入口重新核验一遍（含前置参数、意图、合同冲突、资管授权等相关读查询），结合上面的历史摘要和下面的最新消息做出本轮判断。'
    : '';

  return [
    '你现在要严格扮演"业主自助解约"（owner-self-termination）Skill 的执行 Agent。' +
      '下面是完整的 Skill 文档（SKILL.md、两份 SOP、三份资源文件），这是你做任何业务判断的唯一依据，禁止凭空编造字段、工具或规则：',
    skillBundle,
    '----- 本次测试用例 -----',
    '用例 ID：' + c.id,
    '用例标题：' + c.title,
    '运行时字段 fields：\n' + fieldsJson,
    historyBlock,
    resumeNote,
    userMsgLine,
    '----- 工具调用方式（必须严格遵守）-----',
    '当前是 Mock 环境，所有工具调用一律通过下面这一种命令发起，不要使用其它任何 curl 参数或命令形式：\n' +
      'curl -s -X POST ' + MOCK_URL + '/mock/session/' + c.id + '/call -H "Content-Type: application/json" -d \'{"name":"<工具名>","payload":{...}}\'',
    [
      '要求：',
      '1）每次 Bash 调用只能包含一条 curl 命令，不要用 && 或换行拼接多条；',
      '2）-d 后面必须是合法、单行、双引号包裹字段名和字符串值的 JSON，字符串内部不要出现英文单引号；',
      '3）工具名和入参字段名必须和 tool-contracts.md 中定义的完全一致，不要编造或修改字段名；',
      '4）严格按 SKILL.md 和对应 SOP 的流程顺序决策，包括前置校验、重试上限、转人工、资管追问等规则；',
      '5）禁止使用 curl 以外的任何 Bash 命令，也禁止访问上面这个 Mock 地址以外的任何网络地址。',
    ].join('\n'),
    '----- 最终输出要求 -----',
    '当你根据 Skill 完成本轮判断、得到 Return 四字段结果后，立刻停止调用任何工具，把最终结果作为你的最后一条消息，' +
      '用且仅用下面这样一个 json 代码块给出，代码块前后不要有其它文字：\n' +
      '```json\n{"command": ..., "nextScheduleAt": ..., "finalAnswer": ..., "reason": "..."}\n```',
  ].filter(Boolean).join('\n\n');
}

function resetMockSession(c) {
  return fetch(MOCK_URL + '/mock/session/' + c.id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: c.scenario, state: c.state || {} }),
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
  });
}

function parseCurlCall(command) {
  const m = command.match(/-d\s+'([\s\S]*)'\s*$/) || command.match(/-d\s+"([\s\S]*)"\s*$/);
  if (!m) return null;
  try {
    const body = JSON.parse(m[1]);
    return { name: body.name, payload: body.payload };
  } catch (e) {
    return null;
  }
}

function extractFinalJson(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const source = fenced ? fenced[1] : text;
  const m = source.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
}

function runAgent(c, opts, send, req, res, onTurnDone) {
  const prompt = buildPrompt(c, opts);
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--allowedTools', 'Bash(curl:*)',
    '--permission-mode', 'dontAsk',
  ];
  const child = spawn('claude', args, { cwd: ROOT });

  const calls = [];
  let lastAssistantText = '';
  let buf = '';
  let closed = false;

  function finish(reason) {
    if (closed) return;
    closed = true;
    const finalOutput = extractFinalJson(lastAssistantText);
    const lastCall = calls.length ? calls[calls.length - 1] : null;
    const draftCalls = calls.filter(function (x) { return x && x.name === 'trigger_auto_termination'; }).length;
    const expected = c.expected || {};
    const check = finalOutput ? {
      commandMatch: finalOutput.command === expected.command,
      lastToolMatch: (lastCall ? lastCall.name : null) === expected.lastTool,
      draftCallsMatch: draftCalls === expected.draftCalls,
    } : null;
    send('final', {
      output: finalOutput,
      rawText: lastAssistantText,
      lastTool: lastCall ? lastCall.name : null,
      draftCalls: draftCalls,
      expected: expected,
      check: check,
      reason: reason,
      turnIndex: opts.turnIndex || 1,
    });
    if (onTurnDone) {
      onTurnDone({ userMessage: opts.userMessage || null, output: finalOutput });
    }
    try { res.end(); } catch (e) { /* 连接已关闭 */ }
  }

  function handleEvent(evt) {
    if (evt.type === 'assistant') {
      const content = (evt.message && evt.message.content) || [];
      content.forEach(function (block) {
        if (block.type === 'thinking' && block.thinking) {
          send('llm_thinking', { text: block.thinking });
        } else if (block.type === 'text' && block.text) {
          lastAssistantText = block.text;
          send('llm_text', { text: block.text });
        } else if (block.type === 'tool_use' && block.name === 'Bash') {
          const command = (block.input && block.input.command) || '';
          const parsed = parseCurlCall(command);
          send('tool_call', { toolUseId: block.id, command: command, parsed: parsed });
          calls.push(parsed);
        }
      });
    } else if (evt.type === 'user') {
      const content = (evt.message && evt.message.content) || [];
      content.forEach(function (block) {
        if (block.type === 'tool_result') {
          let text = block.content;
          if (Array.isArray(text)) text = text.map(function (t) { return t.text || ''; }).join('');
          let parsedResponse = null;
          try { parsedResponse = JSON.parse(text); } catch (e) { /* 非 JSON 文本结果 */ }
          send('tool_result', { toolUseId: block.tool_use_id, text: text, response: parsedResponse, isError: !!block.is_error });
        }
      });
    } else if (evt.type === 'result') {
      send('cost', { totalCostUsd: evt.total_cost_usd, durationApiMs: evt.duration_api_ms });
    } else if (evt.type === 'system' && evt.subtype === 'init') {
      send('status', { phase: 'agent_started', model: evt.model });
    }
  }

  child.stdout.on('data', function (chunk) {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(function (line) {
      line = line.trim();
      if (!line) return;
      let evt;
      try { evt = JSON.parse(line); } catch (e) { return; }
      handleEvent(evt);
    });
  });
  child.stderr.on('data', function (d) {
    send('log', { text: d.toString('utf8') });
  });
  child.on('error', function (err) {
    send('agent_error', { message: '无法启动本机 claude CLI：' + err.message + '（请确认已安装 Claude Code 并可在命令行执行 claude）' });
    finish('spawn_error');
  });
  child.on('close', function (code) {
    finish('closed:' + code);
  });
  req.on('close', function () {
    if (!closed) child.kill('SIGTERM');
  });
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const liveSessions = new Map();

app.get('/api/run/:id', function (req, res) {
  const c = findCase(req.params.id);
  if (!c) {
    res.status(404).json({ error: '未知用例 ID' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  function send(event, data) {
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  }

  const rawMessage = typeof req.query.message === 'string' ? req.query.message.trim() : '';
  const userMessage = rawMessage !== '' ? rawMessage : c.userMessage;

  resetMockSession(c).then(function () {
    liveSessions.set(c.id, { turns: [] });
    send('status', { phase: 'session_ready', note: '已重置 Mock 会话（本工单全新一轮）' });
    runAgent(c, { userMessage: userMessage, history: [], turnIndex: 1 }, send, req, res, function (turnRecord) {
      const sess = liveSessions.get(c.id);
      if (sess) sess.turns.push(turnRecord);
    });
  }).catch(function (err) {
    send('agent_error', { message: 'Mock Server 未就绪或重置会话失败：' + err.message + '（请先在项目根目录执行 PORT=18742 pnpm start）' });
    res.end();
  });
});

app.get('/api/continue/:id', function (req, res) {
  const c = findCase(req.params.id);
  if (!c) {
    res.status(404).json({ error: '未知用例 ID' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  function send(event, data) {
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  }

  const sess = liveSessions.get(c.id);
  const message = typeof req.query.message === 'string' ? req.query.message.trim() : '';

  if (!sess) {
    send('agent_error', { message: '该用例尚未执行过首轮运行，无法继续对话，请先点击"真实运行此用例"。' });
    res.end();
    return;
  }
  if (!message) {
    send('agent_error', { message: '请输入要发送的消息内容后再继续。' });
    res.end();
    return;
  }

  send('status', { phase: 'continue_ready', note: '沿用现有 Mock 会话状态，未重置' });
  runAgent(c, { userMessage: message, history: sess.turns.slice(), turnIndex: sess.turns.length + 1 }, send, req, res, function (turnRecord) {
    sess.turns.push(turnRecord);
  });
});

app.listen(PORT, function () {
  console.log('业主自助解约 Skill 演示服务已启动');
  console.log('访问地址：http://localhost:' + PORT);
  console.log('真实执行依赖 Mock Server：' + MOCK_URL + '（需另外启动 PORT=18742 pnpm start）');
});
