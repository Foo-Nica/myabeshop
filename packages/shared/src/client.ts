/**
 * Browser-safe subset: no zod, no libphonenumber metadata. Storefront pages import this
 * to keep the product page under the 500 KB / 3G budget (cahier des charges §10).
 */
export * from './domain';
export * from './utils';
export type * from './api-types';
export type * from './schemas';
