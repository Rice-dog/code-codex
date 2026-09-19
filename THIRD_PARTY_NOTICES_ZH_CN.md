# 第三方声明

Code-Codex 同时包含独立编写的代码，以及可能基于第三方作品进行改编、重建或视觉参考的效果。

Code-Codex 仓库根目录中的 MIT License 仅适用于由 Code-Codex 独立创作的内容，不会对下文所列第三方作品、代码片段、改编 Shader、图片、素材、名称或其他受保护内容进行重新授权。

本文件用于记录来源及目前的核验状态，本身不会产生任何授权。如果本声明与原始许可证或原作者条款冲突，应以原始条款为准。

**最后更新：** 2026 年 9 月 19 日

安装包所含软件依赖的许可证由 `THIRD_PARTY_LICENSES.txt` 另行记录。本文件主要说明视觉效果的来源。

## 状态说明

- **已确认：** 已保存可以核验的来源证据及适用许可证或授权。
- **有条件适用：** 可能适用平台默认许可证，但仍需保存具体作品页面及当时有效的平台条款作为证据。
- **未确认：** 已知或疑似存在原作者，但尚未确认再分发授权。署名本身不等于获得授权。
- **仅作参考：** Code-Codex 仅根据公开视觉、截图、交互概念或 Prompt 独立实现，且项目无意包含第三方源码或素材。

## 修改内容与权利边界

- Code-Codex 贡献者仅对其独立完成的修改、集成代码、参数控制、界面、生命周期代码、性能优化及其他原创新增内容主张相应权利。
- 本项目不对第三方原作品或源自原作品的部分主张所有权。可以分离的 Code-Codex 原创新增部分可适用仓库 MIT License，但这不会改变底层或不可分离第三方材料的许可证。
- 对作者、项目、产品、平台和商标的提及仅用于识别来源与署名，不表示其赞助、关联、批准或认可 Code-Codex。
- 每项改编或重建效果均为非官方修改实现，不得描述为原作者发布的官方版本。
- 署名和修改说明不能弥补授权缺失。标记为“未确认”的材料，在取得适用许可证或书面授权之前，不应公开或商业再分发；另一种处理方式是将相关材料替换为能够证明独立创作的实现。

---

## 1. Heavenly Cloud Background / 极乐天境

**目前记录的参考作品：** Heavenly [252]  
**目前记录的作者：** XorDev (@XorDev)  
**目前记录的来源：** https://www.shadertoy.com/view/W3BSzy  
**状态：** 有条件适用；仍需保存来源与许可证证据

本地项目将该效果记录为依据所提供参考资料完成的 WebGL 重建。当前本地源码中没有保存完整的第三方源文件，也没有保存该具体作品的许可证头。

如果该作品页面没有单独覆盖平台默认许可，并且取得参考材料时适用的 ShaderToy 默认许可证确为 Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported，则依法构成原 Shader 改编的部分必须遵守该许可证：

**CC BY-NC-SA 3.0**  
https://creativecommons.org/licenses/by-nc-sa/3.0/  
法律文本：https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode

该许可证要求署名、提供许可证链接、标明修改、仅作非商业使用，并以相同或兼容的“相同方式共享”许可证发布改编作品。本声明本身不能证明该平台默认许可证确实适用于这一个具体作品。

**Code-Codex 修改内容：** 将效果重构至 Code-Codex WebGL 运行环境，新增可调渲染参数、中英文设置界面、动画与生命周期管理、应用主题协调及性能保护机制。

这是非官方修改或重建实现。本项目不表示 XorDev 对 Code-Codex 作出认可或背书。

Code-Codex 的 MIT License 不适用于最终被认定为源自原 Shader 的部分。

---

## 2. Aurora Ionosphere Background / 极光电离层

**原始作品：** Auroras  
**原作者：** nimitz (@stormoid)  
**来源：** https://www.shadertoy.com/view/XtGGRt  
**状态：** 有条件适用；仍需保存来源与许可证证据

Code-Codex 将原 Shader 算法适配至 WebGL 背景系统，并在源码和界面中保留了原作者署名及 ShaderToy 标识。

当前本地项目没有保存能够覆盖平台默认许可的作品专属许可证。如果取得源码时适用的 ShaderToy 默认许可证为 CC BY-NC-SA 3.0，则衍生部分必须按该许可证发布：

**CC BY-NC-SA 3.0**  
https://creativecommons.org/licenses/by-nc-sa/3.0/  
法律文本：https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode

该许可证要求署名、提供许可证链接、标明修改、仅作非商业使用，并以相同或兼容的“相同方式共享”许可证发布改编作品。本声明本身不能证明该平台默认许可证确实适用于这一个具体作品。

**Code-Codex 修改内容：** 将 Shader 适配至 Code-Codex WebGL 背景运行环境，新增可调运动、渲染与颜色参数、中英文控制面板、生命周期与上下文管理、主题协调及应用 UI 集成。

