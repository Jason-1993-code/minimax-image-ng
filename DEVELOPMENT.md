# MiniMax Image Generation Plugin - 开发文档

## 项目概述

**插件名称**: `@openclaw/minimax-image-ng`  
**功能**: 将 MiniMax 文生图 API 接入 OpenClaw，作为原生 `image_generate` 工具 provider  
**端点支持**: Global (`api.minimax.io`) / CN (`api.minimaxi.com`)

---

## 目录结构

```
minimax-image-ng/
├── DEVELOPMENT.md          # 本文档（开发流程、回滚步骤）
├── README.md              # 用户使用说明
├── README_CN.md           # 中文使用说明
├── package.json           # npm 包配置
├── openclaw.plugin.json   # 插件 manifest（插件标识、认证、配置schema）
├── tsconfig.json          # TypeScript 配置
├── src/
│   ├── index.ts           # 插件入口，registerImageGenerationProvider
│   └── image-generation.ts # MiniMax 图生图 API 封装
└── src/
    └── image-generation.test.ts  # 单元测试
```

---

## API 基础信息

### 端点

| 版本 | Base URL |
|------|----------|
| Global | `https://api.minimax.io` |
| CN | `https://api.minimaxi.com` |

### 认证

- Bearer Token（API Key）
- Header: `Authorization: Bearer <token>`
- 优先级：`MINIMAX_IMAGE_API_KEY` > `MINIMAX_API_KEY` > config.apiKey > auth profile

### 主要接口

