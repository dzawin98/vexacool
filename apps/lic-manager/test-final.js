const http = require('http');

function post(path, data, cookie) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(cookie ? { 'Cookie': cookie } : {})
      }
    };
    const req = http.request(options, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        body: JSON.parse(b),
        cookie: res.headers['set-cookie']?.[0]?.split(';')[0]
      }));
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
      res.on('end', () => resolve({
        status: res.statusCode,
        body: b.length < 200 ? b : '(content)',
        contentType: res.headers['content-type']
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // Test static files tanpa cookie
  console.log('=== CSS tanpa login ===');
  let r = await get('/css/style.css');
  console.log('Status:', r.status, 'Type:', r.contentType);

  console.log('\n=== JS tanpa login ===');
  r = await get('/js/app.js');
  console.log('Status:', r.status, 'Type:', r.contentType);

  console.log('\n=== Login ===');
  r = await post('/api/login', { username: 'admin', password: 'VexaTeam12@#' });
  console.log('Status:', r.status, 'Body:', JSON.stringify(r.body));
  const cookie = r.cookie;

  console.log('\n=== Dashboard dengan cookie ===');
  r = await get('/', cookie);
  console.log('Status:', r.status, 'Type:', r.contentType);

  console.log('\n=== Stats dengan cookie ===');
  r = await get('/api/stats', cookie);
  console.log('Status:', r.status);

  console.log('\n=== Customers dengan cookie ===');
  r = await get('/api/customers', cookie);
  console.log('Status:', r.status);

  console.log('\n=== Selesai ===');
}

main().catch(console.error);
