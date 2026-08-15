# Migrating from the pre-rename install

This CLI was renamed. Version 1.0.0 knows nothing about what the old name left on
disk — **there is no migration code**, deliberately: a migration that silently
moves files is a change you cannot review, and the only files involved are a
cache, a state directory, and a set of installed artifacts you can reinstall in
one command.

So this is a short cleanup you do yourself, once.

## 1. Remove the old installed artifacts

If you installed the kit under the old name, its files are still in your provider
directories. Uninstall with the **old** binary if you still have it — that reads
its own receipt and removes exactly what it wrote:

```bash
vc uninstall --provider claude-code          # repeat per provider, add --global for the ~/ scope
```

If the old binary is gone, remove the artifacts by hand. They live under the
provider trees the old install used, and the receipt that lists them is at
`.vcskill/receipt.json` in each project (and `~/.vcskill/receipt.json` for global
installs). That file names every path it wrote, so it is the accurate list:

```bash
python3 -c "import json,sys; [print(f['path']) for i in json.load(open('.vcskill/receipt.json'))['installs'].values() for f in i['files']]"
```

## 2. Remove the old state and cache

```bash
rm -rf ~/.vcskill          # receipts, history, backups, run state
rm -rf ~/.cache/vcskill    # extracted kit cache, keyed by the old build
```

Nothing reads these any more. The new locations are `~/.ariadnev` and
`~/.cache/ariadnev`.

## 3. Remove the old binary and alias

```bash
rm -f ~/.local/bin/vc ~/.local/bin/vcskill
```

On Windows, delete `%LOCALAPPDATA%\Programs\vcskill`.

## 4. Install again

```bash
curl -fsSL https://ariadnev.com/install | bash
ariadnev install
```

## What is not carried over

- **Old receipts.** The new CLI writes its own at `.ariadnev/receipt.json`. It
  will not read a `.vcskill` receipt, so an install under the new name does not
  know about files the old one left — which is why step 1 comes first.
- **Old backups.** `~/.vcskill/backups` is not read by `ariadnev backups`. Copy
  anything you want to keep before deleting the directory.
- **Old config.** The new config lives at `~/.ariadnev/config.json` with a
  different shape; see [the configuration section](../README.md#configuration).
  Nothing is read from the old location.

## If you skip this

The old files are inert — no process reads them — but they are still in your
provider directories, where the model will read them as instructions alongside
the new ones. Two versions of the same skill in one `skills/` directory is the
problem worth avoiding here, not the disk space.
