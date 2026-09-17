import { chromium } from 'playwright'
const EXE='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS='/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const b=await chromium.launchPersistentContext(`/tmp/navlogo-${Date.now()}`,{executablePath:EXE,args:['--no-sandbox','--enable-unsafe-swiftshader'],viewport:{width:390,height:844},deviceScaleFactor:3,locale:'es-ES'})
const p=b.pages()[0]
await p.goto('http://127.0.0.1:4366',{waitUntil:'networkidle'})
await p.waitForTimeout(3000)
// skip onboarding straight to the app by marking it done locally
await p.evaluate(async()=>{
  const o=indexedDB.open('training-os'); const db=await new Promise(r=>{o.onsuccess=()=>r(o.result)})
  const row=await new Promise(r=>{const q=db.transaction('settings').objectStore('settings').get('app');q.onsuccess=()=>r(q.result)})
  row.onboardingVersion=1; row.trainingProfile={mainGoal:'hypertrophy',daysPerWeek:4,onboardingVersion:1}
  await new Promise(r=>{const q=db.transaction('settings','readwrite').objectStore('settings').put(row);q.onsuccess=()=>r()})
})
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(4000)
const nav=await p.locator('nav').first()
if(!(await nav.count())){ console.log('sin nav:', (await p.textContent('body')).slice(0,120)); process.exit(1) }
const box=await nav.boundingBox()
const clip={x:0,y:box.y-14,width:390,height:box.height+14}
for(let i=0;i<6;i++){ await p.screenshot({path:`${SHOTS}/nav-${i}.png`,clip}); await p.waitForTimeout(600) }
console.log('capturado; img cargada:', await p.evaluate(()=>{const im=document.querySelector('.nav-logo3d img');return im?{complete:im.complete,w:im.naturalWidth,h:im.naturalHeight}:null}))
await b.close()