这是非官方修改实现。本项目不表示 nimitz 对 Code-Codex 作出认可或背书。

Code-Codex 的 MIT License 不适用于源自原 Shader 的部分。

---

## 3. Cloud Train Background / 云间列车

**所提供材料中保留的作者署名：** mdb  
**原始来源：** 尚未核验  
**原始许可证或授权：** 尚未核验  
**状态：** 未确认

项目保留的所提供 Shader 标注原作者为 **mdb**，但文件中没有许可证头，当前也没有保存权威来源链接或单独授权记录。

旧版声明曾将该效果关联到 Tianxiu (Tyson) Zhou 的 “Up in the Cloud Sea” 以及 ShaderToy ID `Ndc3zl`。目前尚未完成该页面作品与项目所保留 Shader 的源码比对，因此本声明不依赖这一对应关系。未经有记录的源码比对，不能以另一个或尚未确认作品的 CC BY 4.0 许可证来授权本 Shader。

**Code-Codex 修改内容：** 将所提供效果接入 Code-Codex WebGL 背景系统，新增中英文参数面板、插件生命周期和主题管理、性能控制，以及新的逐层显现式开场动画。

这是非官方修改实现。本项目不表示 mdb 或任何可能的来源作者对 Code-Codex 作出认可或背书。

在保存权威来源许可证或取得相关版权所有者直接授权之前，本声明不表示项目已经取得所提供 Shader 的公开再分发权。署名本身不等于获得授权。

Code-Codex 的 MIT License 不适用于所提供 Shader 及其衍生部分。

---

## 4. Milky Way Background / 流光背景

**参考作品：** Milky way  
**原作者：** Almina (@Code4_11)  
**最初发布平台与时间：** NEORT，2019 年 7 月 8 日  
**参考页面：** https://neort.io/en/art/bkho2v43p9f188g4t290  
**状态：** 未确认 / 部分重建

Code-Codex 的实现依据署名为上述作品的不完整截图或 Shader 片段重建，并不声称是原始完整 Shader 的核验副本。缺失阶段和应用集成部分由 Code-Codex 独立实现。

当前没有保存或核验原作品的明确开源许可证或授权。原作品版权仍归原作者所有。如果实现中包含具有著作权保护意义的原始代码片段，则再分发该片段仍需取得授权或具备适用许可证。

**Code-Codex 修改内容：** 重建缺失阶段，新增可调视觉与运动参数、中英文设置界面、WebGL 与应用集成、渲染生命周期管理、动画行为、主题协调及性能优化。

这是非官方部分重建实现。本项目不表示 Almina 对 Code-Codex 作出认可或背书。

本声明中的署名不会使原作品自动适用 Code-Codex 的 MIT License，也不会自行产生再分发授权。

---

## 5. Layered Mountain Background / 层叠山峦

**视觉参考署名：** Yohei Nishitsuji（西辻陽平 / @YoheiNishitsuji）  
**作者网站：** https://yoheinishitsuji.com/  
**状态：** 仅作参考；尚未核验具体原帖及许可证

所提供参考资料将该层叠山峦效果标注为 Yohei Nishitsuji 的作品。Code-Codex 的渲染器依据局部视觉参考独立重建，并不声称逐字恢复或复制了原作者源码。

当前没有保存与该实现直接对应的源码帖子或作品专属许可证记录。旧版声明曾称相关代码采用 MIT License，但在能够记录具体帖子及其许可证之前，该表述已删除。

项目保留署名以说明视觉参考来源，但这不表示原作品被重新授权为 Code-Codex 的 MIT License。

**Code-Codex 修改内容：** 为 Code-Codex 独立实现双通道 WebGL2 渲染器、程序化山脊数据、可调运动、景观、光照、氛围和输出参数、中英文设置界面、生命周期与主题集成、性能限制及开场动画。

这是依据局部参考完成的非官方独立重建。本项目不表示 Yohei Nishitsuji 对 Code-Codex 作出认可或背书。

---

# 仅视觉 / Prompt 参考

以下效果依据公开展示的视觉概念或 Prompt，由 Code-Codex 独立实现。项目无意包含所参考作品的源码或素材。如果后续审计发现存在复制的代码或素材，应及时更新此分类。

## Pixel Sculpt Background

**视觉参考：** Pixel Sculpt — React Bits Pro

**参考页面：** https://pro.reactbits.dev/docs/components/pixel-sculpt

**状态：** 仅作参考

Pixel Sculpt Background 的视觉效果与交互概念参考了 React Bits Pro 公开展示的 Pixel Sculpt 页面。Code-Codex 未复制、提取、修改或分发 React Bits Pro 的源代码、组件、预览素材或其他产品文件。本插件的程序代码、WebGL 渲染流程、像素棱柱几何、界面集成及扩展功能均为 Code-Codex 独立实现。

