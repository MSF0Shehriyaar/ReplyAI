import {requireWorkspaceRequest,errorResponse,limitsStatus,refreshAllProviderLimits} from '@/lib/server';
export async function GET(){try{requireWorkspaceRequest();return Response.json(await limitsStatus(),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{await requireWorkspaceRequest(request);return Response.json(await refreshAllProviderLimits(),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
