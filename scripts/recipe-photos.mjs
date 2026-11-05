import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root=new URL('../public/recipes/',import.meta.url);
const requests=[['moong','Moonglet chilla with curd and hot tea'],['oats','oats upma'],['chana','chickpea salad'],['plate','intitle:"Vegetarian Thali.jpg"']];
const strip=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&');
await mkdir(root,{recursive:true});
const photos=[];
for(const [id,query] of requests){
 const url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'5',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1000',format:'json'});
 const response=await fetch(url,{headers:{'User-Agent':'DiabeatIT/2.0 (recipe image attribution)'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Metadata failed: ${response.status}`);
 const body=await response.json();const candidates=Object.values(body.query?.pages||{}).map(p=>({title:p.title,...p.imageinfo?.[0]})).filter(p=>p.url&&/\.(jpg|jpeg|png)(\?|$)/i.test(p.url)&&/^(CC BY-SA 4.0|CC BY-SA 3.0|CC BY 4.0|CC0|Public domain)$/.test(p.extmetadata?.LicenseShortName?.value||''));
 if(!candidates.length)throw new Error(`No licensed image for ${query}`);
 const p=candidates[0],source=p.thumburl||p.url;const image=await fetch(source,{headers:{'User-Agent':'DiabeatIT/2.0 (recipe image attribution)'},signal:AbortSignal.timeout(25000)});if(!image.ok)throw new Error(`Image failed: ${image.status}`);
 const bytes=Buffer.from(await image.arrayBuffer());if(bytes.length>20000000)throw new Error('Image too large');
 await sharp(bytes).rotate().resize(1000,700,{fit:'cover'}).webp({quality:84}).toFile(fileURLToPath(new URL(`${id}.webp`,root)));
 photos.push({id,src:`/recipes/${id}.webp`,title:strip(p.title.replace(/^File:/,'')),author:strip(p.extmetadata.Artist?.value),license:strip(p.extmetadata.LicenseShortName.value),licenseUrl:p.extmetadata.LicenseUrl?.value||'',sourcePage:p.descriptionurl,originalUrl:p.url,changes:'Resized, cropped to 10:7 and converted to WebP; metadata removed.',note:'Serving inspiration. Not a photograph of the exact authored recipe or a measured portion.',accessedOn:new Date().toISOString().slice(0,10)});
 console.log(id,p.title,photos.at(-1).license);
}
await writeFile(new URL('credits.json',root),JSON.stringify(photos,null,2)+'\n');
await writeFile(new URL('../shared/recipePhotos.ts',import.meta.url),'// Generated from Wikimedia Commons metadata; retain attribution with redistributed photos.\nexport const recipePhotos = '+JSON.stringify(photos,null,2)+' as const;\n');