# Tauri Installation Guide for Windows

## Prerequisites

### 1. Install Rust

**Option A: Using rustup (Recommended)**
1. Download rustup from: https://rustup.rs/
2. Run the installer
3. Follow the installation wizard
4. Restart your terminal/PowerShell

**Option B: Using winget**
```powershell
winget install Rustlang.Rustup
```

**Verify installation:**
```powershell
rustc --version
cargo --version
```

### 2. Install Visual Studio Build Tools

Tauri requires C++ build tools to compile Rust code.

**Download:**
- Go to: https://visualstudio.microsoft.com/downloads/
- Download "Build Tools for Visual Studio"

**Install:**
1. Run the installer
2. Select "Desktop development with C++" workload
3. Make sure these components are checked:
   - MSVC v143 - VS 2022 C++ x64/x86 build tools
   - Windows 10/11 SDK (latest version)
   - C++ CMake tools for Windows
4. Click Install

**Alternative: Install full Visual Studio**
- Download Visual Studio Community (free)
- Select "Desktop development with C++" workload during installation

### 3. Install Node.js and Yarn

**Node.js:**
- Download from: https://nodejs.org/
- Install LTS version (recommended)

**Yarn:**
```powershell
npm install -g yarn
```

**Verify:**
```powershell
node --version
yarn --version
```

## Install Tauri CLI

### Global Installation (Recommended)

```powershell
npm install -g @tauri-apps/cli
```

**Or using yarn:**
```powershell
yarn global add @tauri-apps/cli
```

**Verify installation:**
```powershell
tauri --version
```

## Setup Your Project on Windows

### 1. Clone/Copy Your Project

If you're transferring from macOS:
- Copy the entire project folder to Windows
- Or use Git to clone the repository

### 2. Install Dependencies

```powershell
cd pos-inventory-app
yarn install
```

### 3. Verify Tauri Setup

```powershell
# Check if Tauri CLI is available
tauri --version

# Check Rust toolchain
rustc --version
cargo --version
```

## Build Your App

### Development Mode

```powershell
yarn tauri dev
```

This will:
- Start Vite dev server
- Compile Rust code
- Launch the app window

### Production Build

```powershell
yarn tauri build
```

Or use the custom script:
```powershell
yarn tauri:build:windows
```

## Troubleshooting

### Error: "linker not found"

**Solution:** Install Visual Studio Build Tools with C++ workload

### Error: "rustup not found"

**Solution:** 
1. Install Rust from https://rustup.rs/
2. Restart terminal/PowerShell
3. Run: `rustup default stable`

### Error: "WebView2 not found"

**Solution:**
- Windows 10: Install WebView2 Runtime from Microsoft
- Windows 11: Already included
- Download: https://developer.microsoft.com/microsoft-edge/webview2/

### Error: "MSVC toolchain not found"

**Solution:**
1. Install Visual Studio Build Tools
2. Run: `rustup default stable-msvc`
3. Or set environment variable: `RUSTFLAGS=-C linker=link.exe`

## Quick Setup Script

Create a PowerShell script to verify everything:

```powershell
# check-setup.ps1
Write-Host "Checking Tauri prerequisites..." -ForegroundColor Green

Write-Host "`n1. Checking Rust..." -ForegroundColor Yellow
rustc --version
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Rust not found!" -ForegroundColor Red }

Write-Host "`n2. Checking Cargo..." -ForegroundColor Yellow
cargo --version
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Cargo not found!" -ForegroundColor Red }

Write-Host "`n3. Checking Node.js..." -ForegroundColor Yellow
node --version
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Node.js not found!" -ForegroundColor Red }

Write-Host "`n4. Checking Yarn..." -ForegroundColor Yellow
yarn --version
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Yarn not found!" -ForegroundColor Red }

Write-Host "`n5. Checking Tauri CLI..." -ForegroundColor Yellow
tauri --version
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Tauri CLI not found!" -ForegroundColor Red }

Write-Host "`n✅ Setup check complete!" -ForegroundColor Green
```

Run it:
```powershell
.\check-setup.ps1
```

## Next Steps

After installation:
1. ✅ Test dev mode: `yarn tauri dev`
2. ✅ Build for production: `yarn tauri build`
3. ✅ Find .exe in: `src-tauri/target/release/tukuaplikasi-pos.exe`
4. ✅ Find installer in: `src-tauri/target/release/bundle/msi/`

## System Requirements

- **OS:** Windows 10/11 (64-bit)
- **RAM:** 4GB minimum (8GB recommended)
- **Disk:** 2GB free space for Rust toolchain
- **Internet:** Required for first build (downloads dependencies)