**Code-Codex 原创工作：** 图片采样与浮雕生成、实例化棱柱渲染、鼠标与点击交互、本地图片库管理、按序自动播放与变形切换、中英文参数控制、全窗口渲染与输入转发、原生深色外观及恢复、设置持久化、上传限制、生命周期处理和资源清理。

本声明仅用于标明视觉灵感来源，不表示 React Bits Pro 对 Code-Codex 的认可、赞助或关联。

---

## Particle Image Background / 粒子图像

**视觉参考：** Particle Image — React Bits Pro  
**创作者：** React Bits / David Haz  
**参考页面：** https://pro.reactbits.dev/docs/components/particle-image  
**状态：** 仅作参考

Code-Codex 仅根据公开展示的视觉效果和交互概念独立实现，无意包含 React Bits Pro 的源码或素材。

**Code-Codex 原创工作：** 图片采样与黑白处理、粒子生成、气体式鼠标交互、持续补充机制、图片库管理、单图位置与缩放、带可编辑曲线和关键帧的粒子变形、WebGL 性能优化、中英文参数控制及应用集成。

---

## Black Hole Background / 黑洞

**视觉参考：** Black Hole Hero Section  
**创作者：** @yura  
**平台：** 21st.dev  
**参考页面：** https://21st.dev/community/components?preview=%2F%40yura%2Fcomponents%2Fblackhole-hero-section  
**状态：** 仅作参考

Code-Codex 仅根据公开展示的视觉概念或 Prompt 独立实现，无意包含该参考组件的源码或素材。

**Code-Codex 原创工作：** WebGL 渲染器、动画与交互逻辑、应用主题和生命周期集成、中英文参数控制，以及包括像素密度限制和屏幕区域提前退出在内的渲染优化。

---

## Glow Horizon Background / 发光地平线

**视觉参考：** Glow Horizon  
**创作者：** Bashar ahammed (@ahammed.bashar9)  
**平台：** 21st.dev  
**参考页面：** https://21st.dev/community/components?q=hero&preview=%2F%40ahammed.bashar9%2Fcomponents%2Fglow-horizon  
**状态：** 仅作参考

Code-Codex 仅根据公开展示的视觉概念或 Prompt 独立实现，无意包含该参考组件的源码或素材。

**Code-Codex 原创工作：** WebGL 渲染实现、动画与交互行为、应用主题和生命周期集成、中英文参数控制，以及包括滚轮事件合并在内的性能优化。

---

# Code-Codex 原创部分

在确属 Code-Codex 独立创作且未包含第三方材料的范围内，下列部分按仓库根目录中的 MIT License 发布：

- Transparent Background / 透明背景
- 原创集成代码及应用代码
- UI 与设置系统
- 插件生命周期管理
- 独立编写的 WebGL 集成代码
- 其他未在上文标记为第三方材料的 Code-Codex 原创代码

此列表不会覆盖嵌入上述组件中的第三方 Shader、具有表达性的算法代码、代码片段、图片、素材或改编部分的许可证状态。

---

# 分发与证据保存要求

如果 Code-Codex 的源码或二进制安装包包含本文件所列材料：

1. 分发时一并提供本声明及所有适用的原始许可证全文。
2. 在可行情况下，在源码中保留作者、作品名称、来源链接和许可证说明。
3. 明确标注 Code-Codex 所作修改。
4. 不得将许可证尚未核验的材料描述为 MIT 授权。
5. 在公开分发前，为每一项尚未确认授权的改编作品保存权威来源页面快照、许可证文本或作者书面授权。
6. 对于 CC BY-NC-SA 材料，不得用于商业用途，并须以相同或兼容的“相同方式共享”许可证发布改编作品。
7. 为每个效果保存带日期的来源记录，包括取得时的 URL、作者、来源页面快照或文件哈希、适用许可证全文，以及 Code-Codex 修改内容摘要。
8. 如果无法核验某项效果的来源或授权，应从公开构建中移除或禁用该效果；免责声明或接受删除请求的说明不能替代授权。

---

# 仓库许可证适用范围

仓库根目录中的 MIT License 仅适用于 Code-Codex 原创内容。第三方 Shader、改编部分及参考作品仍分别受到其适用许可证、版权条款或授权的约束。

---

# 联系方式

如果您是上述作品的版权所有者，并认为本项目中的署名、来源、分类或许可证说明需要修正，请在 Code-Codex 仓库提交 Issue，或联系项目维护者。

本声明仅用于记录来源与许可证范围，不构成法律意见。

本声明不限制适用许可证、法律规定的例外或权利人书面授权直接授予的权利。项目不保证当前信息已经完整；在商业分发前，或任何重要材料来源仍不明确时，维护者应寻求具备资质的法律专业意见。


