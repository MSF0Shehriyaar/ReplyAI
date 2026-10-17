import { secret, saveSecret, audit, AppError } from './server';

export type GoogleDriveInfo = {
  connected: boolean;
  email?: string;
  connectedAt?: number;
};

export async function getGoogleDriveCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([
    secret('google_drive_client_id'),
    secret('google_drive_client_secret')
  ]);
  const envClientId = (typeof process !== 'undefined' ? process.env?.GOOGLE_CLIENT_ID : '') || '';
  const envClientSecret = (typeof process !== 'undefined' ? process.env?.GOOGLE_CLIENT_SECRET : '') || '';
  return { 
    clientId: clientId || envClientId, 
    clientSecret: clientSecret || envClientSecret 
  };
}

export async function saveGoogleDriveCredentials(clientId: string, clientSecret: string): Promise<void> {
  await Promise.all([
    saveSecret('google_drive_client_id', clientId.trim()),
    saveSecret('google_drive_client_secret', clientSecret.trim())
  ]);
  await audit('Google Drive credentials saved', 'Updated Google OAuth client ID and secret');
}

export async function getValidGoogleDriveToken(): Promise<string> {
  const [accessToken, expiresAtStr, refreshToken, clientId, clientSecret] = await Promise.all([
    secret('google_drive_access_token'),
    secret('google_drive_token_expires_at'),
    secret('google_drive_refresh_token'),
    secret('google_drive_client_id'),
    secret('google_drive_client_secret')
  ]);

  const expiresAt = expiresAtStr ? Number(expiresAtStr) : 0;
  // If access token is still valid (with 60s buffer), return it
  if (accessToken && expiresAt > Date.now() + 60000) {
    return accessToken;
  }

  // If we have a refresh token, refresh the access token
  const creds = await getGoogleDriveCredentials();
  const effectiveClientId = clientId || creds.clientId;
  const effectiveClientSecret = clientSecret || creds.clientSecret;
  if (refreshToken && effectiveClientId && effectiveClientSecret) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: effectiveClientId,
        client_secret: effectiveClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new AppError('Google Drive token refresh failed: ' + (err?.error_description || res.statusText), 401);
    }

    const data: any = await res.json();
    const newAccessToken = data.access_token;
    const newExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);

    await Promise.all([
      saveSecret('google_drive_access_token', newAccessToken),
      saveSecret('google_drive_token_expires_at', String(newExpiresAt))
    ]);

    return newAccessToken;
  }

  throw new AppError('Google Drive is not connected. Please connect in Connections.', 412);
}

export async function getOrCreateAutomationFolder(): Promise<{ id: string; name: string }> {
  const token = await getValidGoogleDriveToken();

  // If user provided a specific folder ID directly in .env, use it
  const envFolderId = (typeof process !== 'undefined' ? process.env?.GOOGLE_DRIVE_FOLDER_ID : '') || '';
  const folderName = (typeof process !== 'undefined' ? process.env?.GOOGLE_DRIVE_FOLDER_NAME : '') || 'Nina_Automation_Snaps';

  if (envFolderId) {
    return { id: envFolderId.trim(), name: folderName };
  }
  
  // 1. Check if the dedicated folder already exists
  const query = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (searchRes.ok) {
    const data: any = await searchRes.json();
    if (data?.files && data.files.length > 0) {
      return { id: data.files[0].id, name: data.files[0].name };
    }
  }

  // 2. If not found, create a dedicated folder in user's Drive
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Dedicated folder for Nina Automation View-Once Snaps and Photos'
    })
  });

  if (!createRes.ok) {
    const err: any = await createRes.json().catch(() => ({}));
    throw new AppError('Failed to create dedicated Google Drive folder: ' + (err?.error?.message || createRes.statusText), 502);
  }

  const created: any = await createRes.json();
  await audit('Google Drive folder created', `Created dedicated folder "${folderName}" (ID: ${created.id})`);
  return { id: created.id, name: folderName };
}

export async function listGoogleDriveImages(pageSize = 60): Promise<Array<{ id: string; name: string; mimeType: string; thumbnailLink?: string; size?: number; createdTime?: string }>> {
  const token = await getValidGoogleDriveToken();
  const folder = await getOrCreateAutomationFolder();

  // STRICT: ONLY query files whose parent is the dedicated folder
  const query = encodeURIComponent(`'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,thumbnailLink,size,createdTime)");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=${pageSize}&orderBy=createdTime%20desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new AppError('Failed to fetch Google Drive files: ' + (err?.error?.message || res.statusText), 502);
  }

  const data: any = await res.json();
  const files = data?.files || [];

  return files.map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    thumbnailLink: f.thumbnailLink,
    size: f.size ? Number(f.size) : undefined,
    createdTime: f.createdTime
  }));
}

export async function downloadGoogleDriveFile(fileId: string): Promise<{ buffer: ArrayBuffer; mimeType: string; name: string }> {
  const token = await getValidGoogleDriveToken();
  
  // 1. Get file metadata
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!metaRes.ok) {
    throw new AppError('Failed to find Google Drive file', 404);
  }
  const meta: any = await metaRes.json();

  // 2. Download media bytes
  const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000)
  });
  if (!mediaRes.ok) {
    throw new AppError('Failed to download Google Drive image content', 502);
  }

  const buffer = await mediaRes.arrayBuffer();
  return {
    buffer,
    mimeType: meta.mimeType || 'image/jpeg',
    name: meta.name || 'drive_photo.jpg'
  };
}

export async function uploadGoogleDriveFile(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType = 'image/jpeg'
): Promise<{ id: string; name: string; mimeType: string }> {
  const token = await getValidGoogleDriveToken();
  const folder = await getOrCreateAutomationFolder();

  const safeName = fileName || `Nina_Snap_${Date.now()}.jpg`;
  const safeMime = mimeType || 'image/jpeg';

  const metadata: any = {
    name: safeName,
    mimeType: safeMime,
    parents: [folder.id],
    description: 'Nina Kurain Exclusive Photoshoot Snap'
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaPartHeader = `Content-Type: ${safeMime}\r\n\r\n`;

  const enc = new TextEncoder();
  const metaBytes = enc.encode(delimiter + metaPart + delimiter + mediaPartHeader);
  const closeBytes = enc.encode(closeDelimiter);
  const fileBytes = new Uint8Array(buffer);

  const combined = new Uint8Array(metaBytes.length + fileBytes.length + closeBytes.length);
  combined.set(metaBytes, 0);
  combined.set(fileBytes, metaBytes.length);
  combined.set(closeBytes, metaBytes.length + fileBytes.length);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(combined.length)
    },
    body: combined,
    signal: AbortSignal.timeout(30000)
  });

  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new AppError('Google Drive direct upload failed: ' + (err?.error?.message || err?.error_description || res.statusText), 502);
  }

  const data: any = await res.json();
  await audit('Google Drive upload', `Uploaded "${data.name || safeName}" directly to Google Drive (ID: ${data.id})`);

  return {
    id: data.id,
    name: data.name || safeName,
    mimeType: data.mimeType || safeMime
  };
}
