import { vendorsApi } from '@/api/vendors.api';
import { createResourceHooks } from './useResource';

export const vendorHooks = createResourceHooks('vendors', vendorsApi);
