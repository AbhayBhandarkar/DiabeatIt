import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('all screens: both themes, desktop and narrow phone, accessible contrast',async({page})=>{
  test.setTimeout(180000);
  await page.goto('/');await page.getByRole('button',{name:'Explore the working demo'}).click();
  await expect(page.getByRole('heading',{name:'Hello, Meena.'})).toBeVisible();
  const failures:unknown[]=[];
  for(const theme of ['light','dark']){
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
    for(const width of [1440,360]){
      await page.setViewportSize({width,height:900});
      for(const name of ['Today','Medicines','Food','Learn',width<760?'Care':'Care Circle']){
        const nav=page.getByRole('navigation',{name:width<760?'Mobile navigation':'Main navigation',exact:true});
        await nav.getByRole('button',{name,exact:true}).click();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${theme} ${width} overflow`).toBe(true);
        const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        if(result.violations.length)failures.push({theme,width,name,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
      }
    }
  }
  expect(failures).toEqual([]);
});

test('documents, privacy revocation, export and appointment print',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Explore the working demo'}).click();
  await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Medicines',exact:true}).click();
  await page.getByRole('button',{name:'Upload',exact:true}).click();
  await page.getByLabel('Document · maximum 2 MB').setInputFiles({name:'fictional.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% fictional fixture\n%%EOF')});
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Upload document'}).click();
  await expect(page.getByText('fictional.pdf',{exact:true})).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download fictional.pdf'}).click();expect((await downloadPromise).suggestedFilename()).toBe('document.pdf');
  await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Care Circle',exact:true}).click();
  await page.getByRole('button',{name:'Appointment Ready'}).click();
  await page.emulateMedia({media:'print'});await expect(page.locator('.print-report')).toBeVisible();await expect(page.locator('.app-shell')).not.toBeVisible();await page.emulateMedia({media:'screen'});await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Manage access'}).click();await page.getByRole('checkbox',{name:'Companion access Turn off to revoke all access'}).uncheck();await page.getByRole('button',{name:'Save sharing choices'}).click();
  await page.getByRole('combobox',{name:'Demo role'}).selectOption('companion');await expect(page.getByRole('status')).toContainText('revoked');await expect(page.getByRole('combobox',{name:'Demo role'})).toHaveValue('patient');
  await page.getByRole('button',{name:'Settings & privacy'}).click();const exported=page.waitForEvent('download');await page.getByRole('link',{name:'Export fictional record'}).click();expect((await exported).suggestedFilename()).toBe('diabeatit-fictional-record.json');
});

test('offline writes are not claimed saved and the form preserves input',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'Explore the working demo'}).click();
  await page.getByRole('button',{name:'Add glucose Record a reading'}).click();await page.getByRole('spinbutton',{name:'Reading'}).fill('140');await context.setOffline(true);await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('status').filter({hasText:'This change was not saved'})).toBeVisible();await context.setOffline(false);await page.getByRole('button',{name:'Close dialog'}).click();
});

test('screenshots and larger text reflow',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await page.goto('/');await page.getByRole('button',{name:'Explore the working demo'}).click();await expect(page.getByRole('heading',{name:'Hello, Meena.'})).toBeVisible();await page.screenshot({path:'test-results/desktop-light.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/phone-light.png',fullPage:true});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await page.screenshot({path:'test-results/phone-dark.png',fullPage:true});
  await page.evaluate(()=>{document.documentElement.dataset.large='true';});
  for(const name of ['Today','Medicines','Food','Learn','Care']){await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name).toBe(true);}
});