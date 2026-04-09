import type { DnsRecordType, DiffAction } from "./enums.ts";

export interface DnsRecord {
  name: string; // "@" for apex, subdomain otherwise
  type: DnsRecordType;
  value: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
  weight?: number;
  port?: number;
  comment?: string;
}

export interface DnsProvider {
  name: string;
  listRecords(zone: string): Promise<DnsRecord[]>;
  createRecord(zone: string, record: DnsRecord): Promise<void>;
  updateRecord(zone: string, existing: DnsRecord, desired: DnsRecord): Promise<void>;
  deleteRecord(zone: string, record: DnsRecord): Promise<void>;
}

export interface DiffEntry {
  action: DiffAction;
  desired?: DnsRecord;
  existing?: DnsRecord;
}

export interface ExecutionPlan {
  zone: string;
  provider: string;
  entries: DiffEntry[];
  summary: {
    creates: number;
    updates: number;
    deletes: number;
    noops: number;
  };
}

export interface ProviderConfig {
  type: string;
}

export interface Settings {
  zones_dir: string;
  delete_threshold: number;
  lenient: boolean;
}

export interface Config {
  settings: Settings;
  providers: Record<string, ProviderConfig>;
}

export interface ParsedZone {
  domain: string;
  defaultTtl: number;
  provider: string;
  records: DnsRecord[];
}

export interface ValidationError {
  record: DnsRecord;
  message: string;
}
