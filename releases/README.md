# Code-Codex v0.6.20

## 简体中文

累计更新范围：上一公开软件版本 **v0.6.13 → v0.6.20**。[完整源码比较](https://github.com/Rice-dog/code-codex/compare/v0.6.13...v0.6.20)。

- **Unicode 路径安装修复**：快捷方式改用 Windows 原生 Unicode Shell 接口读写，改善中文及其他非 ASCII 用户目录下的安装、升级与恢复（#59）。
- **启动助手修复**：激活助手在构建时预编译，启动时从内存加载，移除用户临时目录中的 C# 动态编译，解决非 ASCII TEMP 路径相关失败来源（#60）。
- **新增光谱点阵帷幕背景**：提供参数面板与默认参数，点击波纹跟随鼠标在帷幕表面的位置；也可在启动动画的插件背景选源中使用。
- **复用背景参数面板**：帷幕与字符背景共用参数控件、分组及重置交互；未变化的插件保留原独立版本和有效缓存。
- **宿主适配维护**：更新实际依赖登记与部分页面、主题能力适配。未知官方变化仍需按检查报告验收。

安装包沿用已在本机构建、安装并核对字节的核心，本次另核对公开插件资源、安装包白名单和 SHA-256；不运行 CI。Unicode 路径的本机检查不等于原报告者全部系统环境均已验收；真实官方冷启动及所有历史升级组合仍有未验证范围。#84 尚未确认为修复，本次不关闭或宣称解决。

## English

Cumulative changes from the previous public software release, **v0.6.13 → v0.6.20**. [Full source comparison](https://github.com/Rice-dog/code-codex/compare/v0.6.13...v0.6.20).

- **Unicode installation paths**: Shortcut reads and writes now use native Windows Unicode Shell interfaces, improving installation, upgrade and restoration in Chinese and other non-ASCII user directories (#59).
- **Startup helper**: The activation helper is compiled at build time and loaded from memory at startup. Removing runtime C# compilation in the user TEMP directory eliminates that source of non-ASCII TEMP failures (#60).
- **Spectral Drape background**: Added a parameter panel and defaults, with click ripples positioned on the drape surface under the pointer. The effect is also available as a plugin background source for startup animation.
- **Shared background parameter panel**: Spectral Drape and ASCII Tiles reuse controls, groups and reset interactions. Unchanged plugins retain their independent versions and valid caches.
- **Host compatibility maintenance**: Updated dependency registrations and selected page/theme capability adapters. Unknown official changes still require acceptance using the compatibility report.

Packages reuse the core already built, installed and byte-checked locally; publication separately verifies public plugin resources, package allowlists and SHA-256, without CI. Local Unicode-path checks do not certify every reporter environment; real official cold startup and all historical upgrade combinations retain unvalidated scope. Issue #84 is not claimed fixed or closed. 
