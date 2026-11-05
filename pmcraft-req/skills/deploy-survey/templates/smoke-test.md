# 问卷部署冒烟测试规格

## 概览

部署后自动执行两层测试，全部通过才输出确认给 PM：

| 层级 | 测试编号 | 手段 | 覆盖范围 |
|:---|:---:|:---|---:|
| 7a API 冒烟 | T1-T7 | curl + node | 后端接口（HTTP、提交、校验、密码、数据回显） |
| 7a API 深度 | T14-T16 | curl + node | 数据内容完整性、isOther 路径、字段拒绝验证 |
| 7b 前端渲染 | T8-T13 | Playwright MCP | 前端渲染、交互流程、管理后台 |
| 7b 后台纵深 | T17 | Playwright MCP | 管理后台设置保存与持久化 |

## 数据约定

- 测试工号：`00000`（T3 提交 / T4 复用做重复拦截 / T14 回验）
- 测试昵称：`_test_runner_`（T3 提交）
- 重复检测试工号：`88888`（T10 重复阻断）
- 必填字段缺失测试：T16 提交不带 `empId`（内部问卷身份必填字段缺失应被 400 `invalid empId` 拒绝；不用既有工号，避免重复拦截分支抢先返回造成误判）
- isOther 测试工号：`99999`（T15 附加文本提交）
- 设置持久化测试工号：`66666`（T17 后台设置管理）
- 7a 测试后清理数据；7b 前置提交重复记录，测试后清理

---

## 7a. API 冒烟测试（后端 + 接口层）

