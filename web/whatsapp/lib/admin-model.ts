export type AdminTenant={id:string;name:string;ownerName:string;ownerEmail:string;status:string;createdAt:number;updatedAt:number;calls:number;tokens:number;sent:number;received:number;users:number;chats:number;orders:number;failed:number;connectedPhone:string|null;lastSeenAt:number|null;connectionState:string;automation:{enabled:boolean;approval:boolean;profileReady:boolean;products:number}};
export type AdminUser={id:string;name:string;email:string;role:string;status:string;tenantId:string;businessName:string;businessStatus:string;createdAt:number;lastLoginAt:number|null;lastSeenAt:number|null;sessions:number};
export type AdminSession={id:string;userId:string;name:string;email:string;tenantId:string;businessName:string;role:string;createdAt:number;expiresAt:number;lastSeenAt:number|null;revokedAt:number|null;ip:string|null;userAgent:string|null;status:string};
export type AdminSnapshot={
  at:number;ownerName:string;ninaName:string;tenants:AdminTenant[];users:AdminUser[];sessions:AdminSession[];
  ownerSessions:{id:string;name:string;createdAt:number|null;lastSeenAt:number|null;expiresAt:number|null;status:string;current:boolean}[];
  activity:{id:string;kind:string;message:string;created:number;tenantId:string;businessName:string|null}[];
  daily:{day:string;calls:number;tokens:number;sent:number;received:number}[];logins:{day:string;count:number}[];
  providers:{id:string;label:string;provider:string;model:string;verified:boolean;cooldownUntil:number|null}[];
  queue:Record<string,number>;totals:{users:number;sessions:number;activities:number;activeSessions:number;recentlyActiveUsers:number;loginsToday:number;registrationsToday:number};
  health:{database:string;uptimeSeconds:number;providerFailures:{providerId:string;at:number}[]};
  pagination:{pageSize:number;usersPage:number;sessionsPage:number;activityPage:number};dailyTracking:string;
};
