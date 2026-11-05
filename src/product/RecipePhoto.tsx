import { recipePhotos } from '../../shared/recipePhotos';
export default function RecipePhoto({id,detailed=false}:{id:string;detailed?:boolean}){
 const photo=recipePhotos.find(p=>p.id===id);if(!photo)return null;
 return <figure className="recipe-figure"><img src={photo.src} alt={`Serving idea: ${photo.title.replace(/\.(jpg|png)$/i,'')}`} width="1000" height="700" loading="lazy"/><figcaption>{detailed&&<>{photo.note} </>}Photo: {photo.author} · <a href={photo.sourcePage} target="_blank" rel="noreferrer">Original</a> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>{detailed&&<>. {photo.changes}</>}</figcaption></figure>;
}