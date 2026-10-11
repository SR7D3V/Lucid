import type { OrderStatus } from './types';

export const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;
export const ONE_SIZE = 'One Size';
export const MAX_LINE_QUANTITY = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const PRODUCT_SORTS = {
  newest: 'Newest',
  'price-asc': 'Price low to high',
  'price-desc': 'Price high to low',
} as const;
export type ProductSort = keyof typeof PRODUCT_SORTS | 'relevance';

/** Allowed order status transitions; cancelling restocks inventory. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
