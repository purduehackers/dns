/** Base error with structured metadata for CLI display */
export class DnsError extends Error {
  metadata: Record<string, unknown>;

  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message);
    this.name = "DnsError";
    this.metadata = metadata;
  }
}

/** Config file missing or malformed */
export class ConfigError extends DnsError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
    this.name = "ConfigError";
  }
}

/** Zone file missing or unparseable */
export class ZoneParseError extends DnsError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
    this.name = "ZoneParseError";
  }
}

/** Zone records failed validation */
export class ValidationError extends DnsError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
    this.name = "ValidationError";
  }
}

/** DNS provider API or configuration error */
export class ProviderError extends DnsError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
    this.name = "ProviderError";
  }
}

/** Delete threshold exceeded */
export class SafetyError extends DnsError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
    this.name = "SafetyError";
  }
}