```bash
PORT={端口}

# ——— T1: 首页可达 ———
T1=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/)
# 预期：200
# 失败原因：服务未启动、端口错误、模板文件缺失

# ——— T2: survey.json API 正常 ———
T2=$(curl -s http://localhost:$PORT/api/survey.json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const s=JSON.parse(d);console.log(s.boards?s.boards.length:'0')}catch(e){console.log('0')}})")
# 预期：> 0（有板块）
# 失败原因：survey.json 未正确部署或格式错误

# ——— T3: 完整提交（覆盖 all 题型） ———
T3=$(curl -s -X POST http://localhost:$PORT/api/submit \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"_test_runner_","empId":"00000","completed":true,"answers":{
    "Q3":"A","Q4":["A","B"],"Q5":4,"Q6":9,"Q7":6,
    "Q9":{"界面美观度":4,"操作便捷性":5,"功能完整性":3,"运行稳定性":4,"响应速度":5},
    "Q10":"A","Q11":["A","B"],"Q13":"auto test"
  },"attention":{"value":7,"passed":true},"meta":{"durationSec":5}}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok?'true':'false')}catch(e){console.log('false')}})")
# 预期：true

# ——— T4: 重复提交拦截 ———
T4=$(curl -s -X POST http://localhost:$PORT/api/submit \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"_test_runner_","empId":"00000","completed":true,"answers":{"Q3":"A"},"meta":{"durationSec":1}}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const r=JSON.parse(d);console.log(r.error==='duplicate submission'?'true':'false')}catch(e){console.log('false')}})")
# 预期：true（返回 duplicate submission）

# ——— T5: 工号格式校验（非法格式应拒绝） ———
T5=$(curl -s -X POST http://localhost:$PORT/api/submit \
  -H 'Content-Type: application/json' \
  -d '{"empId":"abc","completed":true,"answers":{}}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok===false?'true':'false')}catch(e){console.log('false')}})")
# 预期：true（被拒绝，ok===false）

# ——— T6: 管理后台密码验证 ———
T6=$(curl -s -X POST http://localhost:$PORT/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"{adminPassword}"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok?'true':'false')}catch(e){console.log('false')}})")
# 预期：true

# ——— T7: 数据回显 ———
T7=$(curl -s http://localhost:$PORT/api/responses.json \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const a=JSON.parse(d);console.log(a.some(r=>r.empId==='00000')?'true':'false')}catch(e){console.log('false')}})")
# 预期：true

# ——— 清理 ———
curl -s -X POST http://localhost:$PORT/api/clear > /dev/null

# ——— T14: 数据内容完整性验证 ———
# 先提交一份带确定值的答卷
curl -s -X POST http://localhost:$PORT/api/submit \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"_test_runner_","empId":"00000","completed":true,"answers":{
    "Q3":"A","Q4":["A","B"],"Q5":4,"Q6":9,"Q7":6,
    "Q9":{"界面美观度":4,"操作便捷性":5,"功能完整性":3,"运行稳定性":4,"响应速度":5},
    "Q10":"A","Q11":["A","B"],"Q13":"auto test"
  },"attention":{"value":7,"passed":true},"meta":{"durationSec":5}}' > /dev/null
# 回读并校验每个字段
T14=$(curl -s http://localhost:$PORT/api/responses.json \
  | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
try{
  const a=JSON.parse(d);
  const r=a.find(x=>x.empId==='00000');
  if(!r){console.log('false:no record');return;}
  const chk = (path,expect) => {
    const parts=path.split('.');
    let v=r; for(const p of parts){if(v==null){console.log('false:path '+path);return false;} v=v[p];}
    if(JSON.stringify(v)!==JSON.stringify(expect)){console.log('false:path '+path+' got '+JSON.stringify(v)+' expect '+JSON.stringify(expect));return false;}
    return true;
  };
  const checks=[
    ['answers.Q3','A'],
    ['answers.Q4',['A','B']],
    ['answers.Q5',4],
    ['answers.Q6',9],
    ['answers.Q7',6],
    ['answers.Q9.界面美观度',4],
    ['answers.Q9.响应速度',5],
    ['answers.Q13','auto test'],
    ['attention.value',7],
    ['attention.passed',true],
    ['empId','00000'],
    ['nickname','_test_runner_'],
    ['completed',true],
  ];
  for(const [path,expect] of checks){if(!chk(path,expect))return;}
  console.log('true');
}catch(e){console.log('false:'+e.message)}
})")
# 预期：true（所有字段值逐一匹配）

# ——— T15: 「其他」附加文本提交与回显 ———
T15=$(curl -s -X POST http://localhost:$PORT/api/submit \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"other_user","empId":"99999","completed":true,"answers":{"Q3":"B","Q4":["F"],"Q4_other":"用来自动化测试","Q10":"E","Q10_other":"其他测试方向"}}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok?'true':'false')}catch(e){console.log('false')}})")
# 预期：true
# 回读验证附加文本
T15b=$(curl -s http://localhost:$PORT/api/responses.json \
  | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
try{
  const a=JSON.parse(d);
  const r=a.find(x=>x.empId==='99999');
  if(!r){console.log('false:no record');return;}
  if(r.answers.Q4_other!=='用来自动化测试'){console.log('false:Q4_other');return;}
  if(r.answers.Q10_other!=='其他测试方向'){console.log('false:Q10_other');return;}
  console.log('true');
}catch(e){console.log('false:'+e.message)}
})")
# 预期：true

# ——— T16: 必填字段缺失拒绝（不带 empId 提交，服务端必填校验应 400 拒绝） ———
T16=$(curl -s -X POST http://localhost:$PORT/api/submit \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"no_empid_user","completed":true,"answers":{"Q3":"A"}}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok===false?'true':'false')}catch(e){console.log('false')}})")
# 预期：true（empId 缺失 → 400 invalid empId → ok===false）

# ——— 深度清理 ———
curl -s -X POST http://localhost:$PORT/api/clear > /dev/null
```

### API 判定规则

