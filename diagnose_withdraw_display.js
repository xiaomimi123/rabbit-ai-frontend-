/**
 * 活动记录提现显示问题诊断脚本
 * 
 * 使用方法：
 * 1. 打开浏览器控制台（F12）
 * 2. 复制整个脚本
 * 3. 粘贴到控制台并回车执行
 * 4. 查看输出结果
 */

(async function diagnoseWithdrawDisplay() {
  console.log('='.repeat(80));
  console.log('🔍 活动记录提现显示问题诊断开始');
  console.log('='.repeat(80));
  
  try {
    // 1. 获取当前用户地址
    const userAddress = localStorage.getItem('userAddress') || 
                       sessionStorage.getItem('userAddress') ||
                       window.ethereum?.selectedAddress;
    
    if (!userAddress) {
      console.error('❌ 无法获取用户地址，请先连接钱包');
      return;
    }
    
    console.log('\n📍 用户地址:', userAddress);
    
    // 2. 获取 API Base URL
    const apiBaseUrl = window.location.origin.includes('localhost') 
      ? '/api' 
      : (import.meta?.env?.VITE_API_BASE_URL || window.location.origin + '/api');
    
    console.log('📍 API Base URL:', apiBaseUrl);
    
    // 3. 调用提现历史 API
    console.log('\n🔄 正在调用 API: /asset/withdraw/history');
    const apiUrl = `${apiBaseUrl}/asset/withdraw/history?address=${userAddress.toLowerCase()}`;
    console.log('📍 完整 URL:', apiUrl);
    
    const startTime = Date.now();
    const response = await fetch(apiUrl);
    const endTime = Date.now();
    
    console.log(`✅ API 响应时间: ${endTime - startTime}ms`);
    console.log('📍 HTTP 状态码:', response.status, response.statusText);
    
    // 4. 检查响应头
    console.log('\n📋 响应头:');
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
      if (key.toLowerCase().includes('cache')) {
        console.log(`   🔍 ${key}: ${value}`);
      }
    });
    
    // 5. 解析响应数据
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('❌ API 返回的不是数组:', data);
      return;
    }
    
    console.log(`\n📊 API 返回记录数: ${data.length}`);
    
    if (data.length === 0) {
      console.warn('⚠️ API 返回空数组，用户可能没有提现记录');
      return;
    }
    
    // 6. 分析返回的数据
    console.log('\n📊 提现记录详细分析:');
    console.log('='.repeat(80));
    
    // 统计各日期的记录数
    const dateStats = {};
    const statusStats = {};
    
    data.forEach((record, index) => {
      // 提取日期部分（YYYY-MM-DD）
      const dateStr = record.time ? record.time.split(' ')[0] : 
                     (record.createdAt ? record.createdAt.split('T')[0] : 'Unknown');
      
      dateStats[dateStr] = (dateStats[dateStr] || 0) + 1;
      statusStats[record.status || 'Unknown'] = (statusStats[record.status || 'Unknown'] || 0) + 1;
      
      // 显示前3条记录的详细信息
      if (index < 3) {
        console.log(`\n记录 #${index + 1}:`);
        console.log('  ID:', record.id);
        console.log('  金额:', record.amount, 'USDT');
        console.log('  状态:', record.status);
        console.log('  time:', record.time);
        console.log('  createdAt:', record.createdAt);
        console.log('  energyCost:', record.energyCost);
        
        // 检查时间有效性
        const timeValid = record.time && !isNaN(new Date(record.time).getTime());
        const createdAtValid = record.createdAt && !isNaN(new Date(record.createdAt).getTime());
        console.log('  ✅ time 有效:', timeValid);
        console.log('  ✅ createdAt 有效:', createdAtValid);
      }
    });
    
    // 7. 显示日期统计
    console.log('\n📊 按日期统计:');
    console.log('='.repeat(80));
    const sortedDates = Object.keys(dateStats).sort().reverse();
    sortedDates.forEach(date => {
      console.log(`  ${date}: ${dateStats[date]} 条记录`);
    });
    
    // 8. 显示状态统计
    console.log('\n📊 按状态统计:');
    console.log('='.repeat(80));
    Object.keys(statusStats).forEach(status => {
      console.log(`  ${status}: ${statusStats[status]} 条记录`);
    });
    
    // 9. 时间检查
    console.log('\n⏰ 时间检查:');
    console.log('='.repeat(80));
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];  // YYYY-MM-DD
    const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('  当前时间 (本地):', now.toLocaleString('zh-CN'));
    console.log('  当前时间 (UTC):', now.toISOString());
    console.log('  今天日期:', todayStr);
    console.log('  昨天日期:', yesterdayStr);
    
    const todayCount = dateStats[todayStr] || 0;
    const yesterdayCount = dateStats[yesterdayStr] || 0;
    
    console.log(`\n  ✅ 今天 (${todayStr}) 的记录: ${todayCount} 条`);
    console.log(`  ✅ 昨天 (${yesterdayStr}) 的记录: ${yesterdayCount} 条`);
    
    // 10. 最新记录时间
    if (data.length > 0) {
      const latestRecord = data[0];  // API 已经按时间倒序
      const latestTime = new Date(latestRecord.createdAt || latestRecord.time);
      const hoursAgo = (now - latestTime) / (1000 * 60 * 60);
      
      console.log(`\n  📍 最新记录时间: ${latestTime.toLocaleString('zh-CN')}`);
      console.log(`  📍 距离现在: ${hoursAgo.toFixed(2)} 小时`);
      
      if (hoursAgo > 24) {
        console.warn(`  ⚠️ 最新记录已经超过 24 小时，可能没有新数据`);
      }
    }
    
    // 11. 诊断结论
    console.log('\n' + '='.repeat(80));
    console.log('📝 诊断结论:');
    console.log('='.repeat(80));
    
    if (todayCount > 0) {
      console.log('✅ API 返回了今天的数据，问题可能在前端显示逻辑');
      console.log('   建议检查: ActivityHistoryView 组件的数据处理和渲染逻辑');
    } else if (yesterdayCount > 0) {
      console.log('⚠️ API 只返回了昨天的数据，没有今天的数据');
      console.log('   可能原因:');
      console.log('   1. 用户今天确实没有发起新的提现');
      console.log('   2. 数据库中没有今天的记录');
      console.log('   3. 后端查询逻辑有问题');
      console.log('   建议检查: 数据库中的实际数据');
    } else {
      console.log('⚠️ API 返回的数据都是旧数据');
      console.log('   建议检查: 数据库查询和时区设置');
    }
    
    // 12. 检查浏览器缓存
    console.log('\n📦 浏览器缓存检查:');
    console.log('='.repeat(80));
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl && (cacheControl.includes('max-age') || cacheControl.includes('public'))) {
      console.warn('⚠️ API 响应被缓存了:', cacheControl);
      console.log('   建议: 添加 Cache-Control: no-cache 响应头');
    } else {
      console.log('✅ API 响应未被缓存');
    }
    
    // 13. 返回数据供进一步检查
    console.log('\n📦 完整数据已保存到全局变量 window.__withdrawData__');
    console.log('   可以使用 console.table(window.__withdrawData__) 查看表格形式');
    
    window.__withdrawData__ = data;
    
  } catch (error) {
    console.error('❌ 诊断过程中出错:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ 诊断完成');
  console.log('='.repeat(80));
})();

// 提供一个快速查看表格的函数
console.log('\n💡 提示: 执行完成后，可以运行以下命令查看表格:');
console.log('   console.table(window.__withdrawData__)');

