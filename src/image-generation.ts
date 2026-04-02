/**
 * MiniMax Image Generation API Wrapper
 *
 * API Docs: https://platform.minimaxi.com/docs/api-reference/image-generation-t2i.md
 */

import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  GeneratedImageAsset,
} from "openclaw/plugin-sdk/image-generation";
import { listProfilesForProvider } from "openclaw/plugin-sdk/agent-runtime";

export interface MiniMaxImageConfig {
  endpoint: "global" | "cn";
  model: "image-01" | "image-01-live";
  aspectRatio: string;
  responseFormat: "url" | "base64";
  n: number;
  promptOptimizer: boolean;
  aigcWatermark: boolean;
  style?: string;
  styleWeight?: number;
  width?: number;
  height?: number;
  seed?: number;
}

interface MiniMaxErrorResponse {
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  code?: string;
  msg?: string;
}

interface ImageGenerationModeCapabilities {
  maxCount?: number;
  supportsSize?: boolean;
  supportsAspectRatio?: boolean;
  supportsResolution?: boolean;
}

interface ImageGenerationEditCapabilities extends ImageGenerationModeCapabilities {
  enabled: boolean;
  maxInputImages?: number;
}

interface ImageGenerationGeometryCapabilities {
  sizes?: string[];
  aspectRatios?: string[];
  resolutions?: ("1K" | "2K" | "4K")[];
}

const ERROR_MESSAGES: Record<number, string> = {
  0: "success",
  1002: "rate limit exceeded",
  1004: "authentication failed",
  1008: "insufficient account balance",
  1026: "content policy violation",
  2013: "invalid request parameters",
  2049: "invalid api key",
};

const ENDPOINTS = {
  global: "https://api.minimax.io",
  cn: "https://api.minimaxi.com",
};

const DEFAULT_CONFIG: MiniMaxImageConfig = {
  endpoint: "global",
  model: "image-01",
  aspectRatio: "1:1",
  responseFormat: "url",
  n: 1,
  promptOptimizer: false,
  aigcWatermark: false,
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/jpg"];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ASPECT_RATIOS: Array<{ ratio: number; value: string }> = [
  { ratio: 1.0,     value: "1:1" },
  { ratio: 16 / 9,  value: "16:9" },
  { ratio: 4 / 3,   value: "4:3" },
  { ratio: 3 / 2,   value: "3:2" },
  { ratio: 2 / 3,   value: "2:3" },
  { ratio: 3 / 4,   value: "3:4" },
  { ratio: 9 / 16,  value: "9:16" },
  { ratio: 21 / 9,  value: "21:9" },
];

function mapToClosestAspectRatio(width: number, height: number): string {
  const actual = width / height;
  let closest = ASPECT_RATIOS[0];
  let minDiff = Math.abs(actual - closest.ratio);

  for (const ar of ASPECT_RATIOS) {
    const diff = Math.abs(actual - ar.ratio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ar;
    }
  }

  return closest.value;
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  return null;
}

function detectMimeType(base64: string): string {
  const bytes = Buffer.from(base64.slice(0, 24), "base64");
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return "image/jpeg";
  return "image/png";
}

export function resolveApiKey(
  configApiKey: string | undefined,
  cfg?: any,
  authStore?: any,
  agentDir?: string
): string | undefined {
  if (process.env.MINIMAX_IMAGE_API_KEY) {
    return process.env.MINIMAX_IMAGE_API_KEY;
  }

  if (process.env.MINIMAX_API_KEY) {
    return process.env.MINIMAX_API_KEY;
  }

  if (configApiKey) {
    return configApiKey;
  }

  if (authStore) {
    const profileIds = listProfilesForProvider(authStore, "minimax-image-ng");
    if (profileIds.length > 0) {
      const profile = authStore.profiles?.[profileIds[0]];
      if (profile && profile.type === "api_key" && profile.key) {
        return profile.key;
      }
    }
  }

  return undefined;
}

/**
 * Get base URL based on endpoint configuration
 */
export function getBaseUrl(endpoint: "global" | "cn"): string {
  return ENDPOINTS[endpoint];
}

/**
 * MiniMax Image Generation capabilities
 */
export const CAPABILITIES: {
  generate: ImageGenerationModeCapabilities;
  edit: ImageGenerationEditCapabilities;
  geometry?: ImageGenerationGeometryCapabilities;
} = {
  generate: {
    maxCount: 9,
    supportsAspectRatio: true,
  },
  edit: {
    enabled: true,
    supportsResolution: false,
    supportsAspectRatio: true,
    maxInputImages: 1,
  },
  geometry: {
    aspectRatios: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
  },
};

