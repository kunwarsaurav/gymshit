const crypto = require('crypto');

const HIK_IP   = '192.168.1.182';
const HIK_PORT = '80';
const HIK_USER = 'admin';
const HIK_PASS = '@Fitness24';

async function hikReq(path, method = 'GET', body = null) {
  const url = `http://${HIK_IP}:${HIK_PORT}${path}`;
  const opts = { method, headers: {} };
  if (body) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  let res = await fetch(url, opts);
  if (res.status === 401) {
    const wwwAuth = res.headers.get('www-authenticate') || '';
    const params = {};
    wwwAuth.replace(/(\w+)="([^"]+)"/g, (_, k, v) => { params[k] = v; });
    wwwAuth.replace(/(\w+)=([^",\s]+)/g, (_, k, v) => { if (!params[k]) params[k] = v; });
    const { realm, nonce, qop, opaque } = params;
    const nc = '00000001', cnonce = crypto.randomBytes(8).toString('hex');
    const uri = new URL(url).pathname + (new URL(url).search || '');
    const ha1 = crypto.createHash('md5').update(`${HIK_USER}:${realm}:${HIK_PASS}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    const rh = qop
      ? crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
      : crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
    let auth = `Digest username="${HIK_USER}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${rh}"`;
    if (opaque) auth += `, opaque="${opaque}"`;
    if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    opts.headers['Authorization'] = auth;
    res = await fetch(url, opts);
  }
  return { status: res.status, body: await res.text() };
}

async function expireUser(employeeNo) {
    console.log(`Setting user ${employeeNo} to EXPIRED (endTime in the past)...`);
    const payload = {
        "UserInfo": {
            "employeeNo": employeeNo,
            "name": "TestUser",
            "userType": "normal",
            "Valid": {
                "enable": true,
                "beginTime": "2000-01-01T00:00:00",
                "endTime": "2020-01-01T00:00:00",
                "timeType": "local"
            }
        }
    };
    const res = await hikReq('/ISAPI/AccessControl/UserInfo/SetUp?format=json', 'PUT', payload);
    console.log("Response:", res.status, res.body);
}

expireUser("9867782924");
