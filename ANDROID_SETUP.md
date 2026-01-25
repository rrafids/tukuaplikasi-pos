# Android Build Setup Guide

This guide will help you set up Android build support for Cuslabs POS without breaking existing Windows builds.

## Prerequisites

Before building for Android, you need to install the following:

### 1. Android Studio
- Download and install [Android Studio](https://developer.android.com/studio)
- During installation, make sure to install:
  - Android SDK
  - Android SDK Platform-Tools
  - Android SDK Build-Tools
  - Android NDK (Native Development Kit)

### 2. Java Development Kit (JDK)
- Install JDK 17 or later
- Set `JAVA_HOME` environment variable to point to your JDK installation

### 3. Android SDK Configuration
After installing Android Studio:
1. Open Android Studio
2. Go to **Tools > SDK Manager**
3. Install:
   - Android SDK Platform 33 (or the version specified in `tauri.conf.json`)
   - Android SDK Build-Tools
   - Android NDK (Side by side)
4. Set `ANDROID_HOME` environment variable:
   - **Windows**: `C:\Users\<YourUsername>\AppData\Local\Android\Sdk`
   - **macOS/Linux**: `~/Library/Android/sdk` or `~/Android/Sdk`

### 4. Environment Variables
Add these to your system environment variables:

**Windows:**
```bash
ANDROID_HOME=C:\Users\<YourUsername>\AppData\Local\Android\Sdk
JAVA_HOME=C:\Program Files\Java\jdk-17
PATH=%PATH%;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools
```

**macOS/Linux:**
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
```

Add to `~/.bashrc` or `~/.zshrc` to make it permanent.

## Initial Setup

### 1. Initialize Android Project
Run this command to set up the Android project structure:

```bash
npm run tauri:android:init
```

This will create the necessary Android project files in `src-tauri/android/`.

### 2. Install Rust Android Targets
Install the required Rust targets for Android:

```bash
rustup target add aarch64-linux-android
# For 32-bit devices (optional):
rustup target add armv7-linux-androideabi
# For x86_64 emulators (optional):
rustup target add x86_64-linux-android
```

## Building for Android

### Development Build (Debug)
To build a debug APK for testing:

```bash
npm run tauri:build:android:debug
```

The APK will be located at:
```
src-tauri/target/aarch64-linux-android/debug/android/app/build/outputs/apk/debug/app-debug.apk
```

### Production Build (Release)
To build a release APK for distribution:

```bash
npm run tauri:build:android
```

The APK will be located at:
```
src-tauri/target/aarch64-linux-android/release/android/app/build/outputs/apk/release/app-release.apk
```

### Development Mode
To run the app in development mode on a connected Android device or emulator:

```bash
npm run tauri:android:dev
```

This will:
1. Build the frontend
2. Build the Rust backend
3. Install and run the app on your connected device/emulator
4. Enable hot-reload for frontend changes

## Android-Specific Configuration

### App Configuration
Android configuration is automatically created when you run `tauri android init`. The configuration files are located in `src-tauri/android/`:

- **Package Name**: Uses the `identifier` from `tauri.conf.json` (`com.satria.pos`)
- **Build Configuration**: `src-tauri/android/app/build.gradle`
- **App Manifest**: `src-tauri/android/app/src/main/AndroidManifest.xml`

### Updating Version
To update the app version for Android:
1. Update `version` in `src-tauri/tauri.conf.json`
2. Update `versionCode` in `src-tauri/android/app/build.gradle`:
   ```gradle
   android {
       defaultConfig {
           versionCode 2  // Increment this
           versionName "0.1.0"  // Should match tauri.conf.json version
       }
   }
   ```
3. Rebuild the APK

### Permissions
Android permissions are automatically handled by Tauri plugins. If you need additional permissions, you can add them to:
```
src-tauri/android/app/src/main/AndroidManifest.xml
```

## Testing

### On Physical Device
1. Enable **Developer Options** on your Android device:
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times
2. Enable **USB Debugging**:
   - Go to Settings > Developer Options
   - Enable "USB Debugging"
3. Connect your device via USB
4. Verify connection:
   ```bash
   adb devices
   ```
5. Build and install:
   ```bash
   npm run tauri:android:dev
   ```

### On Emulator
1. Open Android Studio
2. Go to **Tools > Device Manager**
3. Create a new virtual device
4. Start the emulator
5. Build and install:
   ```bash
   npm run tauri:android:dev
   ```

## Troubleshooting

### Build Errors

**Error: "Android SDK not found"**
- Verify `ANDROID_HOME` is set correctly
- Check that Android SDK is installed in Android Studio

**Error: "NDK not found"**
- Install NDK from Android Studio SDK Manager
- Set `ANDROID_NDK_HOME` environment variable

**Error: "Java not found"**
- Verify `JAVA_HOME` is set correctly
- Install JDK 17 or later

### Runtime Errors

**App crashes on launch**
- Check device logs: `adb logcat`
- Verify minimum SDK version matches device Android version
- Check that all required permissions are granted

**Database not working**
- SQLite should work automatically on Android
- Database location: `/data/data/com.satria.pos/databases/satria_pos.db`

## Windows Build Compatibility

✅ **Windows builds are NOT affected by Android configuration**

- Windows builds use separate build targets (`x86_64-pc-windows-msvc`)
- Android configuration only applies when building for Android
- You can continue using:
  ```bash
  npm run tauri:build:windows
  ```
  without any issues

## Build Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run tauri:android:init` | Initialize Android project structure |
| `npm run tauri:android:dev` | Run in development mode on device/emulator |
| `npm run tauri:build:android:debug` | Build debug APK |
| `npm run tauri:build:android` | Build release APK |
| `npm run tauri:build:windows` | Build Windows executable (unchanged) |
| `npm run tauri:build` | Build for current platform |

## Next Steps

1. Complete the prerequisites installation
2. Run `npm run tauri:android:init` to initialize Android project
3. Connect an Android device or start an emulator
4. Run `npm run tauri:android:dev` to test the app
5. Build release APK with `npm run tauri:build:android`

## Additional Resources

- [Tauri Android Documentation](https://tauri.app/v2/guides/building/android/)
- [Android Developer Guide](https://developer.android.com/guide)
- [Rust Android Targets](https://rust-lang.github.io/rustup-components-history/)
