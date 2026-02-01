# Build Platforms Support

Cuslabs POS now supports building for multiple platforms:

## Supported Platforms

### ✅ Windows
Build Windows executable (.exe) - **Fully supported and tested**

```bash
npm run tauri:build:windows
```

Output: `src-tauri/target/x86_64-pc-windows-msvc/release/tukuaplikasi-pos.exe`

### ✅ Android
Build Android APK - **Newly added, ready to use**

```bash
# Initialize Android project (first time only)
npm run tauri:android:init

# Build release APK
npm run tauri:build:android

# Build debug APK
npm run tauri:build:android:debug

# Run in development mode
npm run tauri:android:dev
```

Output: `src-tauri/target/aarch64-linux-android/release/android/app/build/outputs/apk/release/app-release.apk`

**Note:** See [ANDROID_SETUP.md](./ANDROID_SETUP.md) for detailed setup instructions.

## Build Scripts

### Local Build Commands

| Command | Platform | Description |
|---------|----------|-------------|
| `npm run tauri:build` | Current | Build for current platform |
| `npm run tauri:build:windows` | Windows | Build Windows executable |
| `npm run tauri:build:android` | Android | Build release APK |
| `npm run tauri:build:android:debug` | Android | Build debug APK |
| `npm run tauri:android:init` | Android | Initialize Android project (first time) |
| `npm run tauri:android:dev` | Android | Run in development mode |

### GitHub Actions Workflows

The project includes automated builds via GitHub Actions:

| Workflow | Triggers | Platforms | Description |
|----------|----------|-----------|-------------|
| `build-windows.yml` | Push/PR to main/master | Windows | Builds Windows MSI and NSIS installers |
| `build-android.yml` | Push/PR to main/master | Android | Builds Android release APK |
| `build-all-platforms.yml` | Push/PR to main/master | Windows + Android | Builds both platforms in parallel |
| `build-android-debug.yml` | Manual only | Android | Builds Android debug APK (for testing) |
| `build-windows-simple.yml` | Manual only | Windows | Simple Windows build workflow |

**Artifacts:** All builds upload artifacts that can be downloaded from the Actions tab in GitHub.

**Location:** Workflow files are in the repository root at `.github/workflows/`. They run with `working-directory: apps/cuslabs-pos`. Workflows only run when files under `apps/cuslabs-pos/` change (or when triggered manually).

## Platform-Specific Configuration

### Windows Configuration
Located in `src-tauri/tauri.conf.json`:
```json
{
  "app": {
    "windows": [
      {
        "title": "satria-pos",
        "width": 800,
        "height": 600,
        "resizable": true,
        "fullscreen": true
      }
    ]
  }
}
```

### Android Configuration
Android configuration is created automatically when you run `tauri android init`. The configuration is stored in:
- `src-tauri/android/app/build.gradle` - Build configuration
- `src-tauri/android/app/src/main/AndroidManifest.xml` - App manifest
- `src-tauri/android/app/src/main/res/` - Android resources

The package name uses the `identifier` from `tauri.conf.json` (`com.satria.pos`).

To customize Android settings, edit the files in `src-tauri/android/` after running `tauri android init`.

## Compatibility

✅ **Windows and Android builds are completely independent**

- Windows builds use `x86_64-pc-windows-msvc` target
- Android builds use `aarch64-linux-android` target
- Adding Android support does NOT affect Windows builds
- Both can be built from the same codebase
- Configuration is platform-specific and isolated

## Next Steps

1. **For Windows builds:** Continue using existing commands - nothing changed
2. **For Android builds:** Follow the setup guide in [ANDROID_SETUP.md](./ANDROID_SETUP.md)

## Troubleshooting

### Windows Build Issues
- Ensure you have Visual Studio Build Tools installed
- Check that Rust target is installed: `rustup target add x86_64-pc-windows-msvc`

### Android Build Issues
- See [ANDROID_SETUP.md](./ANDROID_SETUP.md) for detailed troubleshooting
- Ensure Android SDK and NDK are properly installed
- Verify environment variables (`ANDROID_HOME`, `JAVA_HOME`)