| 用例 | 检查项 | 预期 | 失败影响 |
|:---|:---|:---:|:---|
| T1 | 首页 HTTP 200 | `200` | ❌ 核心链路，阻断部署 |
| T2 | survey.json 返回板块数 | `> 0` | ❌ 核心链路，阻断部署 |
| T3 | 完整提交成功 | `true` | ❌ 核心链路，阻断部署 |
| T4 | 重复提交拦截 | `true` | ⚠ 需检查 allowMulti 设置 |
| T5 | 工号格式校验 | `true` | ⚠ 需检查 empId 正则 |
| T6 | 管理员密码验证 | `true` | ❌ 管理后台不可用，阻断部署 |
| T7 | 数据回显 | `true` | ⚠ 可能数据写入/读取异常 |
| T14 | 数据内容完整性（逐个字段比对） | `true` | ⚠ 数据写入字段错位或精度丢失 |
| T15 | isOther 附加文本提交+回显 | `true` + `true` | ⚠ isOther 额外文本丢失 |
| T16 | 必填字段缺失拒绝（缺 empId 提交应 400 拒绝） | `true` | ⚠ 服务端缺少必填校验 |

- **T1-T3、T6 任一失败** → 停止部署，诊断修复后重新部署
- **T4、T5、T7、T14、T15、T16 失败** → 修复后继续，但输出确认中标注 warning

---

## 7b. 前端渲染测试（Playwright 浏览器层）

### 前置条件

- 7a 已执行完毕且数据已清理（无残留记录）
- 浏览器视口已设为 `1280×800`（调用 `browser_resize`）

### T8：首页封面渲染

工具链：`browser_navigate` → `browser_console_messages` → `browser_snapshot` → `browser_take_screenshot`

1. `browser_navigate` → `http://localhost:{端口}/`
2. `browser_console_messages(level: "error")` → 检查无 JS 错误
3. `browser_snapshot` → 验证快照中包含问卷标题、引导语、以及"开始填写"按钮（`#btnStart`）
4. `browser_take_screenshot(type: "png")` — 截图自动保存到 Playwright 输出目录，与 `.playwright-mcp/` 快照同级，不污染项目结构

**预期**：封面完整渲染，标题、引导语、"开始填写"按钮可见，控制台无 error 级消息。
**渲染完整性检查**：`browser_evaluate("() => document.body.innerText.includes('[object Object]')")` → 返回 `false`。

### T9：身份信息板块 + 题型渲染

工具链：`browser_click` → `browser_snapshot` → `browser_type` → `browser_take_screenshot`

1. 点击"开始填写"按钮（target: `#btnStart`）
2. `browser_snapshot` → 验证进入身份板块，包含：
   - 昵称输入框（`data-text="nickname"`）
   - 工号输入框（`data-text="empId"`）
   - 板块标题
3. `browser_type` → 昵称输入 `测试用户`（target: `input[data-text="nickname"]`）
4. `browser_type` → 工号输入 `88888`（target: `input[data-text="empId"]`）
5. `browser_take_screenshot(type: "png")`

**预期**：两个文本输入框正常渲染，输入内容可见。

### T10：重复提交前端阻断

工具链：`curl`（预提交）→ `browser_click` → `browser_snapshot` → `browser_take_screenshot`

1. 先通过 API 预提交一个重复记录：
   ```bash
   curl -s -X POST http://localhost:$PORT/api/submit \
     -H 'Content-Type: application/json' \
     -d '{"nickname":"dup_user","empId":"88888","completed":true,"answers":{"Q3":"A"},"meta":{"durationSec":1}}'
   ```
2. 浏览器中点击 `#btnNext`（"下一步"）
3. `browser_snapshot` → 验证 `errBanner` 显示"已经提交过"文案
4. `browser_take_screenshot(type: "png")`
5. 将工号改为 `77777`（清空错误提示后继续）

**预期**：errBanner 出现，文案正确。

### T11：全题型交互流程

身份信息通过后，依次通过各板块。每个板块操作完成后点击 `#btnNext` 进入下一板块，并用 `browser_snapshot` 验证渲染。

