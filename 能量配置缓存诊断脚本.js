// 🔍 能量配置缓存诊断和修复脚本
// 在用户前端 F12 控制台运行此脚本

(async () => {
  console.clear();
  console.log('🔍 ===== 能量配置缓存诊断 =====\n');
  
  // 1. 检查 localStorage 缓存
  console.log('📦 1. 检查 localStorage 缓存:\n');
  
  const energyCacheKey = 'PUBLIC_ENERGY_CONFIG_CACHE';
  const vipCacheKey = 'VIP_TIERS_CACHE';
  
  const energyCache = localStorage.getItem(energyCacheKey);
  const vipCache = localStorage.getItem(vipCacheKey);
  
  if (energyCache) {
    try {
      const { timestamp, config } = JSON.parse(energyCache);
      const age = Date.now() - timestamp;
      const ageMinutes = Math.floor(age / 60000);
      const ageSeconds = Math.floor((age % 60000) / 1000);
      
      console.log('✅ 能量配置缓存存在:');
      console.table({
        '提现能量比例': config.withdraw_energy_ratio,
        '用户领取奖励': config.claim_self_reward,
        '推荐人首次奖励': config.claim_referrer_first,
        '推荐人重复奖励': config.claim_referrer_repeat,
        '缓存时间': new Date(timestamp).toLocaleString(),
        '缓存年龄': `${ageMinutes} 分 ${ageSeconds} 秒`,
        '是否过期': age > 60000 ? '❌ 是（超过1分钟）' : '✅ 否'
      });
    } catch (e) {
      console.error('❌ 能量配置缓存解析失败:', e);
    }
  } else {
    console.log('ℹ️ 能量配置缓存不存在');
  }
  
  if (vipCache) {
    try {
      const { timestamp, tiers } = JSON.parse(vipCache);
      const age = Date.now() - timestamp;
      const ageMinutes = Math.floor(age / 60000);
      
      console.log('\n✅ VIP 配置缓存存在:');
      console.log(`缓存年龄: ${ageMinutes} 分钟`);
      console.table(tiers.map(t => ({
        等级: t.name,
        日利率: t.dailyRate + '%',
        最小余额: t.min,
        最大余额: t.max === Infinity ? '∞' : t.max
      })));
    } catch (e) {
      console.error('❌ VIP 配置缓存解析失败:', e);
    }
  } else {
    console.log('\nℹ️ VIP 配置缓存不存在');
  }
  
  // 2. 测试 API 实时返回
  console.log('\n\n🌐 2. 测试 API 实时返回（绕过缓存）:\n');
  
  try {
    const timestamp = Date.now();
    const energyRes = await fetch(`https://rabbit-ai-backend.onrender.com/api/public/energy-config?_t=${timestamp}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    const energyData = await energyRes.json();
    
    if (energyData.ok) {
      console.log('✅ 能量配置 API 返回:');
      console.table({
        '提现能量比例': energyData.config.withdraw_energy_ratio,
        '用户领取奖励': energyData.config.claim_self_reward,
        '推荐人首次奖励': energyData.config.claim_referrer_first,
        '推荐人重复奖励': energyData.config.claim_referrer_repeat
      });
      
      // 对比缓存和 API
      if (energyCache) {
        const { config: cachedConfig } = JSON.parse(energyCache);
        if (cachedConfig.withdraw_energy_ratio !== energyData.config.withdraw_energy_ratio) {
          console.log('\n⚠️ 警告：缓存值与 API 值不一致！');
          console.log(`缓存值: ${cachedConfig.withdraw_energy_ratio}`);
          console.log(`API 值: ${energyData.config.withdraw_energy_ratio}`);
        } else {
          console.log('\n✅ 缓存值与 API 值一致');
        }
      }
    } else {
      console.error('❌ 能量配置 API 返回失败:', energyData);
    }
  } catch (error) {
    console.error('❌ 能量配置 API 请求失败:', error);
  }
  
  // 3. 检查 Cloudflare 缓存（如果使用）
  console.log('\n\n☁️ 3. 检查可能的 CDN 缓存问题:\n');
  console.log('如果使用了 Cloudflare CDN，可能需要：');
  console.log('1. 在 Cloudflare Dashboard 清除缓存');
  console.log('2. 或者等待缓存自动过期');
  console.log('3. 或者使用开发模式（Bypass Cache）');
  
  // 4. 提供修复方案
  console.log('\n\n🔧 4. 修复方案:\n');
  console.log('方案 A: 清除所有缓存（推荐）');
  console.log('运行以下代码：');
  console.log(`
localStorage.removeItem('PUBLIC_ENERGY_CONFIG_CACHE');
localStorage.removeItem('VIP_TIERS_CACHE');
localStorage.removeItem('vip_tiers_cache');
console.log('✅ 缓存已清除');
location.reload(true);
  `);
  
  console.log('\n方案 B: 强制刷新页面');
  console.log('按 Ctrl + Shift + R (Windows) 或 Cmd + Shift + R (Mac)');
  
  console.log('\n方案 C: 等待缓存自动过期');
  console.log('缓存会在 1 分钟后自动过期');
  
  console.log('\n========== 诊断完成 ==========');
})();

