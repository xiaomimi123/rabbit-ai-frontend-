# Rabbit AI 前端项目启动指南

## 快速启动

### 方法 1: 使用 PowerShell 脚本（推荐）
```powershell
cd rabbit-ai-frontendxin
.\start-dev.ps1
```

### 方法 2: 手动启动
```powershell
# 1. 进入项目目录
cd rabbit-ai-frontendxin

# 2. 安装依赖（如果还没有安装）
npm install

# 3. 启动开发服务器
npm run dev
```

## 访问地址

启动成功后，在浏览器中访问：
- **本地访问**: http://localhost:3000
- **网络访问**: http://0.0.0.0:3000

## 常见问题

### 1. 端口 3000 被占用
如果端口 3000 已被占用，可以：
- 修改 `vite.config.ts` 中的 `port` 配置
- 或者关闭占用 3000 端口的程序

### 2. 依赖安装失败
```powershell
# 清除缓存后重新安装
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### 3. 编译错误
检查 TypeScript 和 ESLint 错误：
```powershell
npm run build
```

## 项目结构

```
rabbit-ai-frontendxin/
├── views/           # 页面视图
│   ├── AssetView.tsx    # 资产页面（持币生息）
│   ├── MiningView.tsx   # 挖矿页面
│   ├── ProfileView.tsx   # 个人页面
│   └── NotificationsView.tsx  # 通知页面
├── components/      # 组件
├── services/        # 服务（Web3等）
├── contexts/        # React Context
├── api.ts          # API 调用
├── constants.ts    # 常量配置
└── App.tsx         # 主应用组件
```

## 开发说明

- 修改代码后会自动热更新
- API 请求会代理到 `http://localhost:3001`（后端服务）
- 如果后端未运行，API 调用会失败（这是正常的，可以查看 UI 效果）

