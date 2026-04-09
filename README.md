# @purduehackers/dns

GitOps DNS management for Purdue Hackers. DNS zones are defined as YAML files and deployed to Cloudflare via CI.

Inspired by [Hack Club DNS](https://github.com/hackclub/dns).

## How it works

Each domain gets a directory under `zones/`. Inside, `_zone.yaml` defines the provider and apex records, and each subdomain gets its own file (e.g. `www.yaml`, `api.yaml`).

```
zones/
  purduehackers.com/
    _zone.yaml          # provider, default TTL, apex records (A, MX, TXT)
    www.yaml            # CNAME for www
    api.yaml            # CNAME for api
    _vercel.yaml        # TXT verification records
  phack.rs/
    _zone.yaml
    ...
```

Changes are diffed against live DNS and applied automatically on push to `main`.

## Commands

```sh
bun run validate        # Parse and validate all zone files
bun run plan            # Dry-run: show diff between zone files and live DNS
bun run apply           # Deploy changes (with confirmation prompt)
bun run pull            # Pull live DNS state into zone files
```

All commands accept `--zone=<domain>` to target a single zone.

## Adding a DNS record

1. Create or edit a file under `zones/<domain>/`:
   ```yaml
   # zones/purduehackers.com/myapp.yaml
   records:
     - type: CNAME
       value: cname.vercel-dns.com
   ```
2. Commit and push. CI validates the zone files and deploys on merge to `main`.

The filename becomes the subdomain name. Apex records go in `_zone.yaml`.

## Zone file format

**`_zone.yaml`** (required per domain):

```yaml
provider: cloudflare
ttl: 1 # default TTL (1 = Cloudflare "automatic")

records: # apex (@) records
  - type: A
    value: 1.2.3.4
    ttl: 600
  - type: MX
    value: 10 mail.example.com
  - type: TXT
    value: '"v=spf1 ~all"'
```

**Subdomain files** (`<name>.yaml`):

```yaml
records:
  - type: CNAME
    value: cname.vercel-dns.com
```

Supported record types: `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`, `NS`, `CAA`, `PTR`.

## Safety

- **Delete threshold**: `apply` aborts if more than 33% of existing records would be deleted (configurable in `dns.yaml`)
- **Lenient mode**: When enabled, deletes are skipped entirely
- **Confirmation prompt**: `apply` requires interactive confirmation (use `--yes` to skip in CI)

## Setup

```sh
bun install
cp .env.example .env.local
# Add your CLOUDFLARE_API_TOKEN to .env.local
```

To pull existing DNS records into zone files for the first time:

```sh
bun run pull
```

## Configuration

`dns.yaml`:

```yaml
settings:
  zones_dir: zones
  delete_threshold: 0.33
  lenient: false

providers:
  cloudflare:
    type: cloudflare
```

## Development

```sh
bun test              # run tests
bun run coverage      # run tests with coverage
bun run lint          # lint with oxlint
bun run typecheck     # type-check with tsc
```