function parseMiniMaxError(data: MiniMaxErrorResponse): Error {
  if (data.base_resp && data.base_resp.status_code !== 0) {
    const code = data.base_resp.status_code;
    const msg = ERROR_MESSAGES[code] || data.base_resp.status_msg;
    return new Error(`MiniMax API error (${code}): ${msg}`);
  }
  if (data.code && data.code !== "200") {
    return new Error(`MiniMax API error (${data.code}): ${data.msg || "unknown error"}`);
  }
  return new Error("MiniMax API returned an unknown error");
}

async function downloadImage(
  url: string,
  timeoutMs?: number,
  retries = 2
): Promise<{ buffer: Buffer; mimeType: string }> {
  const attempts: Array<{ status?: number; error?: string }> = [];

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = timeoutMs || 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        attempts.push({ status: response.status });
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "image/png";
      const mimeType = contentType.split(";")[0].trim().toLowerCase();
      const buffer = await response.arrayBuffer();
      return { buffer: Buffer.from(buffer), mimeType };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        attempts.push({ error: `timeout after ${timeoutMs || 30000}ms` });
      } else if (err instanceof Error) {
        attempts.push({ error: err.message });
      } else {
        attempts.push({ error: String(err) });
      }
    }
  }

  const attemptSummary = attempts.map((a, i) =>
    `attempt ${i + 1}: ${a.status ? `HTTP ${a.status}` : a.error}`
  ).join("; ");

  throw new Error(`Image download failed after ${retries + 1} attempts [${attemptSummary}] from ${url}`);
}

