# 文生图提示词模板与技巧

本文档定义了文生图提示词的核心要素、风格词汇库、构图术语速查，以及各主流平台的适配差异。

相关参考：
- 系列插图风格一致性方法论（锁定层/变化层、各平台专项方案）详见 `series-illustration.md`
- 文生图相关高级技巧（分层结构化、对话式精炼、场景特化公式）详见 `advanced-techniques.md` 第 9-11 条
- 文生图 Few-Shot（风格片段）详见 `few-shot-patterns.md` 第七节
- 多平台注意事项速查详见 `best-practices.md` 第五节

---

## 一、文生图提示词的核心要素（六层结构）

| 层级 | 要素 | 说明 | 示例 |
|------|------|------|------|
| 1 | **主体** | 画面核心：谁/什么？外观特征？ | "一位穿黑色风衣的赛博朋克武士，30 岁，面容坚毅，手持发光的武士刀" |
| 2 | **动作/状态** | 在做什么？动态还是静态？ | "缓步行走在雨中，低头凝视手中的刀刃" |
| 3 | **环境** | 在哪里？时间？天气？背景？ | "东京新宿街头，夜晚，暴雨，霓虹灯闪烁，地面积水反射彩色光芒" |
| 4 | **构图** | 景别、角度、焦点、画幅 | "中景，低角度仰拍，主体居中，浅景深突出人物" |
| 5 | **光线与氛围** | 光源方向、色温、情绪基调 | "冷蓝色调侧光从霓虹招牌打来，雨滴形成光斑，氛围孤独而决绝" |
| 6 | **风格与画质** | 艺术风格、技术质量 | "赛博朋克风格，超写实，8K，胶片质感，轻微颗粒感" |

---

## 二、按平台适配

> 各平台模型/参数说明截至 2026-07 校验（模型版本与参数随官方迭代变化，生成前以官方最新文档为准）。
> 多平台注意事项速查表（一句话对比版）见 `best-practices.md` 第五节。

### Midjourney
- 支持自然语言描述，对风格词敏感
- 常用后缀参数：`--ar 16:9` `--style raw` `--v 6`
- 支持负面词：`--no blur, low quality`
- 关键词推荐：多写风格/光线词，少堆砌分辨率（模型底图已经够大）

### Stable Diffusion (SD / SDXL)
- 对标签式短语（逗号分隔）更敏感
- 正负向分离：positive prompt + negative prompt
- 常用 negative：`lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry`
- 权重写法：`(keyword:1.2)` 增强，`(keyword:0.8)` 减弱

### DALL-E 3
- 自然语言描述，擅长理解复杂指令
- 不需要负面 prompt（系统自动处理）
- 强调"不要画什么"可直接用自然语言表述
- 注意版权和敏感内容过滤更严格

### ChatGPT (GPT-4o 原生图像生成)
- 极强自然语言理解，对话式迭代修改
- 支持多轮对话中逐步调整画面（"把背景换成夜晚"、"把人物表情改得更温柔"）
- 出色的文字渲染能力——可在图中准确生成指定文字
- 支持上传参考图进行风格/构图参考
- 无需额外参数，自然句描述即可
- 提示词写法：像和人说话一样描述画面，对话式跟进修改

### Nano Banana Pro (Gemini 3 Pro Image)
- Google 原生多模态图像生成模型
- 官方推荐公式：**主体 + 动作 + 位置/场景 + 构图 + 风格**
- 支持最多 14 张参考图同时输入
- 出色的多语言文字渲染能力（指定字体、大小、颜色、位置）
- 分辨率：1K / 2K / 4K；宽高比：1:1、3:2、4:3、16:9、9:16 等
- 不推荐堆砌 `4k, masterpiece, trending` 等空洞质量词——描述具体比堆标签效果好
- 文本渲染写法：`标题 "HELLO WORLD" 用粗体白色无衬线字体`
- 编辑指令要明确保留下什么：`移除石像。其他所有元素保持完全不变。`

