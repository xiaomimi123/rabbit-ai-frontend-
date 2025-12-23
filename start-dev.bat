@echo off
chcp 65001 >nul
echo ========================================
echo Rabbit AI 前端开发服务器启动
echo ========================================
echo.

cd /d "%~dp0"

echo 当前目录: %CD%
echo.

if not exist "node_modules" (
    echo [信息] 检测到 node_modules 不存在，正在安装依赖...
    echo.
    call npm install
    echo.
)

echo [信息] 启动开发服务器...
echo [信息] 访问地址: http://localhost:3000
echo [信息] 按 Ctrl+C 停止服务器
echo.
echo ========================================
echo.

call npm run dev

pause

