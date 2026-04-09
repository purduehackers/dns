import { test, expect, describe } from "bun:test";
import { loadConfig } from "./config.ts";
import { ConfigError } from "./errors.ts";

describe("loadConfig", () => {
  test("loads dns.yaml with all fields", async () => {
    const config = await loadConfig("dns.yaml");
    expect(config.settings.zones_dir).toBe("zones");
    expect(config.settings.delete_threshold).toBe(0.33);
    expect(config.settings.lenient).toBe(false);
    expect(config.providers.cloudflare).toEqual({ type: "cloudflare" });
  });

  test("throws ConfigError for missing file", async () => {
    expect(loadConfig("nonexistent.yaml")).rejects.toThrow(ConfigError);
  });

  test("applies defaults for missing settings", async () => {
    // Write a minimal config file
    const tmp = "fixtures/minimal-config.yaml";
    await Bun.write(tmp, "providers:\n  cloudflare:\n    type: cloudflare\n");
    try {
      const config = await loadConfig(tmp);
      expect(config.settings.zones_dir).toBe("zones");
      expect(config.settings.delete_threshold).toBe(0.33);
      expect(config.settings.lenient).toBe(false);
    } finally {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(tmp);
    }
  });

  test("applies defaults for partial settings", async () => {
    const tmp = "fixtures/partial-config.yaml";
    await Bun.write(tmp, "settings:\n  zones_dir: custom\n");
    try {
      const config = await loadConfig(tmp);
      expect(config.settings.zones_dir).toBe("custom");
      expect(config.settings.delete_threshold).toBe(0.33);
      expect(config.settings.lenient).toBe(false);
      expect(config.providers).toEqual({});
    } finally {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(tmp);
    }
  });
});
