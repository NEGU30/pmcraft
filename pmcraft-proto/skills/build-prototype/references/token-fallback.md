# CSS 变量回退规则

种子模板和布局骨架引用 `design-system.css` 中 `:root` 块的 CSS 变量。
当 `design-system.css` 缺少某个变量时，按以下规则回退。

| 缺失变量 | 回退策略 |
|----------|---------|
| `--color-background` | **无回退** — 必须存在。缺失时停止生成并提示 PM 检查 design-system.css。 |
| `--color-surface` | **无回退** — 必须存在。 |
| `--color-text` | **无回退** — 必须存在。 |
| `--color-text-secondary` | `color: var(--color-text); opacity: 0.65;` |
| `--color-border` | **无回退** — 必须存在。 |
| `--color-primary` | **无回退** — 必须存在。 |
| `--color-danger` | `#dc2626` （硬回退值，同时记录日志） |
| `--color-success` | `#16a34a` |
| `--color-warning` | `#d97706` |
| `--color-accent` | 回退到 `var(--color-primary)` |
| `--color-card` | 回退到 `var(--color-surface)` |
| `--color-border-strong` | 回退到 `var(--color-border)` |
| `--font-heading` | 回退到 `var(--font-body)` |
| `--font-body` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` |
| `--font-mono` | `ui-monospace, 'SF Mono', Menlo, monospace` |
| `--space-sm` | `8px` |
| `--space-md` | `16px` |
| `--space-lg` | `24px` |
| `--space-xl` | `32px` |
| `--space-xxl` | `48px` |
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `8px` |
| `--shadow-sm` | `none` |
| `--shadow-md` | `none` |
| `--shadow-lg` | `none` |
| `--shadow-xxl` | `none` |
| `--container-max` | `1120px` |

**表未覆盖的变量**：默认回退到 `var(--color-text)`（SKILL.md 第八步页面生成规则 3 已声明；注意五个"必须存在"变量 `--color-background` / `--color-surface` / `--color-text` / `--color-border` / `--color-primary` 无回退，缺失时停止生成并提示 PM 检查 design-system.css）。

**记录要求**：每次使用回退值时，在 build-prototype 日志中记录 `"变量 {名称} 缺失，已使用回退值 {值}"`。
