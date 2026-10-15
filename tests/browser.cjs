// Run with Playwright available: node tests/browser.cjs
// Cloud tests use a fake SDK, not Supabase or real RLS.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: require('node:path').resolve(__dirname, '..'), stdio: 'ignore' });
const base = 'http://127.0.0.1:8765';
function fakeSDK() {
  window.mock = { rows: [], user: null, fail: '', delay: 0, callbacks: [], confirmation: false };
  const m = window.mock;
  const restored = sessionStorage.getItem('mock-session');
  if (restored) Object.assign(m, JSON.parse(restored));
  addEventListener('beforeunload', () => sessionStorage.setItem('mock-session', JSON.stringify({user:m.user, rows:m.rows})));
  function query() {
    let action = 'select', payload, filters = [], single = false, optional = false, range;
    const q = {
      select() { return q; }, insert(value) { action = 'insert'; payload = value; return q; },
      update(value) { action = 'update'; payload = value; return q; }, delete() { action = 'delete'; return q; },
      eq(key,value) { filters.push([key,value]); return q; }, order() { return q; }, range(a,b) { range=[a,b]; return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; optional = true; return q; },
      async then(resolve,reject) {
        const owner = m.user?.id, delay = m.delay;
        if (delay) await new Promise(r=>setTimeout(r,delay));
        let result;
        if (m.fail === action) result = {error:{message:'network failure'}};
        else {
          let rows=m.rows.filter(row=>row.user_id===owner && filters.every(([key,value])=>row[key]===value));
          if(action==='insert') {
            if(m.rows.some(row=>row.id===payload.id)) result={error:{code:'23505',message:'duplicate'}};
            else if(payload.user_id!==owner) result={error:{message:'row level security'}};
            else {const row={created_at:'2026-01-01',...payload};m.rows.push(row);rows=[row];}
          }
          if(action==='update') rows.forEach(row=>Object.assign(row,payload));
          if(action==='delete') m.rows=m.rows.filter(row=>!rows.includes(row));
          if(range)rows=rows.slice(range[0],range[1]+1);
          result ||= single ? (!rows.length && !optional ? {error:{message:'not found'}} : {data:rows[0]||null}) : {data:rows};
        }
        resolve(result);
      }
    };return q;
  }
  m.switch = user => {m.user=user;m.callbacks.forEach(fn=>fn('SIGNED_IN',user?{user}:null));};
  return {from:query,auth:{onAuthStateChange(fn){m.callbacks.push(fn);return {};},async getSession(){return {data:{session:m.user?{user:m.user}:null}};},async signInWithPassword({email}){const user={id:email.split('@')[0],email};m.switch(user);return {data:{session:{user}}};},async signUp(args){m.redirect=args.options.emailRedirectTo;if(m.confirmation)return {data:{session:null}};return this.signInWithPassword(args);},async signOut(){m.switch(null);return {error:null};}}};
}
(async()=>{
  let browser;
  try {
    for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
    const p=await browser.newPage({timezoneId:'Asia/Taipei'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
    // Keep the missing-configuration test independent of the real public config.
    await p.route('**/supabase-config.js', route => route.fulfill({contentType:'text/javascript',body:'window.SUPABASE_CONFIG={url:"",key:""};'}));
    await p.goto(base);await p.waitForFunction(()=>document.querySelector('#auth-message').textContent.includes('尚未設定'));
    const old=[{id:'original',text:'舊任務',completed:false},{id:'done',text:'舊完成',completed:true}];
    await p.evaluate(x=>localStorage.setItem('my-todo-list.v1',JSON.stringify(x)),old);await p.reload();
    assert.equal(await p.locator('.todo-item').count(),2);assert.equal(await p.locator('#progress').getAttribute('value'),'50');
    assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('my-todo-list.v1'))),old);
    await p.locator('#todo-input').fill('本機新增');await p.locator('#todo-input').press('Enter');await p.reload();assert.equal(await p.locator('.todo-item').count(),3);
    await p.locator('.todo-label input').first().check();await p.locator('.todo-label input').first().uncheck();await p.locator('.delete-button').last().click();
    await p.route('**/supabase-config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.SUPABASE_CONFIG={url:"https://abcdefghijklmnopqrst.supabase.co",key:"sb_publishable_testpublic"};'}));
    await p.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm',route=>route.fulfill({contentType:'text/javascript',body:`export const createClient=${fakeSDK.toString()};`}));
    await p.reload();await p.waitForFunction(()=>window.mock);
    await p.evaluate(()=>mock.confirmation=true);await p.locator('#email').fill('a@test.invalid');await p.locator('#password').fill('test-password');await p.locator('#signup').click();await p.waitForFunction(()=>document.querySelector('#auth-message').textContent.includes('確認信'));
    assert.equal(await p.evaluate(()=>mock.redirect),base+'/');
    await p.locator('#password').fill('test-password');await p.locator('#login').click();await p.waitForFunction(()=>document.querySelector('#mode-label').textContent.includes('a@test.invalid') && !document.querySelector('#todo-input').disabled);
    assert.equal(await p.locator('.todo-item').count(),0);assert.equal(await p.locator('#import-preview li').count(),2);
    assert(await p.locator('#import-tasks').isDisabled());
    await p.locator('#backup').click();await p.locator('#import-consent').check();
    await p.evaluate(()=>mock.fail='insert');await p.locator('#import-tasks').click();await p.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('失敗 2'));
    await p.evaluate(()=>mock.fail='');await p.locator('#backup').click();await p.locator('#import-consent').check();await p.locator('#import-tasks').click();await p.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('失敗 0'));
    assert.equal(await p.evaluate(()=>mock.rows.length),2);assert.equal(await p.locator('.todo-item').count(),2);
    // Direct duplicate retry also verifies the same deterministic IDs and no overwrite.
    await p.evaluate(async()=>{for(const todo of JSON.parse(localStorage.getItem('my-todo-list.v1')))await TaskStore.importOne({...todo,category:'生活',priority:'中',dueDate:''},'a');});assert.equal(await p.evaluate(()=>mock.rows.length),2);
    await p.locator('#todo-input').fill('雲端工作');await p.selectOption('#category','工作');await p.selectOption('#priority','高');await p.locator('#due-date').fill('2000-01-01');
    await p.evaluate(()=>mock.fail='insert');await p.locator('.add-button').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('輸入已保留'));assert.equal(await p.locator('#todo-input').inputValue(),'雲端工作');
    await p.evaluate(()=>mock.fail='');await p.locator('.add-button').click();await p.waitForFunction(()=>document.querySelectorAll('.todo-item').length===3);
    assert.equal(await p.locator('.overdue').count(),1);await p.selectOption('#category-filter','工作');assert.equal(await p.locator('.todo-item').count(),1);
    await p.evaluate(()=>mock.fail='update');await p.locator('.todo-label input').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('重試'));assert.equal(await p.locator('.todo-label input').isChecked(),false);
    await p.evaluate(()=>mock.fail='');
    await p.locator('.todo-label input').click();await p.waitForFunction(()=>document.querySelectorAll('.overdue').length===0);await p.locator('.todo-label input').click();await p.waitForFunction(()=>document.querySelectorAll('.overdue').length===1);
    await p.evaluate(()=>mock.fail='delete');await p.locator('.delete-button').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('重試'));assert.equal(await p.locator('.todo-item').count(),1);
    await p.evaluate(()=>mock.fail='');await p.locator('.delete-button').click();await p.waitForFunction(()=>document.querySelectorAll('.todo-item').length===0);
    await p.reload();await p.waitForFunction(()=>document.querySelector('#mode-label').textContent.includes('a@test.invalid')&&!document.querySelector('#todo-input').disabled);assert.equal(await p.locator('.todo-item').count(),2);
    // Account switch during an old request must not display A's data in B's list.
    await p.evaluate(()=>{mock.delay=200;document.querySelector('#reload-cloud').click();mock.switch({id:'b',email:'b@test.invalid'});});await p.waitForFunction(()=>document.querySelector('#mode-label').textContent.includes('b@test.invalid')&&!document.querySelector('#todo-input').disabled);
    assert.equal(await p.locator('.todo-item').count(),0);assert((await p.locator('#import-summary').textContent()).includes('可匯入 0'));
    await assert.rejects(p.evaluate(()=>TaskStore.importOne({id:'original',text:'舊任務',completed:false,category:'生活',priority:'中',dueDate:''},'b')));
    await p.locator('#logout').click();await p.waitForFunction(()=>document.querySelector('#mode-label').textContent.includes('本機模式'));assert.equal(await p.locator('.todo-item').count(),2);
    assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('my-todo-list.v1')).length),2);
    for(const width of [320,375,1280]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    // Reject privileged keys before loading SDK.
    await p.evaluate(async()=>{window.SUPABASE_CONFIG={url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_secret_forbidden'};try{await Cloud.initialize();throw Error('accepted');}catch(e){if(e.message==='accepted')throw e;}});
    await p.evaluate(()=>localStorage.setItem('my-todo-list.v1','damaged-original'));await p.reload();await p.waitForFunction(()=>window.mock);
    await p.locator('#todo-input').fill('不能覆寫');await p.locator('.add-button').click();assert.equal(await p.evaluate(()=>localStorage.getItem('my-todo-list.v1')),'damaged-original');
    assert.deepEqual(errors,[]);console.log('PASS: 本機回歸、舊資料、缺失設定、Email確認提示、模擬登入/登出、雲端CRUD/失敗保留、欄位轉換、分類/逾期/進度、備份確認、匯入重試防重複、跨帳號阻擋與舊回應隔離、手機桌面、禁止secret key。模擬SDK，非真實RLS驗證。');
  } finally {if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