### 即梦 (Jimeng)
- 字节跳动 AI 图像生成模型（3.0 / 4.0），中文生图领域的标杆
- 提示词公式：**主体 + 细节 + 风格 + 环境 + 技术参数**
- **4.0 版本关键变化**：推理速度提升 10 倍+，大白话也能出好图，不再需要超长"咒语"
- **中文文字渲染能力突出**——可直接生成含中文的海报、封面、Logo
- 支持垫图/参考图模式：`参考图片 + 主体不变 + 新场景/新动作/新风格`
- 权重控制：`(关键词:1.2)` 加强，`(关键词:0.8)` 减弱
- 常用负面词：`畸形、丑陋、结构错乱、多余肢体、画得烂的手、文字乱码、水印`
- 常与 DeepSeek 联动：DeepSeek 生成结构化提示词 → 即梦生图 → 豆包反推优化
- 提示词中文字描述要精确，避免多余文字（即梦对文字指令敏感，可能"加戏"）

### 可灵 (Kling)
- 快手 AI 图像/视频生成模型（1.6），对中式审美有专门优化
- 提示词公式：**主体 + 动作 + 场景 + 风格**（四要素直填法）或 **主体+场景+风格+光线+构图+画质**（六层法）
- **核心原则**：最重要的放最前面，用逗号分层而非写长篇散文
- 英文 Prompt 更稳定（训练语料偏英文），中文可中英混用
- **避免抽象词**：删除"美丽""震撼""高级感""氛围感"等空泛词——用精准名词替代（如 `朱砂红裙摆、金线云纹` 而非 `好看的裙子`）
- 中式风格关键词触发效率高："宋代美学"比 "Song Dynasty style" 更稳定
- 负面提示词：保持 50-100 token（过多反而稀释注意力），必填 `extra limbs, blurry, watermark, text, 多余肢体, 畸形`
- **`高清``4K``超清` 等分辨率词对可灵无效**——分辨率通过参数面板设置，不要写进 prompt
- 迭代策略：每次只改一个变量（光线→构图→画质），像 debug 一样调试 prompt

### 通配平台模板

```
# 主体
{主体描述}

# 环境
{环境描述}

# 构图与光线
{构图 + 光线描述}

# 风格与画质
{风格词 + 质量词}

# 平台适配
{MJ: --ar 16:9 --v 6 / SD: 加 negative / DALL-E: 无需参数 / ChatGPT: 对话式迭代 / NB: 主体+动作+场景+构图+风格 / 即梦: 主体+细节+风格+环境 / 可灵: 主体+动作+场景+风格，英文优先}
```

---

## 三、风格词汇库

### 按艺术流派

| 流派 | 英文关键词 | 效果特征 |
|------|-----------|----------|
| 写实主义 | photorealistic, hyperrealistic, 8K, detailed | 如照片般真实 |
| 印象派 | impressionist, oil painting, visible brushstrokes | 笔触可见，光影柔美 |
| 赛博朋克 | cyberpunk, neon lights, dystopian, high tech low life | 霓虹、暗夜、高科技 |
| 蒸汽朋克 | steampunk, brass, gears, Victorian | 黄铜、齿轮、维多利亚风 |
| 极简主义 | minimalist, clean lines, geometric, negative space | 干净、留白、几何感 |
| 浮世绘 | ukiyo-e, Japanese woodblock, flat colors | 平面色块、线条 |
| 水墨画 | ink wash painting, sumi-e, black and white | 水墨晕染、留白 |
| 波普艺术 | pop art, Roy Lichtenstein, bold colors, halftone | 大胆色彩、网点 |
| 巴洛克 | baroque, dramatic lighting, ornate | 戏剧光、华丽 |

### 按常见风格方向

