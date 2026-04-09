import { test, expect, describe } from "bun:test";
import { ProviderError } from "../errors.ts";
import { createProvider } from "./registry.ts";

describe("createProvider", () => {
  test("creates cloudflare provider", () => {
    // CloudflareProvider checks for CLOUDFLARE_API_TOKEN, set it temporarily
    const orig = process.env.CLOUDFLARE_API_TOKEN;
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    try {
      const provider = createProvider("cloudflare", { type: "cloudflare" });
      expect(provider.name).toBe("cloudflare");
    } finally {
      if (orig === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = orig;
    }
  });

  test("throws on unknown provider type", () => {
    expect(() => createProvider("foo", { type: "route53" })).toThrow(ProviderError);
  });
});