```
POST /v1/image_generation
Content-Type: application/json

Request:
{
  "model": "image-01" | "image-01-live",
  "prompt": "<string, max 1500 chars>",
  "aspect_ratio": "1:1" | "16:9" | "4:3" | "3:2" | "2:3" | "3:4" | "9:16" | "21:9",
  "response_format": "url" | "base64",
  "n": 1-9,
  "prompt_optimizer": boolean,
  "aigc_watermark": boolean,
  "style": "<string, 仅 image-01-live 支持>",
  "width": "<integer, 仅 image-01, 512-2048, 8的倍数>",
  "height": "<integer, 仅 image-01, 512-2048, 8的倍数>",
  "seed": "<integer, 随机种子>"
}

Response:
{
  "data": {
    "image_urls": ["<url1>", "<url2>"],
    "image_base64": ["<base64_1>", "<base64_2>"]
  },
  "items": [{ "url": "...", "base64": "..." }],
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

### 错误码

| status_code | 含义 |
|-------------|------|
| 0 | 成功 |
| 1002 | 限流 |
| 1004 | 账号鉴权失败，请检查 API-Key 是否填写正确 |
| 1008 | 余额不足 |
| 1026 | 内容违规 |
| 2013 | 传入参数异常，请检查入参是否按要求填写 |
| 2049 | 内容审核拦截 |

---

## openclaw.plugin.json 设计

```json
{
  "id": "minimax-image-ng",
  "name": "MiniMax Image NG",
  "description": "MiniMax image generation provider (text-to-image and image-to-image)",
  "version": "1.2.0",
  "providers": ["minimax-image-ng"],
  "providerAuthEnvVars": {
    "minimax-image-ng": ["MINIMAX_IMAGE_API_KEY", "MINIMAX_API_KEY"]
  },
  "providerAuthChoices": [
    {
      "provider": "minimax-image-ng",
      "method": "api-key",
      "choiceId": "minimax-image-global",
      "choiceLabel": "MiniMax Image (Global)",
      "groupId": "minimax-image-ng",
      "groupLabel": "MiniMax Image",
      "optionKey": "minimaxImageGlobalApiKey",
      "cliFlag": "--minimax-image-global-api-key",
      "cliOption": "--minimax-image-global-api-key <key>",
      "cliDescription": "MiniMax Image Global API Key (api.minimax.io)",
      "onboardingScopes": ["image-generation"]
    },
    {
      "provider": "minimax-image-ng",
      "method": "api-key",
      "choiceId": "minimax-image-cn",
      "choiceLabel": "MiniMax Image (CN)",
      "groupId": "minimax-image-ng",
      "groupLabel": "MiniMax Image",
      "optionKey": "minimaxImageCnApiKey",
      "cliFlag": "--minimax-image-cn-api-key",
      "cliOption": "--minimax-image-cn-api-key <key>",
      "cliDescription": "MiniMax Image CN API Key (api.minimaxi.com)",
      "onboardingScopes": ["image-generation"]
    }
  ],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "apiKey": { "type": "string" },
      "endpoint": {
        "type": "string",
        "enum": ["global", "cn"],
        "default": "global"
      },
      "model": {
        "type": "string",
        "enum": ["image-01", "image-01-live"],
        "default": "image-01"
      },
      "aspectRatio": {
        "type": "string",
        "enum": ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
        "default": "1:1"
      },
      "responseFormat": {
        "type": "string",
        "enum": ["url", "base64"],
        "default": "url"
      },
      "n": {
        "type": "integer",
        "minimum": 1,
        "maximum": 9,
        "default": 1
      },
      "promptOptimizer": {
        "type": "boolean",
        "default": false
      },
      "aigcWatermark": {
        "type": "boolean",
        "default": false
      },
      "style": {
        "type": "string",
        "description": "Style parameter (only for image-01-live model)"
      },
      "width": {
        "type": "integer",
        "description": "Image width (only for image-01, 512-2048, divisible by 8)",
        "minimum": 512,
        "maximum": 2048
      },
      "height": {
        "type": "integer",
        "description": "Image height (only for image-01, 512-2048, divisible by 8)",
        "minimum": 512,
        "maximum": 2048
      },
      "seed": {
        "type": "integer",
        "description": "Random seed for reproducible images"
      }
    }
  }
}
```

---

## 插件配置参考（openclaw.json）

### 最简配置（只改必要字段）

```json5
{
  "plugins": {
    "entries": {
      "minimax-image": {
        "enabled": true,
        "config": {
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

### API Key 配置（方式一：环境变量）

```bash
# 全局用户环境变量（推荐）
export MINIMAX_IMAGE_API_KEY="your-api-key-here"

# 然后在 openclaw.json 里引用
{
  "plugins": {
    "entries": {
      "minimax-image": {
        "enabled": true,
        "config": {
          "endpoint": "global"
        }
      }
    }
  }
}
```

### API Key 配置（方式二：Config 内联，测试用）

```json5
{
  "env": {
    "MINIMAX_IMAGE_API_KEY": "your-api-key-here"
  },
  "plugins": {
    "entries": {
      "minimax-image": {
        "enabled": true,
        "config": {
          "endpoint": "global"
        }
      }
    }
  }
}
```

---

## 安全测试流程（不污染现网环境）

### Step 0: 备份现有配置

```bash
# 备份当前 openclaw.json
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak.$(date +%Y%m%d%H%M%S)

# 记录当前插件状态
openclaw plugins list > ~/inbox/minimax-image/plugins-list-before.txt
```

### Step 1: 安装插件（本地路径）

```bash
openclaw plugins install /home/kingwoods/inbox/minimax-image
```

### Step 2: 配置插件

编辑 `~/.openclaw/openclaw.json`，在 `plugins.entries` 下添加：

```json
"minimax-image": {
  "enabled": true,
  "config": {
    "endpoint": "global",
    "model": "image-01"
  }
}
```

### Step 3: 配置 API Key

```bash
# 方式A: 写到用户环境变量（推荐）
echo 'export MINIMAX_IMAGE_API_KEY="your-key-here"' >> ~/.bashrc
source ~/.bashrc

# 方式B: 写到系统环境变量（需要 root）
sudo tee /etc/profile.d/minimax-image.sh << 'EOF'
export MINIMAX_IMAGE_API_KEY="your-key-here"
EOF
```

### Step 4: 重启 Gateway

```bash
openclaw gateway restart
```

### Step 5: 验证加载

```bash
openclaw plugins list
# 应该看到 minimax-image 在列表中
```

### Step 6: 测试生成（通过对话触发）

在对话中尝试：
```
生成一张图片：一只在海边奔跑的金毛犬，16:9，写实风格
```

### Step 7: 观察日志

```bash
# 实时查看 gateway 日志
tail -f ~/.openclaw/logs/gateway.log | grep -i minimax
```

---

## 回滚流程（一键恢复）

### 方案A: 恢复备份文件

```bash
# 停止 gateway
openclaw gateway stop

# 恢复配置
cp ~/.openclaw/openclaw.json.bak.$(ls -t ~/.openclaw/openclaw.json.bak.* | head -1) ~/.openclaw/openclaw.json

# 卸载插件
openclaw plugins uninstall minimax-image

# 重启
openclaw gateway start
```

### 方案B: 临时 disable（不改配置）

```bash
# 编辑 ~/.openclaw/openclaw.json
# 将 enabled 改为 false，或直接删除 minimax-image 条目

openclaw gateway restart
```

---

## 开发任务清单

- [x] 创建项目目录和基础文件
- [x] 编写 `openclaw.plugin.json`（manifest）
- [x] 编写 `package.json`
- [x] 编写 `tsconfig.json`
- [x] 实现 `src/index.ts`（插件注册逻辑）
- [x] 实现 `src/image-generation.ts`（MiniMax API 封装）
- [x] 编写单元测试 `src/image-generation.test.ts`
- [ ] 本地安装测试
- [ ] 端到端验证（对话触发生成）
- [ ] 补充 `README.md`（用户文档）
- [ ] 发布到 npm / ClawHub（如需要）

---

## 依赖说明

```json
{
  "type": "module",
  "dependencies": {
    "openclaw": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

---

## 注意事项

1. **API Key 绝不硬编码**——全程通过 `MINIMAX_IMAGE_API_KEY` 环境变量注入
2. **不改主模型**——测试时通过显式 model alias 调用，不影响现有对话模型
3. **先本地测试再接入生产**——验证链路通顺后再部署
4. **保留备份**——任何配置变更前先备份现网配置

---

## 发布门禁清单（WTP-88）

### 发布前检查项（自动化门禁）

```bash
npm run build    # ✅ 预期：tsc 编译成功，无 error
npm run test    # ✅ 预期：vitest 全部通过（46 tests）
```

执行记录（请填写实际执行结果）：

| 门禁项 | 执行命令 | 执行结果 | 执行时间 | 执行人 |
|--------|---------|---------|---------|--------|
| TypeScript 编译 | `npm run build` | _________ | _________ | _________ |
| 单元测试 | `npm run test` | _________ / 46 passed | _________ | _________ |
| manifest 格式 | `cat openclaw.plugin.json \| python3 -m json.tool > /dev/null && echo OK` | _________ | _________ | _________ |

### 手工 Smoke Test（在具备 OpenClaw CLI 的机器上执行）

**环境准备：**
```bash
# 安装插件（本地路径）
openclaw plugins install /path/to/minimax-image

# 配置 API Key（2选1）
export MINIMAX_IMAGE_API_KEY="your-key-here"          # 方式A：环境变量（推荐）
# 或在 openclaw.json 中配置 config.apiKey          # 方式B：config 内联

# 重启 gateway
openclaw gateway restart
```

**Smoke 场景与预期结果：**

| 场景 | 验证命令/操作 | 预期结果 | 实际结果 | 通过？ |
|------|-------------|---------|---------|--------|
| 插件可见性 | `openclaw plugins list` | 列表中包含 `minimax-image` | _________ | ☐ |
| Global + url | `openclaw chat "生成一张猫的图片"` | 返回图片 URL | _________ | ☐ |
| CN + url | 配置 `endpoint: cn`，重试 | 返回图片 URL | _________ | ☐ |
| base64 格式 | 配置 `responseFormat: base64` | 返回 base64 数据 | _________ | ☐ |
| image-01-live | 配置 `model: image-01-live` | 生成 live 模型图片 | _________ | ☐ |
| 错误码-认证失败 | 使用无效 key | 返回错误码 1004/2013 | _________ | ☐ |
| 错误码-余额不足 | API 余额为 0 | 返回错误码 1008 | _________ | ☐ |
| 错误码-限流 | 短时间内多次请求 | 返回错误码 1002 | _________ | ☐ |

**验证认证入口可见性：**
```bash
openclaw plugins inspect minimax-image   # 预期：输出包含 providerAuthChoices / cliFlag
```

### 发布后验证

| 验证项 | 操作 | 预期结果 | 实际结果 | 通过？ |
|--------|------|---------|---------|--------|
| 插件状态 | `openclaw plugins list` | minimax-image 状态正常 | _________ | ☐ |
| 对话触发 | 通过对话请求图片生成 | 正常返回图片 | _________ | ☐ |
| 日志无异常 | `tail -f ~/.openclaw/logs/gateway.log \| grep minimax` | 无 ERROR 级别日志 | _________ | ☐ |

> **注意**：手工 smoke 完成后，请将本记录（填写"实际结果"列）保存到 Linear issue WTP-88 评论中作为审计证据。
