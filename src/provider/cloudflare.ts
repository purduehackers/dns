import { DnsRecordType } from "../enums.ts";
import { ProviderError } from "../errors.ts";
import type { DnsProvider, DnsRecord } from "../types.ts";

const API_BASE = "https://api.cloudflare.com/client/v4";

interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  proxiable?: boolean;
  priority?: number;
  comment?: string;
  data?: {
    weight?: number;
    port?: number;
    target?: string;
  };
  meta?: Record<string, unknown>;
}

interface CfResponse<T> {
  success: boolean;
  errors: { message: string }[];
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

export class CloudflareProvider implements DnsProvider {
  name = "cloudflare";
  private token: string;
  private zoneIdCache = new Map<string, string>();

  constructor(token?: string) {
    this.token = token ?? process.env.CLOUDFLARE_API_TOKEN ?? "";
    if (!this.token) {
      throw new ProviderError("CLOUDFLARE_API_TOKEN not set", {
        hint: "Set it in .env or pass it to the provider",
      });
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Content-Type", "application/json");

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    const json = (await res.json()) as CfResponse<T>;
    if (!json.success) {
      const msgs = json.errors.map((e) => e.message).join(", ");
      throw new ProviderError("Cloudflare API error", { path, errors: msgs });
    }
    return json.result;
  }

  private async getZoneId(zone: string): Promise<string> {
    const cached = this.zoneIdCache.get(zone);
    if (cached) return cached;

    const result = await this.request<{ id: string }[]>(`/zones?name=${encodeURIComponent(zone)}`);
    if (result.length === 0) {
      throw new ProviderError("Zone not found in Cloudflare", { zone });
    }
    const id = result[0]!.id;
    this.zoneIdCache.set(zone, id);
    return id;
  }

  private cfToRecord(cf: CfDnsRecord, zone: string): DnsRecord {
    const name = cf.name === zone ? "@" : cf.name.replace(`.${zone}`, "");
    const record: DnsRecord = {
      name,
      type: cf.type as DnsRecordType,
      value: cf.type === "TXT" ? this.rejoinTxtChunks(cf.content) : cf.content,
      ttl: cf.ttl,
    };
    if (cf.proxied) record.proxied = true;
    if (cf.priority !== undefined) record.priority = cf.priority;
    if (cf.data?.weight !== undefined) record.weight = cf.data.weight;
    if (cf.data?.port !== undefined) record.port = cf.data.port;
    // Preserve CF comment, or detect managed records by content
    if (cf.comment) {
      record.comment = cf.comment;
    } else {
      const managed = this.detectManagedRecord(cf);
      if (managed) record.comment = managed;
    }
    return record;
  }

  private detectManagedRecord(cf: CfDnsRecord): string | null {
    const meta = cf.meta;
    if (!meta) return null;
    if (meta.origin_worker_id) return "Managed by Cloudflare Workers";
    if (meta.r2_bucket) return "Managed by Cloudflare R2";
    if (meta.managed_by_argo_tunnel) return "Managed by Cloudflare Tunnel";
    if (meta.email_routing) return "Managed by Cloudflare Email Routing";
    if (cf.content.endsWith(".pages.dev") && meta.read_only) return "Managed by Cloudflare Pages";
    return null;
  }

  /** CF splits long TXT records into multiple quoted chunks — rejoin them */
  private rejoinTxtChunks(value: string): string {
    if (!value.includes('" "')) return value;
    // "chunk1" "chunk2" → "chunk1chunk2"
    const inner = value
      .split('" "')
      .map((part) => part.replace(/^"|"$/g, ""))
      .join("");
    return `"${inner}"`;
  }

  private recordToCf(record: DnsRecord, zone: string): Record<string, unknown> {
    const name = record.name === "@" ? zone : `${record.name}.${zone}`;
    const body: Record<string, unknown> = {
      type: record.type,
      name,
      content: record.value,
      ttl: record.ttl,
      proxied: record.proxied ?? false,
    };
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.comment) body.comment = record.comment;
    if (record.type === DnsRecordType.SRV && record.weight !== undefined) {
      body.data = {
        weight: record.weight,
        port: record.port,
        target: record.value,
        priority: record.priority,
      };
    }
    return body;
  }

  async listRecords(zone: string): Promise<DnsRecord[]> {
    const zoneId = await this.getZoneId(zone);
    const records: DnsRecord[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const path = `/zones/${zoneId}/dns_records?page=${page}&per_page=${perPage}`;
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${this.token}`);
      headers.set("Content-Type", "application/json");

      const res = await fetch(`${API_BASE}${path}`, { headers });
      const json = (await res.json()) as CfResponse<CfDnsRecord[]>;
      if (!json.success) {
        const msgs = json.errors.map((e) => e.message).join(", ");
        throw new ProviderError("Cloudflare API error", {
          path,
          errors: msgs,
        });
      }

      for (const cf of json.result) {
        records.push(this.cfToRecord(cf, zone));
      }

      if (!json.result_info || page >= json.result_info.total_pages) {
        break;
      }
      page++;
    }

    return records;
  }

  async createRecord(zone: string, record: DnsRecord): Promise<void> {
    const zoneId = await this.getZoneId(zone);
    const body = this.recordToCf(record, zone);
    await this.request(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateRecord(zone: string, existing: DnsRecord, desired: DnsRecord): Promise<void> {
    const zoneId = await this.getZoneId(zone);
    const cfId = await this.findRecordId(zoneId, zone, existing);
    const body = this.recordToCf(desired, zone);
    await this.request(`/zones/${zoneId}/dns_records/${cfId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteRecord(zone: string, record: DnsRecord): Promise<void> {
    const zoneId = await this.getZoneId(zone);
    const cfId = await this.findRecordId(zoneId, zone, record);
    await this.request(`/zones/${zoneId}/dns_records/${cfId}`, {
      method: "DELETE",
    });
  }

  private async findRecordId(zoneId: string, zone: string, record: DnsRecord): Promise<string> {
    const name = record.name === "@" ? zone : `${record.name}.${zone}`;
    const result = await this.request<CfDnsRecord[]>(
      `/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(name)}`,
    );
    const match = result.find((r) => r.content === record.value);
    if (!match) {
      throw new ProviderError("Could not find Cloudflare record", {
        type: record.type,
        name,
        value: record.value,
      });
    }
    return match.id;
  }
}
