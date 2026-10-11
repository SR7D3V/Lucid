// Shapes returned by the API and shared by server and client components.

export type Role = 'customer' | 'admin';

export type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
};

export type Category = {
  slug: string;
  name: string;
  hasSizes: boolean;
  subcategories: Array<{ slug: string; name: string }>;
};

export type ProductSummary = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  categorySlug: string;
  categoryName: string;
  subcategorySlug: string;
  subcategoryName: string;
  hasSizes: boolean;
  totalStock: number;
  defaultStoreId: number | null;
};

export type StoreAvailability = {
  storeId: number;
  name: string;
  location: string;
  quantity: number;
};

export type ProductDetail = ProductSummary & {
  isActive: boolean;
  stores: StoreAvailability[];
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type Store = {
  id: number;
  name: string;
  location: string;
  contact: string | null;
  productCount: number;
  unitsInStock: number;
};

export type CartLine = {
  id: number;
  productId: number;
  name: string;
  price: number;
  imageUrl: string | null;
  size: string;
  quantity: number;
  storeId: number;
  storeName: string;
  available: number;
  isActive: boolean;
};

export type Cart = {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
};

export type OrderStatus = 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export type OrderLine = {
  productId: number;
  name: string;
  imageUrl: string | null;
  size: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: number;
  status: OrderStatus;
  totalAmount: number;
  placedAt: string;
  storeName: string;
  items: OrderLine[];
};

export type AdminOrder = Omit<Order, 'items'> & {
  customerName: string;
  customerEmail: string;
  itemCount: number;
};

export type WishlistItem = ProductSummary & { addedAt: string };

export type Overview = {
  revenue: number;
  orders: number;
  openOrders: number;
  customers: number;
  products: number;
  lowStock: number;
};

export type ProductOption = { id: number; name: string; isActive: boolean };

export type SchemaTable = { table: string; columns: string[] };

export type SqlResult = {
  command: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};
