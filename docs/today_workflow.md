# Today Workflow

## 1. Put raw footage in the raw folder

Store untouched client footage in `input/raw/{project_or_client}/`.

Example:

```text
input/raw/acme-launch/
```

## 2. Build a selects folder fast

Copy only the usable clips you want to cut today into `input/selects/{project_or_client}/`.

Use filename prefixes like `01_`, `02_`, `03_` to control sequence order.

Example:

```text
input/selects/acme-launch/01_hook.mp4
input/selects/acme-launch/02_result.mp4
input/selects/acme-launch/03_broll.mp4
```

## 3. Optional metadata

If you want a top title or different clip cap, add `input/metadata/{project_or_client}.json`.

Start from [`input/metadata/demo.json`](/Users/brianackley/my-video/input/metadata/demo.json).

## 4. Render from repo root

Run:

```bash
npm run render:vertical -- acme-launch
```

For the included example pattern:

```bash
npm run render:demo
```

This command:

1. Reads clips from `input/selects/{project_or_client}/`
2. Builds one `vertical-core` Remotion render input
3. Renders a 1080x1920 short-form export

## 5. Where exports land

Exports land in:

```text
output/vertical/{project_or_client}/vertical-core.mp4
```

## 6. What to sell

Sell a repeatable short-form editing service:

- client sends raw footage
- you pull fast selects
- you deliver ready-to-post vertical cuts

Offer details live in [`docs/offer.md`](/Users/brianackley/my-video/docs/offer.md).
