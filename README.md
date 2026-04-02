# MiniMax Image Generation Plugin

OpenClaw plugin for MiniMax text-to-image and image-to-image generation via the official MiniMax Image Generation API.

## Features

- Text-to-image (T2I) and image-to-image (I2I) generation via MiniMax API
- Dual model support: `image-01` and `image-01-live`
- Multiple aspect ratios: 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9
- Output formats: URL (remote download) or base64 (inline)
- Prompt optimizer
- AIGC watermark embedding
- Style parameter (image-01-live only)
- Custom dimensions (image-01 only)
- Reproducible results with seed parameter
- Image-to-image via subject_reference (character-based reference)

## Related Documentation

- [MiniMax T2I API Docs](https://platform.minimaxi.com/docs/api-reference/image-generation-t2i.md)
- [MiniMax I2I API Docs](https://platform.minimaxi.com/docs/api-reference/image-generation-i2i.md)

## Installation

```bash
openclaw plugins install @openclaw/minimax-image-ng
```

### Offline Installation

Download the plugin package from [GitHub Releases](https://github.com/Jason-1993-code/minimax-image-ng/releases) and install via local path:

```bash
openclaw plugins install https://github.com/Jason-1993-code/minimax-image-ng/releases/download/v1.2.1/minimax-image-ng-v1.2.1.zip
```

Verify installation:

```bash
openclaw plugins list
# Confirm minimax-image-ng appears in the plugin list

openclaw plugins inspect minimax-image-ng
# Confirm Capabilities include image-generation: minimax-image-ng
```

## How It Works

OpenClaw exposes image generation through a unified `image_generate` tool. When a user requests an image:

```
User Input → LLM decides to use a tool → image_generate tool
  → OpenClaw queries ImageGenerationProvider routing
  → minimax-image-ng.generateImage() is called
  → MiniMax API returns image → User receives image
```

Key: `minimax-image-ng` (image generation) and `minimax-portal` (text chat) are **two separate providers**. Image generation requests need `imageGenerationModel` pointed to `minimax-image-ng`, otherwise the LLM won't route to this plugin automatically.

## Configuration

### Step 1: Configure API Key

MiniMax image generation and text models share the **same API key**.

#### Option A: Use existing environment variable (recommended)

If you already have MiniMax text models configured with `MINIMAX_API_KEY`, the plugin will look for `MINIMAX_IMAGE_API_KEY` first, then fall back to `MINIMAX_API_KEY`.

```bash
# Set once, shared for both text and image
export MINIMAX_API_KEY="your-minimax-api-key"
```

#### Option B: Set image-specific key

```bash
export MINIMAX_IMAGE_API_KEY="your-image-specific-key"
```

#### Option C: Via config file

In `openclaw.json` under `plugins.entries.minimax-image-ng.config`:

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

> Warning: API keys in config files are stored in plaintext. Environment variables are recommended.

### Step 2: Configure Image Generation Routing (Required)

This is the **required step** to make chat models route image generation requests to this plugin.

Add to `openclaw.json` under `agents.defaults`:

```json
{
  "agents": {
    "defaults": {
      "imageGenerationModel": "minimax-image-ng"
    }
  }
}
```

Or specify a concrete model:

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

**The three OpenClaw Agent model config options:**

| Config key | Purpose | Example |
|------------|---------|---------|
| `model` | Text inference model | `"minimax-portal/MiniMax-M2.7"` |
| `imageModel` | Inference model that understands image input | `"minimax/MiniMax-VL-01"` |
| `imageGenerationModel` | **Image generation model** | `"minimax-image-ng"` |

Restart the gateway for changes to take effect:

```bash
openclaw gateway restart
```

## Configuration Reference

### Plugin Config (plugins.entries.minimax-image-ng.config)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `apiKey` | string | - | API key (optional, env vars take priority) |
| `endpoint` | `global` \| `cn` | `global` | API endpoint |
| `model` | `image-01` \| `image-01-live` | `image-01` | Default model |
| `aspectRatio` | string | `1:1` | Aspect ratio |
| `responseFormat` | `url` \| `base64` | `url` | Output format |
| `n` | number (1-9) | `1` | Number of images to generate |
| `promptOptimizer` | boolean | `false` | Enable prompt optimizer |
| `aigcWatermark` | boolean | `false` | Embed AIGC watermark |
| `style` | string | - | Style parameter (image-01-live only) |
| `width` | number | - | Image width in pixels (image-01 only) |
| `height` | number | - | Image height in pixels (image-01 only) |
| `seed` | number | - | Random seed for reproducibility |

### Model-Specific Parameters

- **image-01**: supports `aspectRatio`, `width`, `height` (512-2048, multiples of 8), `seed`
- **image-01-live**: supports `aspectRatio`, `style`, `seed` (`21:9` is not supported)

If request-level `aspectRatio` is not provided, the plugin uses `config.aspectRatio` (default `1:1`) for both models.

When both `aspectRatio` and `width/height` are provided, `aspectRatio` takes priority.

## Usage

### Chat Trigger (Recommended)

After completing "Step 2: Configure Image Generation Routing", simply chat:

```bash
openclaw chat "Generate a photo of a cat"
```

The LLM will automatically call the `image_generate` tool, and OpenClaw will route to `minimax-image-ng`.

### Image-to-Image (I2I)

When the chat includes an image reference, the plugin sends the image as `subject_reference` (character reference) to the MiniMax API:

```bash
openclaw chat "Generate a similar style image based on this picture"
# attach a reference image
```

I2I requirements:
- Reference image must contain a person (`type: "character"`)
- Supports public URLs or base64 Data URLs
- Supports JPG, JPEG, PNG formats, < 10MB
- Both models (image-01 / image-01-live) support I2I

### Code Usage

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

## Error Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1002 | Rate limit exceeded |
| 1004 | Authentication failed (invalid or missing API key) |
| 1008 | Insufficient account balance |
| 1026 | Content violates policy |
| 2013 | Invalid parameters (check request format) |
| 2049 | Content moderation blocked |

## API Endpoints

| Region | Base URL |
|--------|----------|
| Global | `https://api.minimax.io` |
| CN | `https://api.minimaxi.com` |

## Authentication Priority

The plugin searches for API keys in the following order:

1. Environment variable `MINIMAX_IMAGE_API_KEY` (highest priority)
2. Environment variable `MINIMAX_API_KEY` (same as official MiniMax provider, fallback)
3. Plugin config `plugins.entries.minimax-image-ng.config.apiKey`
4. OpenClaw Auth Profile `minimax-image-ng` API Key credential

## Differences from Built-in minimax Plugin

OpenClaw (v1.4+) includes a built-in `minimax` image generation Provider, but its functionality is limited for advanced users.

### Feature Comparison

| Feature | Built-in `minimax` | `minimax-image-ng` |
|---------|-------------------|-------------------|
| image-01 model | ✅ Supported | ✅ Supported |
| image-01-live model | ❌ Not supported | ✅ Supported |
| style parameter (portrait/general/cinematic/etc.) | ❌ Not supported | ✅ Supported |
| Custom width/height | ❌ Not supported | ✅ Supported |
| aspect_ratio presets | ⚠️ Partial | ✅ Full support |
| Prompt optimizer | ❌ Not supported | ✅ Supported |
| AIGC watermark | ❌ Not supported | ✅ Supported |
| Image-to-image (I2I) | ⚠️ Basic only | ✅ Full support |

### When to Use Each

**Use built-in `minimax`**:
- Only need basic text-to-image generation
- image-01 model meets your requirements
- Prefer minimal plugins

**Use `minimax-image-ng`**:
- Need `image-01-live` model (better for portrait photography)
- Need style parameter to control style (portrait/general/cinematic/travel/etc.)
- Need custom image dimensions instead of fixed aspect ratios
- Need image-to-image (I2I) functionality

### Coexistence

Both plugins can be installed simultaneously without conflict:

- Built-in `minimax` Provider ID: `minimax`
- This plugin Provider ID: `minimax-image-ng`

Use `imageGenerationModel` config to choose which plugin generates images.

## Relationship with minimax-portal

| | minimax-image-ng (this plugin) | minimax-portal (built-in) |
|--|------------------------------|---------------------------|
| **Capability** | Image generation | Text chat / LLM |
| **Provider ID** | `minimax-image-ng` | `minimax-portal` |
| **Routes via `imageGenerationModel`** | ✅ | ❌ |
| **Routes via `model`** | ❌ | ✅ |

The two are independent. Both share the same credential system via `MINIMAX_API_KEY`.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run unit tests
npm run test

# Watch mode (development)
npm run dev
```

## License

MIT
