
const { spawn } = require('child_process');
const http = require('http');

(async () => {
  const parts = 'npm start'.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);
  
  let stdoutLog = '';
  let stderrLog = '';
  let isReady = false;

  const serverProc = spawn(cmd, args, {
    cwd: __dirname,
    shell: process.platform === 'win32'
  });

  serverProc.stdout.on('data', (data) => {
    const text = data.toString();
    stdoutLog += text;
    if (!isReady && (text.includes('listening') || text.includes('started') || text.includes('http://'))) {
      isReady = true;
      executeVerificationReq('http://localhost:5000/').then(res => {
        serverProc.kill();
        console.log(JSON.stringify({ ok: res.ok, status: res.status, data: res.data, stdout: stdoutLog, stderr: stderrLog }));
        process.exit(0);
      });
    }
  });

  serverProc.stderr.on('data', (data) => {
    stderrLog += data.toString();
  });

  setTimeout(() => {
    if (!isReady) {
      serverProc.kill();
      console.log(JSON.stringify({ ok: false, status: 'STARTUP_TIMEOUT', stdout: stdoutLog, stderr: stderrLog }));
      process.exit(1);
    }
  }, 10000);
})();

async function executeVerificationReq(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data }));
    });
    req.on('error', (e) => resolve({ ok: false, status: 'NETWORK_ERROR', data: e.message }));
    req.end();
  });
}
    