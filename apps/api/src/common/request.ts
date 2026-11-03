import type { Request } from 'express';
import type { StoreRole } from '@myabeshop/shared';

export interface AuthUser {
  id: string;
  name: string;
  isSuperAdmin: boolean;
  impersonatedBy?: string;
}

export interface StoreContext {
  storeId: string;
  role: StoreRole;
  currency: string;
  country: string;
  name: string;
  slug: string;
  locale: string;
  courierId: string | null;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  store?: StoreContext;
}
