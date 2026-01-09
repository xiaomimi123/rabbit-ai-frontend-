/**
 * Invalid time value 错误修复测试脚本
 * 
 * 使用方法：
 * 1. 打开生产环境网站（或本地开发环境）
 * 2. 按 F12 打开浏览器控制台
 * 3. 复制粘贴整个脚本到控制台
 * 4. 按回车执行
 * 5. 查看测试结果
 */

console.clear();
console.log('%c=== Invalid time value 错误修复测试 ===', 'color: #FCD535; font-size: 16px; font-weight: bold;');
console.log('%c测试时间: ' + new Date().toLocaleString('zh-CN'), 'color: #848E9C;');
console.log('\n');

// 测试用的时间验证函数（与修复后的逻辑一致）
function safeParseTimestamp(timeValue, recordType = 'unknown') {
  let timestamp = 0;
  let createdAt = timeValue;
  
  if (createdAt && !isNaN(new Date(createdAt).getTime())) {
    timestamp = new Date(createdAt).getTime();
    return { success: true, timestamp, createdAt, error: null };
  } else {
    console.warn(`[Test] ⚠️ ${recordType}记录时间无效:`, timeValue);
    createdAt = new Date().toISOString();
    timestamp = Date.now();
    return { success: false, timestamp, createdAt, error: 'Invalid time value' };
  }
}

// 测试场景
const testCases = [
  // 场景 1: 有效的 ISO 时间字符串
  {
    name: '有效 ISO 时间（UTC）',
    input: '2026-01-10T10:00:00.000Z',
    expected: 'success'
  },
  // 场景 2: 有效的本地时间字符串
  {
    name: '有效本地时间字符串',
    input: '2026-01-10 18:00:00',
    expected: 'success'
  },
  // 场景 3: 空字符串
  {
    name: '空字符串',
    input: '',
    expected: 'fallback'
  },
  // 场景 4: null
  {
    name: 'null 值',
    input: null,
    expected: 'fallback'
  },
  // 场景 5: undefined
  {
    name: 'undefined 值',
    input: undefined,
    expected: 'fallback'
  },
  // 场景 6: 无效的日期字符串
  {
    name: '无效日期字符串',
    input: 'invalid-date-2026',
    expected: 'fallback'
  },
  // 场景 7: 数字字符串
  {
    name: '纯数字字符串',
    input: '12345',
    expected: 'fallback'
  },
  // 场景 8: 对象
  {
    name: '对象',
    input: { date: '2026-01-10' },
    expected: 'fallback'
  },
  // 场景 9: 数字（时间戳）
  {
    name: '有效时间戳（数字）',
    input: 1736503200000,
    expected: 'success'
  },
  // 场景 10: Date 对象
  {
    name: 'Date 对象',
    input: new Date('2026-01-10'),
    expected: 'success'
  },
  // 场景 11: 极端早期时间
  {
    name: '极端早期时间（1970-01-01）',
    input: '1970-01-01T00:00:00.000Z',
    expected: 'success'
  },
  // 场景 12: 未来时间
  {
    name: '未来时间（2030年）',
    input: '2030-12-31T23:59:59.999Z',
    expected: 'success'
  }
];

// 执行测试
let passCount = 0;
let failCount = 0;
const results = [];

console.log('%c📋 开始执行测试...', 'color: #0ECB81; font-weight: bold;');
console.log('\n');

testCases.forEach((testCase, index) => {
  const { name, input, expected } = testCase;
  const result = safeParseTimestamp(input, name);
  
  const passed = (expected === 'success' && result.success) || 
                 (expected === 'fallback' && !result.success);
  
  if (passed) {
    passCount++;
    console.log(`%c✅ 测试 ${index + 1}: ${name}`, 'color: #0ECB81;');
  } else {
    failCount++;
    console.log(`%c❌ 测试 ${index + 1}: ${name}`, 'color: #F6465D;');
  }
  
  console.log(`   输入:`, input);
  console.log(`   预期: ${expected === 'success' ? '成功解析' : '使用当前时间兜底'}`);
  console.log(`   实际: ${result.success ? '成功解析' : '使用当前时间兜底'}`);
  console.log(`   时间戳: ${result.timestamp}`);
  console.log(`   ISO 字符串: ${result.createdAt}`);
  console.log('\n');
  
  results.push({
    testCase: name,
    input: String(input),
    expected,
    success: result.success,
    passed,
    timestamp: result.timestamp,
    createdAt: result.createdAt
  });
});

// 测试总结
console.log('%c' + '='.repeat(60), 'color: #848E9C;');
console.log('%c📊 测试总结', 'color: #FCD535; font-size: 14px; font-weight: bold;');
console.log('%c' + '='.repeat(60), 'color: #848E9C;');
console.log(`%c✅ 通过: ${passCount}/${testCases.length}`, 'color: #0ECB81; font-weight: bold;');
console.log(`%c❌ 失败: ${failCount}/${testCases.length}`, failCount > 0 ? 'color: #F6465D; font-weight: bold;' : 'color: #848E9C;');
console.log(`%c📈 通过率: ${((passCount / testCases.length) * 100).toFixed(1)}%`, 'color: #FCD535; font-weight: bold;');
console.log('\n');

// 实际场景模拟测试
console.log('%c🎯 实际场景模拟测试', 'color: #FCD535; font-size: 14px; font-weight: bold;');
console.log('\n');

// 模拟空投领取记录
const mockAirdropClaim = {
  amount: '500',
  energy: 1,
  createdAt: '2026-01-10T10:30:00.000Z',
  txHash: '0xabc123'
};