| 风格 | 英文关键词 |
|------|-----------|
| 二次元/动漫 | anime style, manga, studio ghibli, cel shading |
| 电影感 | cinematic, film grain, anamorphic, color graded |
| 概念艺术 | concept art, matte painting, fantasy |
| 3D 渲染 | 3D render, C4D, octane render, unreal engine 5 |
| 像素艺术 | pixel art, 8-bit, retro game, sprite |
| 水彩 | watercolor, soft edges, pastel, wet on wet |
| 线稿/素描 | line art, sketch, pencil drawing, charcoal |
| 扁平插画 | flat illustration, vector art, clean, corporate |

### 按色系与色调

| 色系 | 英文关键词 |
|------|-----------|
| 暖色调 | warm color palette, golden hour, amber, sepia |
| 冷色调 | cool color palette, blue hour, cyan, teal |
| 莫兰迪色 | morandi colors, muted, desaturated, pastel |
| 高饱和 | vibrant, saturated, vivid colors, neon |
| 黑金 | black and gold, luxurious, premium |
| 单色 | monochrome, black and white, greyscale |

---

## 四、构图术语速查

| 术语 | 说明 | 英文 |
|------|------|------|
| **特写** | 脸或物体局部 | close-up |
| **中景** | 人物半身 | medium shot |
| **全景** | 人物全身 + 环境 | full shot / wide shot |
| **远景** | 大场景，人物很小 | long shot / establishing shot |
| **低角度** | 从下往上拍，显高大 | low angle |
| **高角度** | 从上往下拍，显渺小 | high angle / bird's eye view |
| **平视** | 与主体同高度 | eye level |
| **浅景深** | 背景虚化 | shallow depth of field, bokeh |
| **对称构图** | 左右对称 | symmetrical composition |
| **三分法** | 主体在 1/3 位置 | rule of thirds |
| **引导线** | 线条引导视线 | leading lines |
| **框架构图** | 前景框住主体 | frame within a frame |
| **负空间** | 大量留白 | negative space |

---

## 五、常见错误与纠正

| 错误 | 表现 | 纠正 |
|------|------|------|
| **主体混杂** | 一句话里塞了三四个主体，AI 不知道画哪个 | 确定唯一核心主体，其余是陪衬 |
| **风格词冲突** | "水墨画 + 赛博朋克 + 极简" 混在一起 | 选一个主导风格，其余作为点缀 |
| **空泛描述** | "画一个好看的风景" | 具体化：山/海/城市/森林 + 时间 + 天气 + 风格 |
| **忽略平台差异** | 把 MJ 的 `--ar` 写进 SD 提示词 | 生成前确认目标平台 |
| **可灵写分辨率词** | 在 prompt 里写"高清""4K""超清" | 可灵不识别这些词，通过参数面板设置分辨率 |
| **可灵用抽象词** | 写"美丽""震撼""高级感""氛围感" | 全部替换为精准名词：`朱砂红裙摆、金线云纹` 而非 `好看的裙子` |
| **即梦文字多余** | 在提示词中写无关文字 | 即梦对文字指令极其敏感，只写画面需要的文字，避免"加戏" |
| **过载** | 堆砌上百个标签，效果反而差 | 精选 15-30 个关键词足够 |
| **无视负面 prompt** | SD/可灵/即梦 生成图多出奇怪的手指/杂物 | 加上对应平台的标准 negative prompt |
| **构图缺位** | 画面对但"感觉不对" | 补上景别、角度、焦点的描述 |

---

## 六、快速参考卡

| 要什么 | 怎么写 |
|--------|--------|
| 真实照片感 | `photorealistic, 8K, highly detailed, professional photography` |
| 宫崎骏动画风 | `Studio Ghibli style, anime, hand-drawn, soft colors, whimsical` |
| 电影感大片 | `cinematic, 24fps look, anamorphic lens, film grain, color graded` |
| 干净产品图 | `product photography, clean white background, studio lighting, minimalist` |
| 酷炫概念图 | `concept art, trending on ArtStation, dramatic lighting, epic composition` |
| 温暖插画风 | `cozy illustration, warm lighting, soft pastel colors, storybook art` |
