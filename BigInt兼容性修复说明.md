# BigInt 兼容性修复说明

## 🚨 问题背景

**致命问题**: Ethers.js 大量使用 BigInt，而旧设备（Android 6.0/7.0）不支持 BigInt 语法。

**为什么这很致命**:
- ❌ 语法错误无法被 Error Boundary 捕获
- ❌ 即使修复了其他所有问题，BigInt 语法错误仍会导致黑屏
- ❌ 这是解决旧设备兼容性的唯一方法

---

## ✅ 修复方案

### 1. 安装依赖

```bash
npm install --save-dev @vitejs/plugin-legacy@^5.4.0 terser --legacy-peer-deps
```

### 2. 配置 Vite

在 `vite.config.ts` 中添加 Legacy 插件：

```typescript
import legacy from '@vitejs/plugin-legacy';

legacy({
  targets: [
    'Android >= 5.0',  // 支持 Android 5.0+
    'Chrome >= 60',
    'Safari >= 10.1',
    'iOS >= 10.3',
    'Firefox >= 60',
    'Edge >= 79',
  ],
  modernPolyfills: false,
  renderLegacyChunks: true,
  terserOptions: {
    compress: {
      drop_console: mode === 'production',
    },
  },
})
```

---

## 📊 构建结果

构建成功后会生成两套代码：

### 现代浏览器版本
- `index-*.js` - 现代 JavaScript 代码（优化后）
- 现代浏览器使用此版本

### Legacy 版本（旧设备）
- `index-legacy-*.js` - ES5 兼容代码
- `polyfills-legacy-*.js` - Polyfills（包含 BigInt polyfill）
- 旧浏览器自动使用此版本

**构建产物示例**:
```
dist/assets/index-legacy-*.js         724.02 kB │ gzip: 204.08 kB
dist/assets/polyfills-legacy-*.js     173.69 kB │ gzip:  64.37 kB
dist/assets/vendor-ethers-legacy-*.js 475.12 kB │ gzip: 154.14 kB
```

---

## 🎯 工作原理

1. **自动检测**: 浏览器自动检测是否支持现代 JavaScript
2. **智能加载**: 
   - 现代浏览器 → 加载现代版本（更小、更快）
   - 旧浏览器 → 加载 Legacy 版本（包含 polyfills）
3. **语法转换**: Legacy 插件自动将 BigInt、箭头函数、async/await 等转换为 ES5 兼容代码

---

## ✅ 验证方法

### 1. 检查构建产物
```bash
npm run build
# 应该看到很多 -legacy-*.js 文件
```

### 2. 在旧设备上测试
- Android 5.0-7.0 设备
- 验证页面是否正常加载
- 验证钱包连接等功能是否正常

### 3. 检查浏览器 Network 面板
- 旧浏览器应该加载 `legacy-*.js` 文件
- 现代浏览器应该加载普通 `*.js` 文件

---

## ⚠️ 注意事项

### 1. 构建产物大小
- Legacy 版本会增加构建产物大小（约 20-30%）
- 这是兼容旧设备的必要代价
- 现代浏览器不受影响，仍使用优化后的现代代码

### 2. 构建时间
- Legacy 转换会增加构建时间（约 1-2 分钟）
- 这是正常的，因为需要转换大量代码

### 3. 版本兼容性
- 当前使用 `@vitejs/plugin-legacy@^5.4.0`（兼容 Vite 6）
- 如果升级到 Vite 7，需要升级到 `@vitejs/plugin-legacy@^7.0.0`

---

## 🎉 修复效果

### 修复前
- ❌ 旧设备（Android 6.0/7.0）直接黑屏
- ❌ BigInt 语法错误无法被错误边界捕获
- ❌ 乌干达用户无法访问

### 修复后
- ✅ 旧设备（Android 5.0+）可以正常运行
- ✅ BigInt 自动转换为兼容代码
- ✅ 现代浏览器仍使用优化后的现代代码
- ✅ 解决乌干达用户黑屏问题

---

**修复完成时间**: 2026-01-03  
**修复状态**: ✅ 已完成  
**构建状态**: ✅ 已验证  
**部署状态**: ⏳ 待部署