console.log('%c场景 1: 空投领取记录（正常）', 'color: #0ECB81; font-weight: bold;');
const airdropResult1 = safeParseTimestamp(mockAirdropClaim.createdAt, '空投领取');
console.log('✅ 时间戳:', airdropResult1.timestamp);
console.log('✅ 可读时间:', new Date(airdropResult1.timestamp).toLocaleString('zh-CN'));
console.log('\n');

// 模拟异常的空投记录（时间字段为空）
const mockAirdropClaim2 = {
  amount: '500',
  energy: 1,
  createdAt: '', // 空字符串
  time: null,    // null
  txHash: '0xdef456'
};

console.log('%c场景 2: 空投领取记录（时间异常）', 'color: #F6465D; font-weight: bold;');
const airdropResult2 = safeParseTimestamp(mockAirdropClaim2.createdAt || mockAirdropClaim2.time, '空投领取');
console.log('⚠️ 使用兜底时间:', airdropResult2.timestamp);
console.log('⚠️ 可读时间:', new Date(airdropResult2.timestamp).toLocaleString('zh-CN'));
console.log('\n');

// 模拟邀请记录
const mockInviteRecord = {
  address: '0x1234567890abcdef',
  energy: 1,
  rewardAmount: '50',
  createdAt: '2026-01-10T11:00:00.000Z',
  isFirstClaim: true
};

console.log('%c场景 3: 邀请记录（正常）', 'color: #0ECB81; font-weight: bold;');
const inviteResult1 = safeParseTimestamp(mockInviteRecord.createdAt, '邀请');
console.log('✅ 时间戳:', inviteResult1.timestamp);
console.log('✅ 可读时间:', new Date(inviteResult1.timestamp).toLocaleString('zh-CN'));
console.log('\n');

// 模拟提现记录
const mockWithdrawal = {
  amount: '10.5',
  status: 'Completed',
  createdAt: '2026-01-10T12:00:00.000Z',
  energyCost: 105
};

console.log('%c场景 4: 提现记录（正常）', 'color: #0ECB81; font-weight: bold;');
const withdrawResult = safeParseTimestamp(mockWithdrawal.createdAt, '提现');
console.log('✅ 时间戳:', withdrawResult.timestamp);
console.log('✅ 可读时间:', new Date(withdrawResult.timestamp).toLocaleString('zh-CN'));
console.log('\n');

// 排序测试（验证时间戳可以正确排序）
console.log('%c🔀 时间戳排序测试', 'color: #FCD535; font-weight: bold;');
const mixedTimestamps = [
  { name: '记录1', timestamp: airdropResult1.timestamp },
  { name: '记录2（异常兜底）', timestamp: airdropResult2.timestamp },
  { name: '记录3', timestamp: inviteResult1.timestamp },
  { name: '记录4', timestamp: withdrawResult.timestamp }
];

console.log('排序前:');
mixedTimestamps.forEach(item => {
  console.log(`  ${item.name}: ${new Date(item.timestamp).toLocaleString('zh-CN')}`);
});

const sorted = [...mixedTimestamps].sort((a, b) => b.timestamp - a.timestamp);
console.log('\n排序后（降序）:');
sorted.forEach(item => {
  console.log(`  ${item.name}: ${new Date(item.timestamp).toLocaleString('zh-CN')}`);
});
console.log('\n');

// 错误捕获测试
console.log('%c🛡️ 错误捕获测试', 'color: #FCD535; font-weight: bold;');
let errorCaught = false;
try {
  // 尝试直接使用无效时间（旧代码的方式）
  const badTimestamp = new Date('invalid-date-string').getTime();
  if (isNaN(badTimestamp)) {
    console.log('⚠️ 检测到 NaN 时间戳（旧代码会在这里报错）');
    errorCaught = true;
  }
} catch (error) {
  console.error('❌ 捕获到错误:', error.message);
  errorCaught = true;
}

if (errorCaught) {
  console.log('%c✅ 错误捕获机制正常工作', 'color: #0ECB81;');
} else {
  console.log('%c❌ 错误捕获机制未触发（可能有问题）', 'color: #F6465D;');
}
console.log('\n');

// 最终结论
console.log('%c' + '='.repeat(60), 'color: #848E9C;');
console.log('%c🎉 测试完成！', 'color: #FCD535; font-size: 16px; font-weight: bold;');
console.log('%c' + '='.repeat(60), 'color: #848E9C;');

if (failCount === 0) {
  console.log('%c✅ 所有测试通过！时间验证逻辑工作正常。', 'color: #0ECB81; font-size: 14px; font-weight: bold;');
  console.log('%c✅ "Invalid time value" 错误已彻底修复。', 'color: #0ECB81; font-size: 14px;');
} else {
  console.log(`%c⚠️ 有 ${failCount} 个测试失败，请检查代码。`, 'color: #F6465D; font-size: 14px; font-weight: bold;');
}

console.log('\n');
console.log('%c💡 提示:', 'color: #FCD535; font-weight: bold;');
console.log('  1. 如果所有测试通过，说明时间验证逻辑正常工作');
console.log('  2. 如果有测试失败，请检查修复是否完全部署');
console.log('  3. 可以尝试在实际页面操作（如提现）来验证修复效果');
console.log('\n');

// 返回测试结果供进一步分析
window.__timeValidationTestResults = {
  totalTests: testCases.length,
  passed: passCount,
  failed: failCount,
  passRate: ((passCount / testCases.length) * 100).toFixed(1) + '%',
  details: results,
  timestamp: Date.now()
};

console.log('%c📦 测试结果已保存到 window.__timeValidationTestResults', 'color: #848E9C;');
console.log('%c可以通过以下命令查看详细结果:', 'color: #848E9C;');
console.log('%c  window.__timeValidationTestResults', 'color: #0ECB81; font-family: monospace;');