| 板块 | 题型 | 操作 |
|:---|:---|:---|
| 使用习惯（Q3-Q4） | single + multi | 点 `.opt[data-qid="Q3"][data-val="A"]`，点 `.opt[data-qid="Q4"][data-val="A"]` 和 `.opt[data-qid="Q4"][data-val="B"]` |
| 满意度与评价（Q5-Q9） | likert5 + scale + likert7 + ATT + matrix | 点 `button[data-likert="Q5"][data-val="4"]`，点 `button[data-scale="Q6"][data-val="9"]`，点 `button[data-likert="Q7"][data-val="6"]`，点 `button[data-scale="ATT"][data-val="7"]`，matrix 逐行操作（见下方） |
| 功能需求（Q10-Q11） | single + multi | 点 `.opt[data-qid="Q10"][data-val="A"]`，点 `.opt[data-qid="Q11"][data-val="A"]` |
| 开放建议（Q12-Q13） | textarea | 在 `textarea[data-text="Q13"]` 输入一段建议文字 |

**Matrix 逐行操作**（`data-matrix="Q9"` + `data-row="行名"` + `data-col="列值"`）：

```
button[data-matrix="Q9"][data-row="界面美观度"][data-col="4"]
button[data-matrix="Q9"][data-row="操作便捷性"][data-col="5"]
button[data-matrix="Q9"][data-row="功能完整性"][data-col="3"]
button[data-matrix="Q9"][data-row="运行稳定性"][data-col="4"]
button[data-matrix="Q9"][data-row="响应速度"][data-col="5"]
```

**Rank 排序题回归点**（若当前问卷含 `type:"rank"` 的题，如 `[data-qid="Q13"]`，按下述逐项验证；问卷无 rank 题则跳过本小节，不判 FAIL）：

1. 在上一题（被 `filterBy` 引用的 multi 题）只勾 1 项 → rank 题仅渲染该 1 项可排，其余选项不出现
2. 点击未排选项 → 依序入列，选项上出现 ①②③ 序号徽标，顺序与点击顺序一致
3. 已排项数达 `q.max` 后点击第 `max+1` 项 → 不生效（无新序号），提示显示「已达上限」
4. 点击已排选项（或其「撤」按钮）→ 移除该项，其余已排项序号自动前移重排
5. 已排数 < `q.min`（或未排任何项）时点击「下一步」→ 校验拦截：该题标红、errBanner 出现
6. 排满 `min` 后「下一步」→ 通过，正常进入下一板块；提交后答卷中该题答案为有序数组（如 `["K","A","C"]`）

**关键截图点**（`browser_take_screenshot`）：
- 使用习惯板块截图（single + multi 渲染情况）
- 满意度板块截图（likert + scale + ATT + matrix 渲染情况）
- 开放建议板块截图（textarea 渲染情况）
- 注：不传 `filename`，使用默认命名，截图保存在 Playwright 输出目录

**渲染完整性检查**：每次进入新板块后、点击"下一步"之前，用 `browser_evaluate` 检查 DOM 中 **不存在** `[object Object]` 文本：

```bash
# 检查整个页面 DOM 中是否有 [object Object] 渲染异常
browser_evaluate(function: "() => document.body.innerText.includes('[object Object]')")
```
**预期**：返回 `false`（不存在 `[object Object]`）。返回 `true` 则表示有渲染异常，标记 T11 为 FAIL。

> 此检查不仅针对 matrix 表头，也覆盖任何题型渲染时可能出现的对象字面量泄漏（如 `cols`/`rows`/`labels` 传错格式）。

### T12：完整提交流程

工具链：`browser_click` → `browser_snapshot` → `browser_take_screenshot` → `browser_console_messages`

1. 在最后一页点击 `#btnNext`（按钮文字为"提交问卷"）
2. 等待提交完成
3. `browser_snapshot` → 验证进入完成页，显示感谢文案
4. `browser_take_screenshot(type: "png")`
5. `browser_console_messages(level: "error")` → 检查提交过程中无 JS 错误

### T13：管理后台渲染

