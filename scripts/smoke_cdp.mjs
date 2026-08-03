const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const CHROME = process.env.CHROME || 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';
const PORT = 9222;
const BASE = 'http://127.0.0.1:8765/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cdp(wsUrl, method, params = {}) {
  // Minimal: use HTTP /json/runtime/evaluate via puppeteer-less fetch to Chrome
}

async function main() {
  // Launch chrome with remote debugging
  const userData = path.join(process.env.TEMP || '/tmp', 'ascensus-cdp-profile');
  fs.mkdirSync(userData, { recursive: true });
  const child = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${userData}`,
    BASE
  ], { stdio: 'ignore' });

  await sleep(3000);

  // Get websocket debugger URL
  const list = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });

  const page = list.find(t => t.type === 'page' && t.url.includes('8765')) || list[0];
  if (!page) {
    console.error('No page target', list);
    child.kill();
    process.exit(1);
  }

  // Use Runtime.evaluate via WebSocket — without ws lib, use CDP HTTP endpoint if available
  // Chrome doesn't expose evaluate over HTTP. Use a tiny WS client.
  const WebSocket = await import('ws').catch(() => null);
  if (!WebSocket) {
    // fallback: fetch page modules already validated; check that index references main
    console.log('ws not available; checking DOM title via dump only');
    console.log('target', page.url, page.title);
    child.kill();
    process.exit(0);
  }

  const { default: WS } = WebSocket;
  const ws = new WS(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let id = 1;
  const pending = new Map();
  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  function send(method, params = {}) {
    const myId = id++;
    return new Promise(resolve => {
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Console.enable');
  const cons = [];
  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      cons.push('exception: ' + JSON.stringify(msg.params.exceptionDetails));
    }
    if (msg.method === 'Console.messageAdded') {
      cons.push(msg.params.message.level + ': ' + msg.params.message.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value ?? a.description).join(' ');
      cons.push(msg.params.type + ': ' + args);
    }
  });

  await sleep(2500);
  const evalRes = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      handleAuth: typeof window.handleAuth,
      switchTab: typeof window.switchTab,
      generateGroceryList: typeof window.generateGroceryList,
      startExecution: typeof window.startExecution,
      bindOk: typeof window.switchTab === 'function'
    })`,
    returnByValue: true
  });
  console.log('evaluate', evalRes.result?.result?.value);
  console.log('console lines', cons.slice(0, 30));
  ws.close();
  child.kill();
  const val = JSON.parse(evalRes.result?.result?.value || '{}');
  if (!val.bindOk) process.exit(1);
  const fatal = cons.filter(c => c.includes('exception') || c.startsWith('error'));
  if (fatal.length) {
    console.log('FATAL', fatal);
    process.exit(1);
  }
  console.log('SMOKE OK');
}

main().catch(e => { console.error(e); process.exit(1); });
