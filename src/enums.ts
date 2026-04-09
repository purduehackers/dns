export enum DnsRecordType {
  A = "A",
  AAAA = "AAAA",
  CNAME = "CNAME",
  MX = "MX",
  TXT = "TXT",
  SRV = "SRV",
  NS = "NS",
  CAA = "CAA",
  PTR = "PTR",
}

export enum DiffAction {
  Create = "create",
  Update = "update",
  Delete = "delete",
  Noop = "noop",
}
