const http = require('http');

// Test login
function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(options, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b), headers: res.headers }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(path, cookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost', port: 3000, path,
      headers: cookie ? { 'Cookie': cookie } : {}
    };
    const req = http.request(options, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b), setCookie: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== Test 1: Login with wrong password ===');
  let res = await post('/api/login', { username: 'admin', password: 'wrong' });
  console.log('Status:', res.status, 'Body:', JSON.stringify(res.body));

  console.log('\n=== Test 2: Login with correct password ===');
  res = await post('/api/login', { username: 'admin', password: 'VexaTeam12@#' });
  console.log('Status:', res.status, 'Body:', JSON.stringify(res.body));
  const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
  console.log('Cookie:', cookie);

  console.log('\n=== Test 3: Access stats with session ===');
  res = await get('/api/stats', cookie);
  console.log('Status:', res.status, 'Body keys:', Object.keys(res.body));

  console.log('\n=== Test 4: Access customers ===');
  res = await get('/api/customers', cookie);
  console.log('Status:', res.status, 'Customers:', res.body.customers?.length);

  console.log('\n=== Test 5: Logout ===');
  res = await post('/api/logout', {});
  console.log('Status:', res.status, 'Body:', JSON.stringify(res.body));

  console.log('\n=== Test 6: Access stats WITHOUT session (should fail) ===');
  res = await get('/api/stats');
  console.log('Status:', res.status, 'Body:', JSON.stringify(res.body));
}

main().catch(console.error);
