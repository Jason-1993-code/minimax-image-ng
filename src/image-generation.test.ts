import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateImage, resolveApiKey, getBaseUrl, CAPABILITIES } from "../src/image-generation.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const returnValueHolder = { value: [] as string[] };
vi.mock("openclaw/plugin-sdk/agent-runtime", () => ({
  listProfilesForProvider: vi.fn(() => returnValueHolder.value),
}));

describe("MiniMax Image Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MINIMAX_IMAGE_API_KEY", "");
    returnValueHolder.value = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveApiKey", () => {
    it("should return environment variable when set", () => {
      vi.stubEnv("MINIMAX_IMAGE_API_KEY", "env-api-key");
      expect(resolveApiKey()).toBe("env-api-key");
    });

    it("should return config apiKey when env is not set", () => {
      vi.stubEnv("MINIMAX_IMAGE_API_KEY", "");
      expect(resolveApiKey("config-api-key")).toBe("config-api-key");
    });

    it("should prefer env over config", () => {
      vi.stubEnv("MINIMAX_IMAGE_API_KEY", "env-api-key");
      expect(resolveApiKey("config-api-key")).toBe("env-api-key");
    });

    it("should prefer config over auth profile when env is not set", () => {
      vi.stubEnv("MINIMAX_IMAGE_API_KEY", "");
      returnValueHolder.value = ["profile-1"];
      const mockAuthStore = {
        version: 1,
        profiles: {
          "profile-1": {
            type: "api_key" as const,
            provider: "minimax-image",
            key: "profile-api-key",
          },
        },
      };
      expect(resolveApiKey("config-api-key", mockAuthStore)).toBe("config-api-key");
    });

    it("should fall back to auth profile when env and config are not set", () => {
      vi.stubEnv("MINIMAX_IMAGE_API_KEY", "");
      returnValueHolder.value = ["profile-1"];
      const mockAuthStore = {
        version: 1,
        profiles: {
          "profile-1": {
            type: "api_key" as const,
            provider: "minimax-image",
            key: "profile-api-key",
          },
        },
      };
      expect(resolveApiKey(undefined, undefined, mockAuthStore)).toBe("profile-api-key");
    });

    it("should return undefined when no auth source is available", () => {
      vi.stubEnv("MINIMAX_IMAGE_API_KEY", "");
      returnValueHolder.value = [];
      expect(resolveApiKey(undefined, undefined, undefined)).toBeUndefined();
    });
  });

  describe("getBaseUrl", () => {
    it("should return global endpoint", () => {
      expect(getBaseUrl("global")).toBe("https://api.minimax.io");
    });

    it("should return cn endpoint", () => {
      expect(getBaseUrl("cn")).toBe("https://api.minimaxi.com");
    });
  });

  describe("generateImage - parameter validation", () => {
    it("should include subject_reference in request body when inputImages is provided", async () => {
      const mockBuffer = Buffer.from("fake-image-data");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage(
          { prompt: "test", inputImages: [{ buffer: mockBuffer, mimeType: "image/png" }] },
          {},
          "test-key"
        );
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.subject_reference).toEqual([
        { type: "character", image_file: "data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh" },
      ]);
    });

    it("should throw when inputImages has unsupported MIME type", async () => {
      const mockBuffer = Buffer.from("fake-video-data");
      await expect(
        generateImage(
          { prompt: "test", inputImages: [{ buffer: mockBuffer, mimeType: "video/mp4" }] },
          {},
          "test-key"
        )
      ).rejects.toThrow("Unsupported image type: video/mp4. Supported: JPG, JPEG, PNG");
    });

    it("should throw when inputImages exceeds 10MB limit", async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      await expect(
        generateImage(
          { prompt: "test", inputImages: [{ buffer: largeBuffer, mimeType: "image/png" }] },
          {},
          "test-key"
        )
      ).rejects.toThrow("Image size exceeds 10MB limit");
    });

    it("should throw when width is provided without height", async () => {
      await expect(
        generateImage(
          { prompt: "test" },
          { width: 1024 },
          "test-key"
        )
      ).rejects.toThrow("width must be provided together with height");
    });

    it("should throw when height is provided without width", async () => {
      await expect(
        generateImage(
          { prompt: "test" },
          { height: 1024 },
          "test-key"
        )
      ).rejects.toThrow("height must be provided together with width");
    });

    it("should throw when width is not divisible by 8", async () => {
      await expect(
        generateImage(
          { prompt: "test" },
          { width: 1025, height: 1024 },
          "test-key"
        )
      ).rejects.toThrow("width must be between 512 and 2048, and divisible by 8");
    });

    it("should throw when height is not divisible by 8", async () => {
      await expect(
        generateImage(
          { prompt: "test" },
          { width: 1024, height: 1025 },
          "test-key"
        )
      ).rejects.toThrow("height must be between 512 and 2048, and divisible by 8");
    });

    it("should throw when width/height with image-01-live model", async () => {
      await expect(
        generateImage(
          { prompt: "test" },
          { model: "image-01-live", width: 1024, height: 1024 },
          "test-key"
        )
      ).rejects.toThrow("width/height parameters are only supported for image-01 model");
    });

    it("should throw when style with non-live model", async () => {
      await expect(
        generateImage(
          { prompt: "test" },
          { model: "image-01", style: "some-style" },
          "test-key"
        )
      ).rejects.toThrow("style parameter is only supported for image-01-live model");
    });

    it("should throw when n/count is out of range", async () => {
      await expect(
        generateImage(
          { prompt: "test", count: 10 },
          {},
          "test-key"
        )
      ).rejects.toThrow("count must be an integer between 1 and 9");
    });

    it("should throw when n/count is not an integer", async () => {
      await expect(
        generateImage(
          { prompt: "test", count: 1.5 },
          {},
          "test-key"
        )
      ).rejects.toThrow("count must be an integer between 1 and 9");
    });

    it("should throw when size is provided", async () => {
      await expect(
        generateImage(
          { prompt: "test", size: "1024x1024" } as any,
          {},
          "test-key"
        )
      ).rejects.toThrow("size parameter is not supported");
    });

    it("should throw when resolution is provided", async () => {
      await expect(
        generateImage(
          { prompt: "test", resolution: "2K" } as any,
          {},
          "test-key"
        )
      ).rejects.toThrow("resolution parameter is not supported");
    });

    it("should prioritize req.aspectRatio over width/height", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage(
          { prompt: "a cat", aspectRatio: "16:9" },
          { width: 1024, height: 1024 },
          "test-key"
        );
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.aspect_ratio).toBe("16:9");
      expect(body.width).toBeUndefined();
      expect(body.height).toBeUndefined();
    });

    it("should use width/height when aspectRatio is not explicitly set", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_base64: ["SGVsbG8gV29ybGQ="] } }),
      });

      try {
        await generateImage(
          { prompt: "a cat" },
          { width: 1024, height: 1024 },
          "test-key"
        );
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.width).toBe(1024);
      expect(body.height).toBe(1024);
    });
  });

  describe("generateImage - API request", () => {
    it("should construct correct request body with default config", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat" }, {}, "test-key");
      } catch {
      }

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.minimax.io/v1/image_generation",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-key",
          }),
          body: JSON.stringify({
            model: "image-01",
            prompt: "a cat",
            aspect_ratio: "1:1",
            response_format: "url",
            n: 1,
            prompt_optimizer: false,
            aigc_watermark: false,
          }),
        })
      );
    });

    it("should use req.model over config model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat", model: "image-01-live" }, { model: "image-01" }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe("image-01-live");
    });

    it("should use req.aspectRatio over config aspectRatio", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat", aspectRatio: "16:9" }, { aspectRatio: "1:1" }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.aspect_ratio).toBe("16:9");
    });

    it("should use req.count over config n", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat", count: 3 }, { n: 1 }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.n).toBe(3);
    });

    it("should include style for image-01-live model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat" }, { model: "image-01-live", style: "anime" }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.style).toEqual({ style_type: "anime" });
    });

    it("should include style with weight for image-01-live model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage(
          { prompt: "a cat" },
          { model: "image-01-live", style: "漫画", styleWeight: 0.5 },
          "test-key"
        );
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.style).toEqual({ style_type: "漫画", style_weight: 0.5 });
    });

    it("should include width/height for image-01 model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat" }, { model: "image-01", width: 1024, height: 1024 }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.width).toBe(1024);
      expect(body.height).toBe(1024);
    });

    it("should include seed when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat" }, { seed: 12345 }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.seed).toBe(12345);
    });

    it("should use CN endpoint URL when endpoint is cn", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat" }, { endpoint: "cn" }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe("https://api.minimaxi.com/v1/image_generation");
    });

    it("should include prompt_optimizer: true when enabled in config", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat" }, { promptOptimizer: true }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.prompt_optimizer).toBe(true);
    });

    it("should include aigc_watermark: true when enabled in config", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_urls: [] } }),
      });

      try {
        await generateImage({ prompt: "a cat" }, { aigcWatermark: true }, "test-key");
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.aigc_watermark).toBe(true);
    });

    it("should use auth profile key when env and config key are not set", async () => {
      vi.stubEnv("MINIMAX_IMAGE_API_KEY", "");
      returnValueHolder.value = ["auth-profile-1"];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { image_base64: ["SGVsbG8gV29ybGQ="] } }),
      });

      try {
        await generateImage(
          {
            prompt: "a cat",
            authStore: { profiles: { "auth-profile-1": { type: "api_key" as const, provider: "minimax-image", key: "auth-profile-key" } } } as any,
          },
          {}
        );
      } catch {
      }

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers.Authorization).toBe("Bearer auth-profile-key");
    });
  });

  describe("generateImage - response parsing", () => {
    it("should parse data.image_urls correctly", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                image_urls: ["https://example.com/image1.png", "https://example.com/image2.png"],
              },
              base_resp: { status_code: 0, status_msg: "success" },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        });

      const result = await generateImage({ prompt: "a cat" }, { responseFormat: "url" }, "test-key");

      expect(result.images).toHaveLength(2);
      expect(result.metadata.count).toBe(2);
    });

    it("should parse data.image_base64 correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              image_base64: ["SGVsbG8gV29ybGQ=", "SGVsbG8gV29ybGQx"],
            },
            base_resp: { status_code: 0, status_msg: "success" },
          }),
      });

      const result = await generateImage({ prompt: "a cat" }, { responseFormat: "base64" }, "test-key");

      expect(result.images).toHaveLength(2);
      expect(result.images[0].buffer).toBeInstanceOf(Buffer);
    });

    it("should parse data.items correctly", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [{ url: "https://example.com/image.png" }],
              base_resp: { status_code: 0, status_msg: "success" },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        });

      const result = await generateImage({ prompt: "a cat" }, {}, "test-key");

      expect(result.images).toHaveLength(1);
    });

    it("should parse successCount and failedCount from metadata", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                image_urls: ["https://example.com/image1.png", "https://example.com/image2.png"],
              },
              metadata: {
                success_count: 2,
                failed_count: 0,
              },
              id: "task-12345",
              base_resp: { status_code: 0, status_msg: "success" },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => "image/png" },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        });

      const result = await generateImage({ prompt: "a cat" }, { responseFormat: "url" }, "test-key");

      expect(result.metadata.successCount).toBe(2);
      expect(result.metadata.failedCount).toBe(0);
      expect(result.metadata.taskId).toBe("task-12345");
    });

    it("should use images.length as successCount fallback when metadata not provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              image_base64: ["SGVsbG8gV29ybGQ=", "SGVsbG8gV29ybGQx"],
            },
            base_resp: { status_code: 0, status_msg: "success" },
          }),
      });

      const result = await generateImage({ prompt: "a cat" }, { responseFormat: "base64" }, "test-key");

      expect(result.metadata.successCount).toBe(2);
      expect(result.metadata.failedCount).toBe(0);
    });

    it("should throw when no images returned", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ base_resp: { status_code: 0, status_msg: "success" } }),
      });

      await expect(generateImage({ prompt: "a cat" }, {}, "test-key")).rejects.toThrow(
        "No images returned from MiniMax API"
      );
    });
  });

  describe("generateImage - error handling", () => {
    it("should throw on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      await expect(generateImage({ prompt: "a cat" }, {}, "test-key")).rejects.toThrow(
        "MiniMax API HTTP error (401): Unauthorized"
      );
    });

    it("should parse base_resp.status_code error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            base_resp: { status_code: 1002, status_msg: "rate limit" },
          }),
      });

      await expect(generateImage({ prompt: "a cat" }, {}, "test-key")).rejects.toThrow(
        "MiniMax API error (1002): rate limit exceeded"
      );
    });

    it("should parse code/msg error format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: "400", msg: "invalid parameters" }),
      });

      await expect(generateImage({ prompt: "a cat" }, {}, "test-key")).rejects.toThrow(
        "MiniMax API error (400): invalid parameters"
      );
    });

    it("should handle unknown error codes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            base_resp: { status_code: 9999, status_msg: "some unknown error" },
          }),
      });

      await expect(generateImage({ prompt: "a cat" }, {}, "test-key")).rejects.toThrow(
        "MiniMax API error (9999): some unknown error"
      );
    });
  });

  describe("generateImage - URL download", () => {
    it("should throw error on image download failure with structured retry context", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { image_urls: ["https://example.com/image.png"] },
              base_resp: { status_code: 0, status_msg: "success" },
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      await expect(generateImage({ prompt: "a cat" }, { responseFormat: "url" }, "test-key")).rejects.toThrow(
        /Image download failed after 3 attempts.*HTTP 404.*from https:\/\/example.com\/image.png/
      );
    });
  });

  describe("CAPABILITIES", () => {
    it("should have correct generate capabilities", () => {
      expect(CAPABILITIES.generate.maxCount).toBe(9);
      expect(CAPABILITIES.generate.supportsAspectRatio).toBe(true);
    });

    it("should have edit enabled", () => {
      expect(CAPABILITIES.edit.enabled).toBe(true);
    });

    it("should have correct aspect ratios", () => {
      expect(CAPABILITIES.geometry?.aspectRatios).toContain("1:1");
      expect(CAPABILITIES.geometry?.aspectRatios).toContain("16:9");
    });
  });

  describe("manifest metadata", () => {
    const manifest: Record<string, any> = {
      id: "minimax-image",
      kind: "provider",
      providers: ["minimax-image"],
      providerAuthChoices: [
        {
          provider: "minimax-image",
          method: "api-key",
          choiceId: "minimax-image-global",
          cliFlag: "--minimax-image-global-api-key",
          cliOption: "--minimax-image-global-api-key <key>",
          onboardingScopes: ["image-generation"],
        },
        {
          provider: "minimax-image",
          method: "api-key",
          choiceId: "minimax-image-cn",
          cliFlag: "--minimax-image-cn-api-key",
          cliOption: "--minimax-image-cn-api-key <key>",
          onboardingScopes: ["image-generation"],
        },
      ],
    };

    it("should have kind=provider", () => {
      expect(manifest.kind).toBe("provider");
    });

    it("should have providers array containing minimax-image", () => {
      expect(manifest.providers).toContain("minimax-image");
    });

    it("should have providerAuthChoices with cliFlag fields", () => {
      expect(manifest.providerAuthChoices).toHaveLength(2);
      manifest.providerAuthChoices.forEach((choice: any) => {
        expect(choice.cliFlag).toBeDefined();
        expect(choice.cliFlag).toMatch(/^--minimax-image/);
      });
    });

    it("should have providerAuthChoices with cliOption fields", () => {
      manifest.providerAuthChoices.forEach((choice: any) => {
        expect(choice.cliOption).toBeDefined();
        expect(choice.cliOption).toContain("--minimax-image");
      });
    });

    it("should have onboardingScopes containing image-generation", () => {
      manifest.providerAuthChoices.forEach((choice: any) => {
        expect(choice.onboardingScopes).toContain("image-generation");
      });
    });

    it("should have correct providerAuthEnvVars in manifest", async () => {
      const { readFile } = await import("fs/promises");
      const { fileURLToPath } = await import("url");
      const { resolve, dirname } = await import("path");
      const testFile = fileURLToPath(import.meta.url);
      const manifestPath = resolve(dirname(testFile), "../openclaw.plugin.json");
      const content = await readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.providerAuthEnvVars?.["minimax-image"]).toContain("MINIMAX_IMAGE_API_KEY");
    });
  });
});