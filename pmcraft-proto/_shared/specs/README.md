# 权威设计规范

此目录存放跨版本共享的**权威设计规范文件**。这些是设计师/品牌团队产出的"应然"规则，优先级高于从已有实现反推的全局基准（`pmcraft/baseline/`）。

**空则静默跳过**：如果此目录为空，各下游技能不受任何影响。

## 推荐文件

| 文件 | 用途 | 示例内容 |
|------|------|---------|
| `brand-guide.md` | 品牌色板、字体、Logo 使用规则 | 品牌色 #1a1a2e、主字体 Inter 400/600/700、Logo 最小尺寸 48px |
| `component-spec.md` | 组件设计规范 | 按钮圆角 8px、卡片阴影 0 2px 8px rgba(0,0,0,0.08)、输入框边框 1px solid #e0e0e0 |
| `motion-guide.md` | 动效时长与缓动标准 | 微交互 150ms ease-out、页面切换 300ms ease-in-out、hover 100ms |
| `accessibility-standards.md` | 对比度、焦点指示器、屏幕阅读器标准 | 文本对比度 ≥4.5:1、焦点环 2px #0066cc、所有图片需 alt 文本 |
| `assets/` | 设计师切的图、Logo、图标等资源文件 | logo.svg、empty-state.png、icon-sprite.svg |

## 优先级

```
PM 版本覆盖 > specs（ground truth）> baseline（快照兜底）
```

specs 有值的字段，baseline 中同字段**必须对齐**。specs 无值的字段由 baseline 兜底。

## 使用方式

1. PM 或设计师将规范文件（markdown 格式）、切图资源直接放入此目录
2. `initialize-structure` 创建新版本时会静默复制整个 specs/ 到版本 `prototype/specs/`
3. `set-style` 生成设计系统时以 specs 数据优先
4. `build-prototype` 生成原型时逐条对照 specs 中的约束
