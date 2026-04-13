# Delivery — 2026-04-12-2013

**Preset:** default
**Client:** test
**Packaged:** 2026-04-13T00:13:16.258Z

## Files

- `multi-default.mp4`
- `single-default.mp4`

## Reproduction

```bash
npm run preset -- default
npm run manifest
npm run render:multi
npm run render:variants
npm run deliver -- --client test
```
