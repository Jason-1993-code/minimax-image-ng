/**
 * MiniMax Image Generation Plugin for OpenClaw
 *
 * This plugin adds MiniMax text-to-image generation capabilities to OpenClaw.
 * Supports both Global (api.minimax.io) and CN (api.minimaxi.com) endpoints.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { ImageGenerationProvider } from "openclaw/plugin-sdk/image-generation";
import { CAPABILITIES, generateImage } from "./image-generation.js";

/**
 * Plugin configuration type (matches openclaw.plugin.json schema)
 */
export interface MiniMaxImagePluginConfig {
  apiKey?: string;
  endpoint?: "global" | "cn";
  model?: "image-01" | "image-01-live";
  aspectRatio?: string;
  responseFormat?: "url" | "base64";
  n?: number;
  promptOptimizer?: boolean;
  aigcWatermark?: boolean;
  style?: string;
  styleWeight?: number;
  width?: number;
  height?: number;
  seed?: number;
}

export default definePluginEntry({
  id: "minimax-image",
  name: "MiniMax Image",
  description: "MiniMax image generation provider (text-to-image and image-to-image)",
  register(api) {
    // Register the MiniMax image generation provider
    const provider: ImageGenerationProvider = {
      id: "minimax-image",
      label: "MiniMax Image",
      defaultModel: "image-01",
      models: ["image-01", "image-01-live"],
      capabilities: CAPABILITIES,

      // Main generation function
      generateImage: async (req) => {
        // Get plugin config from api.config
        const pluginConfig = api.pluginConfig as MiniMaxImagePluginConfig | undefined;

        const config: Record<string, unknown> = {
          endpoint: pluginConfig?.endpoint || "global",
          model: pluginConfig?.model || "image-01",
          aspectRatio: pluginConfig?.aspectRatio || "1:1",
          responseFormat: pluginConfig?.responseFormat || "url",
          n: pluginConfig?.n || 1,
          promptOptimizer: pluginConfig?.promptOptimizer || false,
          aigcWatermark: pluginConfig?.aigcWatermark || false,
        };

        if (pluginConfig?.apiKey) {
          config.apiKey = pluginConfig.apiKey;
        }

        if (pluginConfig?.style) {
          config.style = pluginConfig.style;
        }
        if (pluginConfig?.styleWeight !== undefined) {
          config.styleWeight = pluginConfig.styleWeight;
        }
        if (pluginConfig?.width) {
          config.width = pluginConfig.width;
        }
        if (pluginConfig?.height) {
          config.height = pluginConfig.height;
        }
        if (pluginConfig?.seed !== undefined) {
          config.seed = pluginConfig.seed;
        }

        return generateImage(req, config, pluginConfig?.apiKey);
      },
    };

    api.registerImageGenerationProvider(provider);
  },
});