工具链：`browser_navigate` → `browser_snapshot` → `browser_type` → `browser_click` → `browser_console_messages` → `browser_take_screenshot`

1. `browser_navigate` → `http://localhost:{端口}/admin`
2. `browser_snapshot` → 验证显示密码输入框（`#loginPw`）
3. `browser_type` → 输入管理员密码（target: `#loginPw`）
4. `browser_click` → 点击登录按钮
5. 等待仪表盘渲染
6. `browser_snapshot` → 验证概览卡数据出现（总回收数、有效完成等卡片）
7. `browser_console_messages(level: "error")` → 检查无 JS 错误
8. **渲染完整性检查**：`browser_evaluate("() => document.body.innerText.includes('[object Object]')")` → 返回 `false`
9. `browser_take_screenshot(type: "png")`

### T17：管理后台设置保存与持久化

工具链：`browser_click` → `browser_snapshot` → `browser_evaluate` → `browser_take_screenshot`

> T17 需要 T3 提交数据在系统中用于验证（T3 提交完成后，数据随 7a 清理被清除，因此 T17 需先提交一份测试数据再验证后台设置）。

1. 先通过 API 提交一份测试数据（用于验证设置保存后数据展示仍然正常）：
   ```bash
   curl -s -X POST http://localhost:$PORT/api/submit \
     -H 'Content-Type: application/json' \
     -d '{"nickname":"settings_test","empId":"66666","completed":true,"answers":{"Q3":"A","Q4":["A"]},"meta":{"durationSec":1}}'
   ```
2. `browser_navigate` → `http://localhost:{端口}/admin`
3. `browser_type` → 输入管理员密码（target: `#loginPw`）
4. `browser_click` → 点击登录按钮
5. 等待仪表盘渲染
6. `browser_snapshot` → 验证概览卡数据出现（总回收数 ≥ 1）
7. 勾选"允许重复提交"复选框
8. `browser_click` → 点击"保存设置"按钮
9. 等待保存完成
10. `browser_navigate` → 刷新页面（`http://localhost:{端口}/admin`）
11. 重新登录，检查设置是否持久化（复选框仍为勾选状态）
12. 取消勾选"允许重复提交"，再次保存恢复默认
13. `browser_console_messages(level: "error")` → 检查无 JS 错误
14. `browser_take_screenshot(type: "png")`

**预期**：设置保存后页面刷新能被持久化保留，无 JS 错误。

### 前端判定规则

| 用例 | 检查项 | 预期 | 失败影响 |
|:---|:---|:---:|:---|
| T8 | 封面渲染无 JS 错误 + 无渲染异常 | error 数为 0 + `[object Object]` 检查返回 `false` | ❌ 核心链路，阻断部署 |
| T9 | 身份板块渲染 + 输入可交互 | snapshot 含 nickname/empId 输入框 | ❌ 核心链路，阻断部署 |
| T10 | 重复提交前端阻断 | errBanner 显示"已经提交过"文案 | ⚠ 前端重复提交逻辑异常 |
| T11 | 各题型逐一交互，无渲染异常（`[object Object]` 等） | 每板块可正常跳转 + `browser_evaluate` 返回 `false` | ❌ 核心链路，阻断部署 |
| T12 | 完整提交 → 成功页 | snapshot 显示感谢文案 + 无 error | ❌ 核心链路，阻断部署 |
| T13 | 管理后台登录 + 数据展示 + 无渲染异常 | 登录成功、概览卡片数据可见、`[object Object]` 检查返回 `false` | ❌ 管理后台不可用，阻断部署 |
| T17 | 管理后台设置保存与持久化 | 设置保存后刷新页面依然保持 | ⚠ 设置持久化异常 |

- **T8、T9、T11、T12、T13 任一失败** → 停止部署，诊断修复后重新部署
- **T10、T17 失败** → 修复后继续，但输出确认中标注 warning

### 7b 清理

```bash
browser_close
curl -s -X POST http://localhost:$PORT/api/clear > /dev/null
```

---

