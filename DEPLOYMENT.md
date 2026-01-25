# Deployment Guide - Database Setup

## How Database Path Works

The database path is **automatically handled by Tauri** and works on all platforms without any code changes.

### Database Location by Platform

- **macOS (Development)**: `~/Library/Application Support/com.tauri.dev/satria_pos.db`
- **macOS (Production)**: `~/Library/Application Support/com.satria.pos/satria_pos.db`
- **Windows (Development)**: `%APPDATA%\com.tauri.dev\satria_pos.db` 
  - Full path example: `C:\Users\Username\AppData\Roaming\com.tauri.dev\satria_pos.db`
- **Windows (Production)**: `%APPDATA%\com.satria.pos\satria_pos.db`
  - Full path example: `C:\Users\Username\AppData\Roaming\com.satria.pos\satria_pos.db`
- **Linux (Development)**: `~/.config/com.tauri.dev/satria_pos.db`
- **Linux (Production)**: `~/.config/com.satria.pos/satria_pos.db`

### No Configuration Needed!

The code uses `sqlite:satria_pos.db` which Tauri automatically resolves to the correct app data directory based on:
1. The platform (Windows/macOS/Linux)
2. The `identifier` in `tauri.conf.json`

## Production Setup

### 1. Update App Identifier (Recommended)

Before building for production, update `src-tauri/tauri.conf.json`:

```json
{
  "identifier": "com.satria.pos"  // Change from "com.tauri.dev"
}
```

This ensures:
- Professional app identifier
- Separate data directory from dev builds
- Better organization on client machines

### 2. Build for Windows

```bash
yarn tauri build --target x86_64-pc-windows-msvc
```

The database will automatically be created in:
```
C:\Users\{Username}\AppData\Roaming\com.satria.pos\satria_pos.db
```

### 3. Initial Database Setup

The app automatically:
- ✅ Creates the database file on first launch
- ✅ Creates the `products` table if it doesn't exist
- ✅ Seeds with demo products if the database is empty

**No manual setup required!** The database is created automatically when the app first runs.

### 4. Finding the Database on Client Machines

#### Windows
1. Open File Explorer
2. Navigate to: `%APPDATA%\com.satria.pos\`
3. Or type in address bar: `%APPDATA%\com.satria.pos\satria_pos.db`

#### macOS
1. Open Finder
2. Press `Cmd+Shift+G`
3. Type: `~/Library/Application Support/com.satria.pos/`
4. Find `satria_pos.db`

#### Linux
1. Open file manager
2. Navigate to: `~/.config/com.satria.pos/`
3. Find `satria_pos.db`

### 5. Opening in DBeaver (for support/debugging)

1. Close the app first (to release database lock)
2. In DBeaver:
   - New Database Connection → SQLite
   - Path: Use the full absolute path (see above)
   - Example Windows: `C:\Users\Username\AppData\Roaming\com.satria.pos\satria_pos.db`
   - Example macOS: `/Users/username/Library/Application Support/com.satria.pos/satria_pos.db`

### 6. Database Backup/Migration

If you need to backup or migrate data:

```bash
# Windows (PowerShell)
Copy-Item "$env:APPDATA\com.satria.pos\satria_pos.db" "backup.db"

# macOS/Linux
cp ~/Library/Application\ Support/com.satria.pos/satria_pos.db backup.db
```

## Troubleshooting

### Database not found?
- Check the app data directory exists
- Verify the `identifier` in `tauri.conf.json` matches
- Check console logs (in dev mode, it shows the full path)

### Permission errors?
- Ensure the app has write permissions to the app data directory
- On Windows, user should have admin rights if needed
- The directory is created automatically by Tauri

### Database locked?
- Close the app completely
- Wait a few seconds for WAL files to merge
- Or delete `.db-wal` and `.db-shm` files (they'll be recreated)

## Notes

- ✅ **No manual database setup needed** - everything is automatic
- ✅ **Works on all platforms** - Tauri handles path resolution
- ✅ **Data persists** - stored in user's app data directory
- ✅ **Per-user** - each Windows user has their own database
- ✅ **Offline-first** - no internet required

