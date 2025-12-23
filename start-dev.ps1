# Rabbit AI Frontend 开发服务器启动脚本
Write-Host "正在启动 Rabbit AI 前端开发服务器..." -ForegroundColor Green
Write-Host "项目目录: $PWD" -ForegroundColor Yellow

# 检查 node_modules 是否存在
if (-not (Test-Path "node_modules")) {
    Write-Host "检测到 node_modules 不存在，正在安装依赖..." -ForegroundColor Yellow
    npm install
}

# 启动开发服务器
Write-Host "启动开发服务器 (端口: 3000)..." -ForegroundColor Green
Write-Host "访问地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
Write-Host ""

npm run dev