## 可测性说明（Testability Notes）

执行测试时需注意以下几点，避免把正常行为误判为缺陷：

### 管理后台题型统计（数据驱动）

admin.html 后台统计已改为**数据驱动**：题目元信息取自 `adminQdef`，选项/矩阵行列由 `boards` 补齐（admin.html:168-182），渲染时按题型走专用分支（admin.html:264-271）。各题型的后台统计现状如下：

| 题型 | 后台统计状态 | 备注 |
|:---|:---:|:---|
| text | ✅ 正常 | 开放题列表 |
| textarea | ✅ 正常 | 开放题列表 |
| likert5/likert7 | ✅ 正常 | 带标签分布 |
| scale（ATT、NPS） | ✅ 正常 | 0–10 量表条形；`nps:true` 时附 NPS 备注 |
| single | ✅ 正常 | 选项分布条形图 |
| multi | ✅ 正常 | 选项分布条形图 |
| matrix | ✅ 正常 | 行×列计数表 |
| rank | ✅ 正常 | 排序加权条形（Top1=3/Top2=2/Top3=1） |

`⚠ 未知题型（xxx），暂无法统计分布。` 只是**兜底**：当某题既不是矩阵/量表/开放题/李克特/排序题，又取不到选项定义（`adminQdef` 无 `opts`、`boards` 中也无该题选项，且非 skills 题）时才出现（admin.html:290-291）。正常配置下（题目已登记 `adminQdef`、选项在 `boards` 内）不会出现该提示——**T13 看到上述常规图表即为预期通过，不得计为缺陷**；仅当真的出现「未知题型」时，才需排查该题是否漏登记 `adminQdef`（`.gen_survey.js` 第 4g 条会对漏登记给出 warn）。

### 分层对比表（数据驱动）

T13 中可能看到的 `按XX分层 · 各产品 NPS` 表**不是写死的演示 demo**，而是数据驱动：仅当 survey.json 顶层配置了 `segmentBy:{"id":...,"label":...}` 时才渲染（admin.html:159、169、274）；分组标签取 `segmentBy.id` 所指题目的选项文案，列按 `adminQdef` 中带 `"nps": true` 的量表题生成（admin.html:403-423）。未配置 `segmentBy`、或没有任何 `nps` 标记题时，该表不出现。

因此：T13 看到该表 → 说明问卷配置了 `segmentBy`，属预期；看不到该表 → 也不代表缺陷，取决于问卷配置。均不构成管理后台异常。

### 测试数据冲突

T3 和 T14 先后使用相同工号 `00000`，中间的清理确保无冲突。T15（`99999`）和 T17（`66666`）使用独立工号，互不干扰。

---

## 汇总输出模板

测试全部完成后，按以下格式打印：

```text
══════════════════════════════════════════
  自动化测试结果
══════════════════════════════════════════
  【API 冒烟】
  T1 首页可达 ......... {T1}  ✅
  T2 survey.json ...... {T2}个板块  ✅
  T3 完整提交 ......... {T3}  ✅
  T4 重复拦截 ......... {T4}  ✅
  T5 工号校验 ....... {T5}  ✅
  T6 管理员登录 ....... {T6}  ✅
  T7 数据回显 ......... {T7}  ✅
  T14 数据完整性 ...... {T14}  ✅
  T15 isOther 文本 .... {T15}/{T15b}  ✅
  T16 必填拒绝 ........ {T16}  ✅
  ──────────────────────────────────────
  【前端渲染】
  T8 封面渲染 ......... ✅  errors: {N}
  T9 身份信息板 ....... ✅
  T10 重复阻断 ........ ✅
  T11 全题型流程 ...... ✅
  T12 提交结果页 ...... ✅  errors: {N}
  T13 管理后台 ........ ✅  errors: {N}
  T17 设置持久化 ...... ✅  errors: {N}
  ──────────────────────────────────────
  全部通过，继续输出部署确认。
══════════════════════════════════════════
```
