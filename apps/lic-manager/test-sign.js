const http = require('http');

const data = JSON.stringify({
  requestRaw: JSON.stringify({
    schema: "vexapacs.install-request.v1",
    generatedAt: "2026-06-18T14:30:59.725Z",
    machineId: "76267215a3ae46101c8be085298b46dacc16d272600016107e728e45c1bebef5",
    machine: {
      machineGuid: "c1dc8248-8423-431e-bf7a-c5ba5768ea90",
      hostname: "WIN-GOTUOL41JDF",
      platform: "win32",
      arch: "x64",
      cpuModel: "QEMU Virtual CPU version 2.5+",
      macs: ["bc:24:11:28:e2:f8", "bc:24:11:28:e2:f8"]
    },
    requestedModules: ["DESKTOP_VIEWER", "ECG_VIEWER", "MOBILE_VIEWER", "PACS_DIMSE", "PACS_MWL", "RIS"],
    installerVersion: "1.0.0",
    note: ""
  }),
  customerName: "RS DEMO TEST",
  customerId: "CUST-001",
  modules: ["RIS", "PACS_DIMSE", "DESKTOP_VIEWER"],
  expiresAt: "2027-06-17",
  maxUsers: 25
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/sign',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
