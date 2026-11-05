# Phase 3.7 机械检查命令（门禁专用）

> 本文件仅在 setup-tests Phase 3.7 产出物验证时加载。
> 与 SKILL.md 中的验证清单配合使用：清单列出检查项，本文件提供对应机械命令。
> **P0-8 trap 复发检查已固化到 `assets/scripts/gate-check.cjs`**（FIXED_TRAPS 列表与合并逻辑以脚本为准，不再内嵌 heredoc——消除 Git Bash 转义失败与 `<< 'EOF'` 占位符字面化两类缺陷）。

## 机械检查命令（MUST 逐条执行）

```bash
# P0-2 networkidle 门禁
grep -r 'networkidle' scripts/*.spec.ts && echo "BLOCKED: networkidle detected" || echo "PASS"

# P0-3 test.fail 门禁（命中后需人工确认每条有实测证据）
grep -r 'test\.fail' scripts/*.spec.ts && echo "CHECK: verify fail evidence exists" || echo "PASS"

# P0-1 选择器来源检查（提取 spec 中的选择器，与 page-map.json 交叉验证）
grep -oE "getBy(Text|Role|Placeholder|Label)\([^)]*\)" scripts/*.spec.ts | sort -u | head -50
# → 每条结果必须能在 page-map.json 的 selector 字段中找到（含 .first()/.nth() 消歧义后缀）

# P0-10 断言弱化检查（弱化表述出现在 spec.ts 中 → BLOCKED）
grep -rE '不断言|不验证|可能为空或非空|结果可能|按线上行为断言' scripts/*.spec.ts scripts/data/*.json 2>/dev/null && echo "BLOCKED: assertion weakening detected" || echo "PASS"

# P0-8 trap 复发检查（固化脚本，见 SKILL.md Phase 3.7）
# 工厂陷阱 FIXED_TRAPS + 用户级/项目级/当次 traps.json 动态合并逻辑已固化到：
#   {本技能源码目录}/assets/scripts/gate-check.cjs
# 执行命令（全量，父 agent Phase 3.7 使用）：
#   node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}"
# → 输出 PASS — 无 trap 复发（共检查 N 条 trap） = 通过
# → 输出 BLOCKED — trap 复发: <JSON> = 阻塞，修复对应 spec 后重新验证
#
# 子 agent 自检（Phase 3.6 步骤 3，生成完本组文件后立即执行）——--files 限定只扫本组 .spec.ts：
#   node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}" --files "TC-B-9.spec.ts,TC-B-10.spec.ts"
#   → 过滤只作用于 .spec.ts；selector-lib.ts 恒扫（父 agent 已生成完毕，无竞态）
#   → BLOCKED → 只修本组文件 → 重跑，至多 3 次（沿用既有上限）；产出汇报中附 PASS 行
#
# 生成包下发（Phase 3.6 步骤 2）——--emitTraps 打印合并去重后的 traps JSON 后 exit 0（不扫描）：
#   node "{本技能源码目录}/assets/scripts/gate-check.cjs" --tsDir "$PRJ/$VER/e2e/{ts}" --emitTraps
#   → 输出经 JSON.parse 校验（生成包拼接用）；合并逻辑单一权威来源（与扫描共用）
```

**判定**：任何检查输出 BLOCKED → 修复对应文件后重新验证。最大重试 3 次（见 SKILL.md Phase 3.7）。
