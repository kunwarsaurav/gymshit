const http = require('http');

const optionsList = [
  { path: '/', expectedStatus: [200, 304] },
  { path: '/api/me', expectedStatus: [401] },
  { path: '/api/members', expectedStatus: [401] },
  { path: '/api/hikvision/settings', expectedStatus: [401] },
  { path: '/api/plans', expectedStatus: [401] },
  { path: '/api/logistics', expectedStatus: [401] }
];

let successCount = 0;

async function testEndpoint(options) {
  return new Promise((resolve) => {
    http.get({
      hostname: 'localhost',
      port: 3001,
      path: options.path,
    }, (res) => {
      if (options.expectedStatus.includes(res.statusCode)) {
        console.log(`[PASS] GET ${options.path} -> Status: ${res.statusCode}`);
        successCount++;
        resolve(true);
      } else {
        console.error(`[FAIL] GET ${options.path} -> Expected ${options.expectedStatus.join(' or ')}, got ${res.statusCode}`);
        resolve(false);
      }
    }).on('error', (e) => {
      console.error(`[ERROR] GET ${options.path} -> ${e.message}`);
      resolve(false);
    });
  });
}

async function runTests() {
  console.log('--- E2E Routing Smoke Test ---');
  for (const opt of optionsList) {
    await testEndpoint(opt);
  }
  
  console.log(`\nResults: ${successCount}/${optionsList.length} passed.`);
  if (successCount === optionsList.length) {
    console.log('✅ ALL TESTS PASSED! Routing is intact.');
  } else {
    console.log('❌ SOME TESTS FAILED! Routes might be broken.');
  }
}

runTests();
