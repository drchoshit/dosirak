import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('period changes and stale submissions preserve all saved orders and coupons', async () => {
  // Run the actual server with its own disposable database, never backend/data.sqlite.
  const directory = await fs.mkdtemp(path.join(backend, '.period-test-'));
  let child;
  let db;
  try {
    await Promise.all(['server.js', 'db.js'].map(name => fs.copyFile(path.join(backend, name), path.join(directory, name))));
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    child = spawn(process.execPath, ['server.js'], {
      cwd: directory,
      windowsHide: true,
      env: {
        ...process.env, NODE_ENV: 'test', PORT: String(port), UPLOAD_DIR: path.join(directory, 'uploads'),
        ADMIN_USER: 'period-test-admin', ADMIN_PASS: 'period-test-password', ADMIN_SECRET: 'period-test-secret',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    const base = `http://127.0.0.1:${port}/api`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await fetch(`${base}/admin/me`)).ok; } catch {}
      if (ready || child.exitCode !== null) break;
      await delay(100);
    }
    assert.ok(ready, logs);
    db = new Database(path.join(directory, 'data.sqlite'));
    db.exec(`
      UPDATE policy SET start_date='2026-09-14', end_date='2026-09-18';
      INSERT INTO students(id, code, name) VALUES(1, 'test-student', 'Test Student');
      INSERT INTO orders(student_id,date,slot,portion,price,status,created_at,updated_at) VALUES
        (1,'2026-06-01','LUNCH','BASE',9000,'PAID','original','original'),
        (1,'2026-09-14','LUNCH','EXTRA',12000,'SELECTED','original','original'),
        (1,'2026-09-15','DINNER','BASE',0,'PAID','original','original');
      INSERT INTO carryovers(student_id,from_date,from_slot,to_date,to_slot,created_at) VALUES
        (1,'2026-05-25','LUNCH','2026-06-01','DINNER','original'),
        (1,'2026-09-01','LUNCH','2026-09-18','DINNER','original');
      INSERT INTO phone_orders(student_id,date,slot,price,status,created_at,updated_at)
        VALUES(1,'2026-09-16','LUNCH',9000,'PAID','original','original');
      INSERT INTO carryover_coupons(id,student_id,from_date,from_slot,used_order_id,expires_at,created_at) VALUES
        (7,1,'2026-06-01','LUNCH',NULL,'2099-01-01','original'),
        (8,1,'2026-06-01','DINNER',3,'2099-01-01','original');
      UPDATE orders SET carryover_coupon_id=8 WHERE id=3;
    `);
    const snapshot = () => Object.fromEntries(['orders', 'phone_orders', 'carryovers', 'carryover_coupons'].map(
      table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]
    ));
    const before = snapshot();
    const active = await (await fetch(`${base}/policy/active?code=test-student`)).json();
    assert.deepEqual(active.carryovers.map(row => row.to_date), ['2026-09-18']);
    assert.deepEqual(active.carryover_coupons.map(row => row.id), [7]);
    const history = await (await fetch(`${base}/student/orders/test-student`)).json();
    assert.ok(history.orders.some(row => row.date === '2026-06-01'));
    assert.deepEqual(snapshot(), before);

    const previousPolicy = db.prepare('SELECT * FROM policy WHERE id=1').get();
    const nextPolicy = { ...previousPolicy, start_date: '2026-09-21', end_date: '2026-09-25' };
    const unauthorized = await fetch(`${base}/admin/policy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextPolicy),
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(db.prepare('SELECT * FROM policy WHERE id=1').get(), previousPolicy);
    assert.deepEqual(snapshot(), before);
    const login = await fetch(`${base}/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'period-test-admin', password: 'period-test-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const savePolicy = await fetch(`${base}/admin/policy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(nextPolicy),
    });
    assert.equal(savePolicy.status, 200);
    assert.deepEqual(db.prepare('SELECT * FROM policy WHERE id=1').get(), nextPolicy);
    const next = await (await fetch(`${base}/policy/active?code=test-student`)).json();
    assert.deepEqual(next.carryovers, []);
    assert.deepEqual(next.carryover_coupons.map(row => row.id), [7]);
    assert.deepEqual(snapshot(), before);

    for (const date of ['2026-09-14', '2026-09-28']) {
      const response = await fetch(`${base}/orders/commit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'test-student', items: [
          { date: '2026-09-21', slot: 'LUNCH', portion: 'BASE', carryover_coupon_id: 7 },
          { date, slot: 'DINNER', portion: 'EXTRA' },
        ] }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'ORDER_OUTSIDE_PERIOD');
      assert.deepEqual(snapshot(), before);
    }

    const committed = await fetch(`${base}/orders/commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'test-student', items: [
        { date: '2026-09-21', slot: 'LUNCH', portion: 'BASE', carryover_coupon_id: 7 },
      ] }),
    });
    assert.equal(committed.status, 200, await committed.text());
    const after = snapshot();
    assert.deepEqual(after.orders.filter(row => row.id <= 3), before.orders);
    assert.deepEqual(after.phone_orders, before.phone_orders);
    assert.deepEqual(after.carryovers, before.carryovers);
    assert.deepEqual(after.carryover_coupons.find(row => row.id === 8), before.carryover_coupons.find(row => row.id === 8));
    assert.equal(after.orders.find(row => row.date === '2026-09-21').price, 0);
    assert.ok(after.carryover_coupons.find(row => row.id === 7).used_order_id);
  } finally {
    db?.close();
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    // Only remove the exact temporary directory created by this test.
    assert.equal(path.dirname(directory), backend);
    assert.ok(path.basename(directory).startsWith('.period-test-'));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
