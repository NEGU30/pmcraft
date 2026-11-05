# CHANGELOG

所有显著变更都会记录在此文件中。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.0.1] - 2026-11-05

### Changed

- 首个公开版本 `0.0.1`。
- **CLAUDE.md 瘦身**：路由主文件从 41k 字符压到约 19k；话术模板、状态检测、流程清单模板、调度关系、新会话建议移到 `_shared/reference/` 按需读取，避免超过上下文阈值被截断。
