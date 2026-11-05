# Playwright 浏览器验证规范（跨技能通用）

> 供 build-prototype / extract-design / review-ux / set-style 等使用 `mcp__playwright__browser_evaluate` 做运行时验证时参考。
> 核心原则：**能分步就分步，能同步就同步；evaluate 里的异步必须用 async IIFE，禁止 setTimeout + 外部 resolve 拼接。**

## 一、验证方式优先级

| 优先级 | 方式 | 适用场景 |
|:---|:---|:---|
| 1（首选） | `browser_click` + `browser_snapshot` / `browser_wait_for` 分步验证 | 单步交互（点击按钮、打开弹窗、验证跳转） |
| 2 | `browser_evaluate` **同步表达式**（直接 return 对象） | 读取元素状态、计算样式、属性检查 |
| 3 | `browser_evaluate` **异步 async IIFE**（配 sleep helper） | 需等待异步完成（loading 结束、toast 出现、setTimeout 分支） |
| 4（避免） | 嵌套 setTimeout + Promise 拼接 | ❌ 不要用 |

## 二、标准模板

### 同步读取（优先级 2）

```js
() => {
  const r = {};
  r.btnText = document.getElementById('btnOneClick').textContent;
  r.modalShown = document.getElementById('verifyMask').classList.contains('show');
  r.weight = getComputedStyle(document.getElementById('agreeError')).fontWeight;
  return r;
}
```

### 异步验证（优先级 3，正确写法）

```js
() => (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const r = {};
  // 触发异步操作
  window.verifySubmit();
  await sleep(900);          // 等待异步分支完成（如 800ms 的 setTimeout）
  r.unbindShown = document.getElementById('unbindPanel').classList.contains('show');
  r.btnText = document.getElementById('btnVerify').textContent;
  return r;
})()
```

关键点：
- **外层 `() => (async () => {...})()`** —— async IIFE，Playwright 自动 await 返回的 Promise
- **`sleep` helper** 用 `new Promise(resolve => setTimeout(resolve, ms))` —— resolve 在 executor 内定义，天然合法
- **`return r` 放在 async 函数最外层** —— 不要放在 setTimeout 回调里

## 三、禁止模式（易错点）

| # | 错误写法 | 问题 |
|:---|:---|:---|
| 1 | `setTimeout(() => { return resolve(results); }, 900); return new Promise(r => { window.__resolveUX = r; })` | `resolve` 未定义（setTimeout 回调里引用外部不存在的变量）；`window.__xxx` 全局残留 |
| 2 | `return new Promise(r => { window.__resolve = r; })` 单独一行，无 executor 内的 resolve 调用 | Promise 永不 resolve，Playwright 挂起 |
| 3 | `setTimeout(() => { ...; resolve(x); })`（resolve 来自 Promise executor 但作用域丢失） | resolve 不在 executor 闭包内，未定义 |
| 4 | 在 evaluate 里 `location.reload()` 后再继续 | 页面导航销毁执行上下文，后续代码全部失效 |
| 5 | 一个 evaluate 里堆 3+ 层嵌套 setTimeout | 难以调试、时序不可控，拆成多次 evaluate 或 async/await |

**通用规则**：
- `resolve` / `reject` 只在 `new Promise` executor 参数内使用，不得在 setTimeout 回调里调用外部 resolve
- 不用 `window.__xxx` 存临时状态（页面刷新即丢，且污染全局）
- 需要等待就用 `sleep` + `await`，不嵌套 setTimeout
- 页面导航（reload / goto）后必须重新获取元素引用，旧引用已失效

## 四、常见场景示例

### 等待 loading 完成

```js
() => (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  document.getElementById('btnOneClick').click();
  const r = {};
  r.loadingStarted = document.getElementById('btnOneClick').classList.contains('loading');
  await sleep(5200);   // 等待 5s 取号完成
  r.loadingEnded = !document.getElementById('btnOneClick').classList.contains('loading');
  return r;
})()
```

### 验证 toast 出现

```js
() => (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  window.showToast('测试', true);
  await sleep(300);
  const t = document.getElementById('toast');
  const r = {
    shown: t.classList.contains('show'),
    text: t.textContent,
    success: t.classList.contains('success')
  };
  return r;
})()
```

### 多分支状态验证（逐个触发 + 等待）

```js
() => (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const r = {};
  // 分支 1：验证不通过 → 二次确认出现
  window.openVerify();
  document.getElementById('verifyCode').value = '9999';
  window.verifySubmit();
  await sleep(900);
  r.confirmShown = document.getElementById('unbindConfirm').classList.contains('show');
  // 分支 2：确认解绑 → 弹窗关闭
  window.confirmUnbind();
  await sleep(300);
  r.maskClosed = !document.getElementById('verifyMask').classList.contains('show');
  return r;
})()
```

## 五、验证结果判断

- 验证结果必须**基于实测值**，不得凭代码逻辑推断（"代码里写了所以应该有效"不可靠——样式覆盖、时序、DOM 状态都可能导致实际行为与预期不符）
- 发现异常时先刷新页面排除旧状态残留（evaluate 内禁 reload，用 `browser_navigate` 重开页面），再复测
- 每个验证项给 pass/fail 结论，fail 项附实测值
