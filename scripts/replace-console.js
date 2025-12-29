/**
 * 批量替换 console 调用的脚本
 * 将 console.log/warn/info/debug 替换为 logger 工具
 * 将 console.error 替换为 logger.error
 */

const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'App.tsx',
  'views/MiningView.tsx',
  'views/ProfileView.tsx',
  'services/web3Service.ts',
  'views/NotificationsView.tsx',
  'views/AssetView.tsx',
];

const baseDir = path.join(__dirname, '..');

// 检查文件是否已导入 logger
function hasLoggerImport(content) {
  return content.includes("import { logger }") || content.includes('from "./utils/logger"') || content.includes("from '../utils/logger'");
}

// 添加 logger 导入
function addLoggerImport(content, filePath) {
  if (hasLoggerImport(content)) {
    return content;
  }
  
  // 计算相对路径
  const relativePath = path.relative(path.dirname(filePath), path.join(baseDir, 'utils', 'logger.ts'));
  const importPath = relativePath.replace(/\\/g, '/').replace(/\.ts$/, '');
  const importStatement = `import { logger } from '${importPath.startsWith('.') ? importPath : './' + importPath}';\n`;
  
  // 找到第一个 import 语句后插入
  const lines = content.split('\n');
  let insertIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      insertIndex = i + 1;
      break;
    }
  }
  
  lines.splice(insertIndex, 0, importStatement);
  return lines.join('\n');
}

// 替换 console 调用
function replaceConsoleCalls(content) {
  // 替换 console.log(...) -> logger.log(...)
  content = content.replace(/console\.log\(/g, 'logger.log(');
  
  // 替换 console.warn(...) -> logger.warn(...)
  content = content.replace(/console\.warn\(/g, 'logger.warn(');
  
  // 替换 console.info(...) -> logger.info(...)
  content = content.replace(/console\.info\(/g, 'logger.info(');
  
  // 替换 console.debug(...) -> logger.debug(...)
  content = content.replace(/console\.debug\(/g, 'logger.debug(');
  
  // 替换 console.error(...) -> logger.error(...)
  // 注意：console.error 需要特殊处理，因为它可能包含多个参数
  content = content.replace(/console\.error\(/g, 'logger.error(');
  
  return content;
}

// 处理文件
filesToProcess.forEach(file => {
  const filePath = path.join(baseDir, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`文件不存在: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  
  // 添加 logger 导入
  content = addLoggerImport(content, filePath);
  
  // 替换 console 调用
  content = replaceConsoleCalls(content);
  
  // 如果内容有变化，写入文件
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`已处理: ${file}`);
  } else {
    console.log(`无需处理: ${file}`);
  }
});

console.log('批量替换完成！');

