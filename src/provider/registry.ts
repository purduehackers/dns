import { ProviderError } from "../errors.ts";
import type { DnsProvider, ProviderConfig } from "../types.ts";
import { CloudflareProvider } from "./cloudflare.ts";

export function createProvider(name: string, config: ProviderConfig): DnsProvider {
  if (config.type === "cloudflare") {
    return new CloudflareProvider();
  }
  throw new ProviderError("Unknown provider type", {
    type: config.type,
    name,
  });
}