export async function generateImage(
  req: ImageGenerationRequest,
  config: Partial<MiniMaxImageConfig> = {},
  apiKey?: string
): Promise<ImageGenerationResult> {
  const miniConfig = { ...DEFAULT_CONFIG, ...config };

  const resolvedApiKey = resolveApiKey(apiKey, req.cfg, req.authStore, req.agentDir);
  if (!resolvedApiKey) {
    const hasImageKey = Boolean(process.env.MINIMAX_IMAGE_API_KEY);
    const hasSharedKey = Boolean(process.env.MINIMAX_API_KEY);
    const keySource = hasImageKey
      ? "MINIMAX_IMAGE_API_KEY (env)"
      : hasSharedKey
        ? "MINIMAX_API_KEY (env)"
        : apiKey
          ? "config"
          : req.authStore
            ? "auth profile"
            : "none";
    const ctxParts = [
      `source=${keySource}`,
      req.agentDir ? `agentDir=${req.agentDir}` : null,
    ].filter(Boolean).join(", ");
    throw new Error(
      `MiniMax API key not found. Set MINIMAX_IMAGE_API_KEY or MINIMAX_API_KEY environment variable. (context: ${ctxParts})`
    );
  }

  const baseUrl = getBaseUrl(miniConfig.endpoint);
  const url = `${baseUrl}/v1/image_generation`;

  const effectiveModel = req.model || miniConfig.model;

  if (effectiveModel === "image-01-live") {
    if (miniConfig.width || miniConfig.height) {
      throw new Error("width/height are only supported for image-01 model, not image-01-live");
    }
  }

  if (miniConfig.width && !miniConfig.height) {
    throw new Error("width must be provided together with height");
  }
  if (miniConfig.height && !miniConfig.width) {
    throw new Error("height must be provided together with width");
  }

  if (miniConfig.width !== undefined) {
    if (miniConfig.width < 512 || miniConfig.width > 2048 || miniConfig.width % 8 !== 0) {
      throw new Error("width must be between 512 and 2048, and divisible by 8");
    }
  }
  if (miniConfig.height !== undefined) {
    if (miniConfig.height < 512 || miniConfig.height > 2048 || miniConfig.height % 8 !== 0) {
      throw new Error("height must be between 512 and 2048, and divisible by 8");
    }
  }

  if (miniConfig.n < 1 || miniConfig.n > 9 || !Number.isInteger(miniConfig.n)) {
    throw new Error("n must be an integer between 1 and 9");
  }

  if (miniConfig.styleWeight !== undefined) {
    if (miniConfig.styleWeight <= 0 || miniConfig.styleWeight > 1) {
      throw new Error("style_weight must be in the range (0, 1]");
    }
  }

  if (req.count !== undefined) {
    if (req.count < 1 || req.count > 9 || !Number.isInteger(req.count)) {
      throw new Error("count must be an integer between 1 and 9");
    }
  }

  if (req.size && !req.inputImages?.length) {
    throw new Error("size parameter is not supported for text-to-image generation");
  }

  const body: Record<string, unknown> = {
    model: effectiveModel,
    prompt: req.prompt,
    response_format: miniConfig.responseFormat,
    n: miniConfig.n,
    prompt_optimizer: miniConfig.promptOptimizer,
    aigc_watermark: miniConfig.aigcWatermark,
  };

  if (effectiveModel === "image-01") {
    if (req.aspectRatio) {
      body.aspect_ratio = req.aspectRatio;
    } else if (miniConfig.width && miniConfig.height) {
      body.width = miniConfig.width;
      body.height = miniConfig.height;
    } else {
      body.aspect_ratio = miniConfig.aspectRatio;
    }
  }

  if (effectiveModel === "image-01-live") {
    if (req.aspectRatio === "21:9" || miniConfig.aspectRatio === "21:9") {
      throw new Error("aspect_ratio '21:9' is only supported for image-01 model, not image-01-live");
    }
    if (req.aspectRatio) {
      body.aspect_ratio = req.aspectRatio;
    } else {
      body.aspect_ratio = miniConfig.aspectRatio;
    }
  }

  if (effectiveModel === "image-01-live" && miniConfig.style) {
    const style: Record<string, unknown> = { style_type: miniConfig.style };
    if (miniConfig.styleWeight !== undefined) {
      style.style_weight = miniConfig.styleWeight;
    }
    body.style = style;
  }

  if (miniConfig.seed !== undefined) {
    body.seed = miniConfig.seed;
  }

  if (req.count) {
    body.n = req.count;
  }

  if (req.inputImages && req.inputImages.length > 0) {
    if (effectiveModel === "image-01") {
      const firstImage = req.inputImages[0];
      const inferredDimensions = getImageDimensions(firstImage.buffer);
      if (inferredDimensions) {
        body.aspect_ratio = mapToClosestAspectRatio(inferredDimensions.width, inferredDimensions.height);
      }
    }

    body.subject_reference = req.inputImages.map(img => {
      const mimeType = (img.mimeType || "image/png").toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        throw new Error(
          `Unsupported image type: ${mimeType}. Supported: JPG, JPEG, PNG`
        );
      }
      if (img.buffer.length > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image size exceeds 10MB limit: ${(img.buffer.length / 1024 / 1024).toFixed(2)}MB`
        );
      }
      const base64 = img.buffer.toString("base64");
      return { type: "character" as const, image_file: `data:${mimeType};base64,${base64}` };
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolvedApiKey}`,
    },
    body: JSON.stringify(body),
    signal: req.timeoutMs
      ? AbortSignal.timeout(req.timeoutMs)
      : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `MiniMax API HTTP error (${response.status}): ${errorText}`
    );
  }

  const data = await response.json() as {
    data?: {
      image_urls?: string[];
      image_base64?: string[];
    };
    items?: Array<{
      url?: string;
      base64?: string;
    }>;
    metadata?: {
      success_count?: number | string;
      failed_count?: number | string;
    };
    id?: string;
    base_resp?: {
      status_code: number;
      status_msg: string;
    };
    code?: string;
    msg?: string;
  };

  if (data.base_resp && data.base_resp.status_code !== 0) {
    throw parseMiniMaxError(data);
  }
  if (data.code && data.code !== "200") {
    throw parseMiniMaxError(data);
  }

  const images: GeneratedImageAsset[] = [];

  if (data.data?.image_urls && data.data.image_urls.length > 0) {
    for (const imageUrl of data.data.image_urls) {
      const { buffer, mimeType } = await downloadImage(imageUrl, req.timeoutMs);
      images.push({ buffer, mimeType });
    }
  } else if (data.data?.image_base64 && data.data.image_base64.length > 0) {
    for (const base64 of data.data.image_base64) {
      const mimeType = detectMimeType(base64);
      images.push({
        buffer: Buffer.from(base64, "base64"),
        mimeType,
      });
    }
  } else if (data.items && Array.isArray(data.items) && data.items.length > 0) {
    for (const item of data.items) {
      if (item.base64) {
        const mimeType = detectMimeType(item.base64);
        images.push({
          buffer: Buffer.from(item.base64, "base64"),
          mimeType,
        });
      } else if (item.url) {
        const { buffer, mimeType } = await downloadImage(item.url, req.timeoutMs);
        images.push({ buffer, mimeType });
      }
    }
  }

  if (images.length === 0) {
    throw new Error("No images returned from MiniMax API");
  }

  const finalAspectRatio = (body.aspect_ratio as string) || miniConfig.aspectRatio;

  return {
    images,
    model: effectiveModel,
    metadata: {
      endpoint: miniConfig.endpoint,
      aspectRatio: finalAspectRatio,
      count: images.length,
      successCount: typeof data.metadata?.success_count === "number"
        ? data.metadata.success_count
        : images.length,
      failedCount: typeof data.metadata?.failed_count === "number"
        ? data.metadata.failed_count
        : 0,
      taskId: data.id,
      agentDir: req.agentDir,
      hasOpenClawConfig: Boolean(req.cfg),
    },
  };
}
