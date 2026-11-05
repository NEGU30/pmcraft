# 登录态提取代码片段（Phase 4 使用）

> **FALLBACK REFERENCE**: 本文档为 AI 兜底构建参考（对应固化脚本：`assets/scripts/jwt-ttl.cjs`；URL 校验并入 `assets/scripts/smoke.cjs`，node 层校验无 shell 注入面）。
> 使用原则：**固化脚本优先**，脚本缺失时按本模板自行构建同构实现。与固化脚本的差异点已逐节标注。

## 1. URL 校验（MUST 在构造含 {target_url} 的 Bash 命令前执行）

防止 shell 注入（{target_url} 来自用户输入）：

```js
// ⚡ 输入校验：防止 shell 注入（{target_url} 来自用户输入）
// ⚠️ 与 smoke.cjs 的 validateUrl 功能等价，区别在命名（validateUrlForShell 强调 shell 安全上下文）。两端必须同步更新。
function validateUrlForShell(url) {
  if (typeof url !== 'string') throw new Error('URL must be a string');
  // 1. 必须 http:// / https:// / file:// 开头（file:// 供 static_html 场景，与 smoke.cjs 一致）
  if (!/^https?:\/\//.test(url) && !/^file:\/\//.test(url)) throw new Error('URL must start with http://, https:// or file://');
  // 2. 禁止换行/回车（可绕过单引号转义）
  if (/[\n\r]/.test(url)) throw new Error('URL contains forbidden shell metacharacters');
  // 3. 允许的字符集：字母数字、URL 安全字符、IPv4/IPv6、端口
  // ⚠️ 字符集显式排除单引号 '（RFC 3986 sub-delims 之一，但本函数结果会嵌入
  //    单引号包裹的 shell 命令（curl 探测），URL 含 ' 将逃逸引号边界导致命令注入）
  const charset = /^https?:\/\//.test(url)
    ? /^https?:\/\/[a-zA-Z0-9._~:/?#\[\]@!$&()*+,;=%-]+$/
    : /^file:\/\/[a-zA-Z0-9._~:/?#\[\]@!$&()*+,;=%-\\ ]+$/;
  if (!charset.test(url)) throw new Error('URL contains invalid characters');
  return url;
}
// local_server 自动构造（无需用户输入）：
//   const target_url = `http://localhost:${port}`;  // port ∈ [1024, 65535] 且为整数
// remote_server 用户输入：
//   const safeUrl = validateUrlForShell(userInputUrl);
//   Bash: `curl -s -o /dev/null -w "%{http_code}" '${safeUrl}'`  // 单引号转义，safeUrl 已通过校验
```

## 2. storageState 提取（Phase 4.4 步骤 1）

通过 MCP 在已登录的浏览器 page 实例上提取 storage state（唯一权威方式，捕获含 httpOnly 的全部 cookie）：

```
browser_run_code_unsafe: async (p) => JSON.stringify(await p.context().storageState())
```

## 3. JWT TTL 解析（Phase 4.4 步骤 5）

从 storage.json 解析 JWT cookie 的 exp，写入 run_state.json 的 tokenExpiresAt。
**固化实现**：`node "{本技能源码目录}/assets/scripts/jwt-ttl.cjs" --storagePath <path>`（输出 `{"exp":...,"expiresAt":"ISO"}` 或 `{"tokenExpiresAt":null}`）。

**若脚本缺失**，内联等效逻辑（JWT 值经 Node fs 读取，不经 shell 字符串拼接）：
`fs.readFileSync(storagePath)` → `storage.cookies.find(c => c.name === 'ims_token')` → 非 JWT（无 `.` 分段）→ 输出 `{tokenExpiresAt:null}` → `Buffer.from(value.split('.')[1], 'base64')` → `JSON.parse` → 取 `exp` → `new Date(exp * 1000).toISOString()`。
