/**
 * 🔍 Rabbit AI 前端部署快速检测脚本
 * 
 * 使用方法：
 * 1. 打开生产网站
 * 2. 按 F12 打开开发者工具
 * 3. 切换到 Console 标签页
 * 4. 复制整个脚本并粘贴到控制台
 * 5. 按 Enter 执行
 * 
 * 更新时间: 2026-01-05
 */

(function() {
  console.clear();
  console.log('%c🚀 开始部署验证检测...', 'color: #00ff00; font-size: 16px; font-weight: bold');
  console.log('%c=' .repeat(60), 'color: #666');
  
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // ============================================================================
  // 测试 1: 检查调试日志是否被移除
  // ============================================================================
  console.log('\n%c📝 测试 1: 检查调试日志是否被移除', 'color: #00aaff; font-weight: bold');
  
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  const originalWarn = console.warn;
  
  let logCalled = false;
  let infoCalled = false;
  let debugCalled = false;
  let warnCalled = false;
  
  console.log = function() { logCalled = true; originalLog.apply(console, arguments); };
  console.info = function() { infoCalled = true; originalInfo.apply(console, arguments); };
  console.debug = function() { debugCalled = true; originalDebug.apply(console, arguments); };
  console.warn = function() { warnCalled = true; originalWarn.apply(console, arguments); };
  
  // 执行测试
  console.log('测试调试日志');
  console.info('测试信息日志');
  console.debug('测试调试日志');
  console.warn('测试警告日志');
  
  // 恢复原始函数
  console.log = originalLog;
  console.info = originalInfo;
  console.debug = originalDebug;
  console.warn = originalWarn;
  
  if (!logCalled && !infoCalled && !debugCalled && !warnCalled) {
    console.log('  ✅ 调试日志已正确移除');
    results.passed.push('调试日志已移除');
  } else {
    console.log('  ❌ 调试日志未被移除');
    results.failed.push('调试日志仍然存在');
  }

  // ============================================================================
  // 测试 2: 检查 console.error 是否保留
  // ============================================================================
  console.log('\n%c📝 测试 2: 检查 console.error 是否保留', 'color: #00aaff; font-weight: bold');
  
  const originalError = console.error;
  let errorCalled = false;
  
  console.error = function() { errorCalled = true; originalError.apply(console, arguments); };
  console.error('测试错误日志（这是正常的测试）');
  console.error = originalError;
  
  if (errorCalled) {
    console.log('  ✅ console.error 已保留（用于错误监控）');
    results.passed.push('console.error 保留正常');
  } else {
    console.log('  ⚠️ console.error 也被移除了（可能影响错误监控）');
    results.warnings.push('console.error 被移除');
  }

  // ============================================================================
  // 测试 3: 检查环境配置
  // ============================================================================
  console.log('\n%c📝 测试 3: 检查环境配置', 'color: #00aaff; font-weight: bold');
  
  // 检查是否在生产环境（通过URL判断）
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
  const isVercel = window.location.hostname.includes('vercel.app');
  const isCustomDomain = !isLocalhost && !isVercel;
  
  console.log('  当前域名:', window.location.hostname);
  console.log('  是否本地开发:', isLocalhost);
  console.log('  是否 Vercel 部署:', isVercel);
  console.log('  是否自定义域名:', isCustomDomain);
  
  if (!isLocalhost) {
    console.log('  ✅ 当前是生产/预览环境');
    results.passed.push('运行在生产环境');
  } else {
    console.log('  ⚠️ 当前是本地开发环境');
    results.warnings.push('当前是开发环境');
  }

  // ============================================================================
  // 测试 4: 检查 API 配置
  // ============================================================================
  console.log('\n%c📝 测试 4: 检查 API 配置', 'color: #00aaff; font-weight: bold');
  
  // 检查页面中是否有 API 请求
  const perfEntries = performance.getEntriesByType('resource');
  const apiRequests = perfEntries.filter(entry => 
    entry.name.includes('/api/') || 
    entry.name.includes('rabbit-ai-backend')
  );
  
  if (apiRequests.length > 0) {
    console.log('  找到', apiRequests.length, '个 API 请求');
    
    const backendRequests = apiRequests.filter(r => 
      r.name.includes('rabbit-ai-backend.onrender.com')
    );
    
    const localRequests = apiRequests.filter(r => 
      r.name.includes(window.location.origin + '/api/')
    );
    
    if (backendRequests.length > 0) {
      console.log('  ✅ API 请求发送到后端:', backendRequests[0].name.split('/api/')[0]);
      results.passed.push('API 配置正确');
    } else if (localRequests.length > 0) {
      console.log('  ⚠️ API 请求发送到本地路径（可能需要配置 VITE_API_BASE_URL）');
      console.log('  请求地址:', localRequests[0].name);
      results.warnings.push('API 可能配置不正确');
    } else {
      console.log('  ℹ️ 未检测到标准 API 请求');
      results.warnings.push('未检测到 API 请求');
    }
  } else {
    console.log('  ℹ️ 暂无 API 请求（可能页面刚加载）');
    results.warnings.push('暂无 API 请求');
  }

  // ============================================================================
  // 测试 5: 检查页面性能
  // ============================================================================
  console.log('\n%c📝 测试 5: 检查页面性能', 'color: #00aaff; font-weight: bold');
  
  const navigation = performance.getEntriesByType('navigation')[0];
  if (navigation) {
    const loadTime = navigation.loadEventEnd - navigation.fetchStart;
    const domReady = navigation.domContentLoadedEventEnd - navigation.fetchStart;
    
    console.log('  页面加载时间:', (loadTime / 1000).toFixed(2), '秒');
    console.log('  DOM 就绪时间:', (domReady / 1000).toFixed(2), '秒');
    
    if (loadTime < 3000) {
      console.log('  ✅ 页面加载速度良好');
      results.passed.push('页面加载性能良好');
    } else if (loadTime < 5000) {
      console.log('  ⚠️ 页面加载较慢');
      results.warnings.push('页面加载速度一般');
    } else {
      console.log('  ❌ 页面加载过慢');
      results.failed.push('页面加载速度差');
    }
  }

  // ============================================================================
  // 测试 6: 检查错误情况
  // ============================================================================
  console.log('\n%c📝 测试 6: 检查是否有 JavaScript 错误', 'color: #00aaff; font-weight: bold');
  
  // 这个检查无法直接进行，但可以提示用户查看
  console.log('  ℹ️ 请手动检查控制台是否有红色错误信息');
  console.log('  ℹ️ 如果有错误，请记录并报告');

  // ============================================================================
  // 测试 7: 检查资源加载
  // ============================================================================
  console.log('\n%c📝 测试 7: 检查关键资源加载', 'color: #00aaff; font-weight: bold');
  
  const resources = performance.getEntriesByType('resource');
  const failedResources = resources.filter(r => 
    r.transferSize === 0 && !r.name.includes('data:')
  );
  
  if (failedResources.length === 0) {
    console.log('  ✅ 所有资源加载正常');
    results.passed.push('资源加载正常');
  } else {
    console.log('  ⚠️ 发现', failedResources.length, '个可能加载失败的资源');
    failedResources.forEach(r => console.log('    -', r.name));
    results.warnings.push(`${failedResources.length}个资源可能加载失败`);
  }

  // ============================================================================
  // 生成最终报告
  // ============================================================================
  console.log('\n%c' + '='.repeat(60), 'color: #666');
  console.log('%c📊 检测结果摘要', 'color: #00ff00; font-size: 18px; font-weight: bold');
  console.log('%c' + '='.repeat(60), 'color: #666');
  
  console.log('\n%c✅ 通过的测试 (' + results.passed.length + ')', 'color: #00ff00; font-weight: bold');
  results.passed.forEach(item => console.log('  ✓', item));
  
  if (results.warnings.length > 0) {
    console.log('\n%c⚠️ 警告 (' + results.warnings.length + ')', 'color: #ffaa00; font-weight: bold');
    results.warnings.forEach(item => console.log('  ⚠', item));
  }
  
  if (results.failed.length > 0) {
    console.log('\n%c❌ 失败的测试 (' + results.failed.length + ')', 'color: #ff0000; font-weight: bold');
    results.failed.forEach(item => console.log('  ✗', item));
  }
  
  // ============================================================================
  // 综合评估
  // ============================================================================
  console.log('\n%c' + '='.repeat(60), 'color: #666');
  
  const totalTests = results.passed.length + results.warnings.length + results.failed.length;
  const score = Math.round((results.passed.length / totalTests) * 100);
  
  let status, color;
  if (results.failed.length === 0 && results.warnings.length === 0) {
    status = '🎉 完美！部署完全成功';
    color = '#00ff00';
  } else if (results.failed.length === 0) {
    status = '✅ 良好！部署基本成功，有一些警告';
    color = '#00aaff';
  } else {
    status = '⚠️ 需要注意！发现一些问题';
    color = '#ffaa00';
  }
  
  console.log('%c最终评估: ' + status, 'color: ' + color + '; font-size: 16px; font-weight: bold');
  console.log('%c评分: ' + score + '/100', 'color: ' + color + '; font-size: 14px');
  
  console.log('\n%c建议下一步操作:', 'color: #00aaff; font-weight: bold');
  
  if (results.failed.length > 0) {
    console.log('  1. 修复失败的测试项');
    console.log('  2. 检查 Vercel 构建日志');
    console.log('  3. 重新部署');
  } else if (results.warnings.length > 0) {
    console.log('  1. 检查警告项（可选）');
    console.log('  2. 进行完整的功能测试');
    console.log('  3. 验证多语言功能');
  } else {
    console.log('  1. ✅ 进行完整的功能测试');
    console.log('  2. ✅ 验证所有页面功能');
    console.log('  3. ✅ 进行用户验收测试');
  }
  
  console.log('\n%c' + '='.repeat(60), 'color: #666');
  console.log('%c检测完成！', 'color: #00ff00; font-size: 16px; font-weight: bold');
  
  // 返回结果对象，方便进一步分析
  return {
    score,
    status,
    passed: results.passed,
    warnings: results.warnings,
    failed: results.failed,
    timestamp: new Date().toISOString()
  };
})();

