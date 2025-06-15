# Desktop App Setup Guide

## Option 1: Tauri (Recommended)

### Step 1: Install Tauri
```bash
npm install --save-dev @tauri-apps/cli
cargo install tauri-cli
```

### Step 2: Initialize Tauri
```bash
npx tauri init
```

### Step 3: Update package.json
```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri-dev": "tauri dev",
    "build-desktop": "tauri build"
  }
}
```

### Step 4: Configure src-tauri/tauri.conf.json
```json
{
  "package": {
    "productName": "DIP Final WebShowShow",
    "version": "1.0.0"
  },
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm start",
    "devPath": "http://localhost:3000",
    "distDir": "../build",
    "withGlobalTauri": true
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "fs": {
        "all": true,
        "scope": ["**"]
      },
      "path": {
        "all": true
      },
      "dialog": {
        "all": true,
        "open": true,
        "save": true
      }
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.dipfinal.webshowshow",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ]
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "fullscreen": false,
        "resizable": true,
        "title": "DIP Final - Professional Image Editor",
        "width": 1400,
        "height": 900,
        "minWidth": 1000,
        "minHeight": 700
      }
    ]
  }
}
```

### Step 5: Build and Run
```bash
# Development
npm run tauri-dev

# Production build
npm run build-desktop
```

## Option 2: Electron (Alternative)

### Step 1: Install Electron
```bash
npm install electron electron-builder --save-dev
```

### Step 2: Create main.js
```javascript
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // For TensorFlow.js
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadURL(
    isDev 
      ? 'http://localhost:3000' 
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Create menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Image',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            // Handle file open
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            // Handle save
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### Step 3: Update package.json
```json
{
  "main": "main.js",
  "scripts": {
    "electron": "electron .",
    "electron-dev": "NODE_ENV=development electron .",
    "build-electron": "npm run build && electron-builder"
  },
  "build": {
    "appId": "com.dipfinal.webshowshow",
    "productName": "DIP Final - Image Editor",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "build/**/*",
      "main.js",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.graphics-design"
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": "AppImage"
    }
  }
}
```

## Performance Optimizations for Desktop

### 1. GPU Acceleration for TensorFlow.js
```javascript
// Add to your app
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

// Force GPU backend
await tf.setBackend('webgl');
```

### 2. File System Integration
```javascript
// Tauri file operations
import { open, save } from '@tauri-apps/api/dialog';
import { readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';

// Open image file
const openImage = async () => {
  const filePath = await open({
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp']
      }
    ]
  });
  
  if (filePath) {
    const fileData = await readBinaryFile(filePath);
    // Process image...
  }
};
```

### 3. Native Menus and Shortcuts
```javascript
// Tauri menu setup
import { Menu, MenuItem } from '@tauri-apps/api/menu';

const setupMenu = async () => {
  const menu = await Menu.new({
    items: [
      await MenuItem.new({
        text: 'Open',
        accelerator: 'CmdOrCtrl+O',
        action: openImage
      })
    ]
  });
};
```

## Build Commands

### Tauri
```bash
# Development
npm run tauri-dev

# Build for current platform
npm run build-desktop

# Build for specific platforms
tauri build --target x86_64-pc-windows-msvc  # Windows
tauri build --target x86_64-apple-darwin     # macOS Intel
tauri build --target aarch64-apple-darwin    # macOS Apple Silicon
tauri build --target x86_64-unknown-linux-gnu # Linux
```

### Electron
```bash
# Development
npm run electron-dev

# Build for current platform
npm run build-electron

# Build for all platforms
npx electron-builder --mac --win --linux
```

## Recommended: Use Tauri

For your image processing app with ML capabilities, Tauri offers:
- **10x smaller bundle size**
- **Better performance** for intensive operations
- **Native file dialogs** and system integration
- **Cross-platform** builds from single codebase
- **Security** by default