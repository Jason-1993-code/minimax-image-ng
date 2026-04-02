# MiniMax 图像生成插件

适用于 OpenClaw 的 MiniMax 文生图插件，基于官方 MiniMax Image Generation API，支持**文生图（T2I）**和**图生图（I2I）**。

## 功能特性

- 基于 MiniMax API 的文生图和图生图能力
- 支持 `image-01` 和 `image-01-live` 双模型
- 多种画面比例：1:1、16:9、4:3、3:2、2:3、3:4、9:16、21:9
- 输出格式可选 URL（远程下载）或 base64（内嵌）
- 支持提示词优化（prompt optimizer）
- 支持 AIGC 水印嵌入
- Style 参数（仅 image-01-live 支持）
- 自定义尺寸（仅 image-01 支持）
- 随机种子（seed），可复现图片
- 图生图支持（通过 subject_reference 传入参考图片）

## 相关文档

- [MiniMax T2I API 文档](https://platform.minimaxi.com/docs/api-reference/image-generation-t2i.md)
- [MiniMax I2I API 文档](https://platform.minimaxi.com/docs/api-reference/image-generation-i2i.md)

## 安装

```bash
openclaw plugins install @openclaw/minimax-image-ng
```

### 离线安装

从 [GitHub Releases](https://github.com/Jason-1993-code/minimax-image-ng/releases) 下载安装包，使用本地路径安装：

```bash
openclaw plugins install https://github.com/Jason-1993-code/minimax-image-ng/releases/download/v1.2.1/minimax-image-ng-v1.2.1.zip
```

安装后验证：

```bash
openclaw plugins list
# 确认 minimax-image-ng 出现在插件列表中

openclaw plugins inspect minimax-image-ng
# 确认 Capabilities 中包含 image-generation: minimax-image-ng
```

## 工作原理

OpenClaw 的图像生成通过统一的 `image_generate` 工具暴露给 LLM。当用户请求生成图片时：

```
用户输入 → LLM 判断需要调用工具 → image_generate 工具
  → OpenClaw 查询 ImageGenerationProvider 路由
  → minimax-image-ng.generateImage() 被调用
  → MiniMax API 返回图片 → 用户收到图片
```

关键：`minimax-image-ng`（图像生成）与 `minimax-portal`（文本对话）是**两个独立的 Provider**。图像生成请求需要将 `imageGenerationModel` 指向 `minimax-image-ng`，否则 LLM 不会自动路由到本插件。

## 配置方式

### 第一步：配置 API Key

MiniMax 图像生成和文本模型使用**同一个 API Key**（MiniMax API）。

#### 方式 A：使用已有环境变量（推荐）

如果你已经配置了 MiniMax 文本模型，使用的是 `MINIMAX_API_KEY`，插件会优先查找 `MINIMAX_IMAGE_API_KEY`；如果未设置，则回退到 `MINIMAX_API_KEY`。

```bash
# 只需设置一次，文本和图像共用
export MINIMAX_API_KEY="your-minimax-api-key"
```

#### 方式 B：独立设置图像生成 Key

```bash
export MINIMAX_IMAGE_API_KEY="your-image-specific-key"
```

#### 方式 C：通过配置文件

在 `openclaw.json` 的 `plugins.entries.minimax-image-ng.config` 中配置：

```json
{
  "plugins": {
    "entries": {
      "minimax-image-ng": {
        "enabled": true,
        "config": {
          "apiKey": "your-api-key",
          "endpoint": "global",
          "model": "image-01",
          "aspectRatio": "1:1",
          "responseFormat": "url",
          "n": 1
        }
      }
    }
  }
}
```

> 注意：配置文件中的 API Key 会明文存储，建议使用环境变量方式。

### 第二步：配置图像生成路由（关键）

这是让对话模型调用本插件的**必要步骤**。

在 `openclaw.json` 的 `agents.defaults` 下添加：

```json
{
  "agents": {
    "defaults": {
      "imageGenerationModel": "minimax-image-ng"
    }
  }
}
```

也可以指定具体模型：

```json
{
  "agents": {
    "defaults": {
      "imageGenerationModel": {
        "primary": "minimax-image-ng/image-01-live",
        "fallbacks": ["minimax-image-ng/image-01"]
      }
    }
  }
}
```

**OpenClaw Agent 相关的三个模型配置项：**

| 配置项 | 用途 | 示例 |
|--------|------|------|
| `model` | 文本推理模型 | `"minimax-portal/MiniMax-M2.7"` |
| `imageModel` | 能理解图片输入的推理模型 | `"minimax/MiniMax-VL-01"` |
| `imageGenerationModel` | **图像生成模型** | `"minimax-image-ng"` |

重启 gateway 使配置生效：

```bash
openclaw gateway restart
```

## 配置项说明

### 插件配置（plugins.entries.minimax-image-ng.config）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `apiKey` | string | - | API 密钥（可选，优先使用环境变量） |
| `endpoint` | `global` \| `cn` | `global` | API 端点 |
| `model` | `image-01` \| `image-01-live` | `image-01` | 默认使用模型 |
| `aspectRatio` | string | `1:1` | 画面比例 |
| `responseFormat` | `url` \| `base64` | `url` | 输出格式 |
| `n` | number (1-9) | `1` | 生成图片数量 |
| `promptOptimizer` | boolean | `false` | 启用提示词优化 |
| `aigcWatermark` | boolean | `false` | 嵌入 AIGC 水印 |
| `style` | string | - | 风格参数（仅 image-01-live 支持） |
| `width` | number | - | 图片宽度像素（仅 image-01 支持） |
| `height` | number | - | 图片高度像素（仅 image-01 支持） |
| `seed` | number | - | 随机种子 |

### 模型专属参数

- **image-01**：支持 `aspectRatio`、`width`、`height`（512-2048，8 的倍数）、`seed`
- **image-01-live**：支持 `aspectRatio`、`style`、`seed`（不支持 `21:9`）

当请求未显式传入 `aspectRatio` 时，插件会使用 `config.aspectRatio`（默认 `1:1`）并应用到两个模型。

当同时传入 `aspectRatio` 和 `width/height` 时，`aspectRatio` 优先生效。

## 使用方式

### 对话触发（推荐）

确保已完成"第二步：配置图像生成路由"，然后直接对话：

```bash
openclaw chat "生成一张猫的照片"
```

LLM 会自动调用 `image_generate` 工具，OpenClaw 将请求路由到 `minimax-image-ng`。

### 图生图（I2I）

当对话中包含图片引用时，插件会将图片作为 `subject_reference`（人物主体参考）发送给 MiniMax API：

```bash
openclaw chat "根据这张图生成一幅类似的风格"
# 并附上一张参考图片
```

图生图要求：
- 参考图片需包含人物（`type: "character"`）
- 支持公网 URL 或 base64 Data URL
- 支持 JPG、JPEG、PNG 格式，大小 < 10MB
- 两个模型（image-01 / image-01-live）均支持图生图

### 代码调用

```typescript
import { generateImage } from "@openclaw/minimax-image-ng";

const result = await generateImage(
  { prompt: "A beautiful sunset over the ocean" },
  {
    endpoint: "global",
    model: "image-01",
    aspectRatio: "16:9",
    responseFormat: "url",
    n: 1,
  },
  "your-api-key"
);

console.log(result.images[0].buffer);
```

## 错误码说明

| 错误码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1002 | 请求频率超限 |
| 1004 | 账号鉴权失败，请检查 API-Key 是否填写正确 |
| 1008 | 账户余额不足 |
| 1026 | 内容违反政策 |
| 2013 | 传入参数异常，请检查入参是否按要求填写 |
| 2049 | 内容审核拦截 |

## API 端点

| 区域 | Base URL |
|------|----------|
| Global | `https://api.minimax.io` |
| CN | `https://api.minimaxi.com` |

## 认证优先级

插件会按以下顺序查找 API Key：

1. 环境变量 `MINIMAX_IMAGE_API_KEY`（最高优先级）
2. 环境变量 `MINIMAX_API_KEY`（与官方 MiniMax Provider 一致，兜底）
3. 插件配置 `plugins.entries.minimax-image-ng.config.apiKey`
4. OpenClaw Auth Profile 中的 `minimax-image-ng` API Key 凭证

## 与内置 minimax 插件的差异

OpenClaw（v1.4+）内置了 `minimax` 图像生成 Provider，但对于高级用户而言功能较为有限。

### 功能对比

| 功能 | 内置 `minimax` | `minimax-image-ng` |
|------|---------------|-------------------|
| image-01 模型 | ✅ 支持 | ✅ 支持 |
| image-01-live 模型 | ❌ 不支持 | ✅ 支持 |
| style 参数（人像/通用/影视等） | ❌ 不支持 | ✅ 支持 |
| 自定义 width/height | ❌ 不支持 | ✅ 支持 |
| aspect_ratio 预设比例 | ⚠️ 部分支持 | ✅ 全部支持 |
| 提示词优化器 | ❌ 不支持 | ✅ 支持 |
| AIGC 水印嵌入 | ❌ 不支持 | ✅ 支持 |
| 图生图 (I2I) | ⚠️ 仅基础功能 | ✅ 完全支持 |

### 使用场景

**选择内置 `minimax`**：
- 仅需要基础的文生图功能
- 使用 image-01 模型即可满足需求
- 希望插件数量最少化

**选择 `minimax-image-ng`**：
- 需要 `image-01-live` 模型（更适合人像摄影）
- 需要 style 参数控制风格（人像/通用/影视/旅行等）
- 需要自定义图片尺寸而非固定比例
- 需要图生图功能

### 共存说明

两个插件可以同时安装、互不冲突：

- 内置 `minimax` Provider ID：`minimax`
- 本插件 Provider ID：`minimax-image-ng`

通过 `imageGenerationModel` 配置选择使用哪个插件生成图像。

## 与 minimax-portal 的关系

| | minimax-image-ng（本插件） | minimax-portal（内置） |
|--|------------------------|----------------------|
| **能力** | 图像生成 | 文本对话/LLM |
| **Provider ID** | `minimax-image-ng` | `minimax-portal` |
| **使用 `imageGenerationModel` 路由** | ✅ | ❌ |
| **使用 `model` 路由** | ❌ | ✅ |

两者互相独立，使用 `MINIMAX_API_KEY` 共用同一套凭证体系。

## 开发

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 运行单元测试
npm run test

# 监听模式（开发）
npm run dev
```

## 许可证

MIT
