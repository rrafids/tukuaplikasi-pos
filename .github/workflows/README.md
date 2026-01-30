# Cuslabs POS – GitHub Actions workflows

These workflows build **Windows** and **Android** (Tauri) from this project, following the pos-inventory-app pipeline style.

- **build-windows.yml** – Windows (push/PR/main + manual)
- **build-android.yml** – Android release APK (push/PR/main + manual)
- **build-all-platforms.yml** – Windows + Android in parallel
- **build-windows-simple.yml** – Windows, manual only
- **build-android-debug.yml** – Android debug APK, manual only

**Important:** GitHub only runs workflows from the **repository root** `.github/workflows/`. So:

- If **this folder is the repo root** (cuslabs-pos as its own repo), these workflows will run as-is.
- If this app lives under a **monorepo** (e.g. `apps/cuslabs-pos/`), copy or symlink these files into the **root** `.github/workflows/` and add `defaults.run.working-directory: apps/cuslabs-pos` plus path prefixes like `apps/cuslabs-pos/src-tauri/...` in each workflow so they run from the monorepo root.
