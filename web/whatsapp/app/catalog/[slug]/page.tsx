import CatalogView from '../catalog-view';
export default async function PublishedCatalog({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <CatalogView slug={slug}/>;}
