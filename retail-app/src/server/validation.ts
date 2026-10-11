import { z } from 'zod';
import { MAX_LINE_QUANTITY, ONE_SIZE, PRODUCT_SORTS, SIZES } from '@/lib/constants';

const trimmed = (max: number) => z.string().trim().min(1, 'is required').max(max, `must be at most ${max} characters`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `must be at most ${max} characters`)
    .nullish()
    .transform((value) => value || null);

export const email = z.string().trim().toLowerCase().pipe(z.email('must be a valid email address'));
// The most common passwords from breach corpora; rejecting them blocks trivial credential stuffing.
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123', 'passw0rd', 'qwerty123',
  'qwertyuiop', '11111111', '00000000', '87654321', 'iloveyou', 'abc12345', 'abcd1234', 'welcome1',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'trustno1', 'letmein1', 'admin123',
  'administrator', 'changeme', 'whatever', 'starwars', 'dragon123', 'monkey123', '1q2w3e4r', 'zaq12wsx',
  'asdfghjkl', 'q1w2e3r4', 'qwerty12', 'lucid123', 'lucidlucid',
]);

export const password = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(200)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), 'is too common. Please choose another.')
  .refine((value) => new Set(value).size >= 4, 'is too simple. Please choose another.');
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'is not a valid slug');
const id = z.coerce.number().int().positive();

export const registerSchema = z
  .object({
    name: trimmed(120),
    email,
    phone: optionalText(40),
    password,
  })
  .refine(({ email, password }) => !password.toLowerCase().includes(email.split('@')[0]), {
    message: 'password: must not contain your email address',
    path: ['password'],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'is required').max(200),
});

export const profileSchema = z.object({
  name: trimmed(120),
  phone: optionalText(40),
});

export const productQuerySchema = z.object({
  category: slug.optional(),
  sub: slug.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum([...(Object.keys(PRODUCT_SORTS) as [keyof typeof PRODUCT_SORTS]), 'relevance']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

export const newProductSchema = z.object({
  name: trimmed(200),
  description: optionalText(2000),
  price: z.coerce.number().positive().max(99_999_999).multipleOf(0.01, 'must have at most 2 decimals'),
  category: slug,
  subcategory: slug,
  storeId: id,
  quantity: z.coerce.number().int().min(0).max(100_000),
});

export const productPatchSchema = z
  .object({
    name: trimmed(200),
    description: optionalText(2000),
    price: z.number().positive().max(99_999_999).multipleOf(0.01),
    category: slug,
    subcategory: slug,
    isActive: z.boolean(),
  })
  .partial();

export const storeSchema = z.object({
  name: trimmed(120),
  location: trimmed(120),
  contact: optionalText(40),
});

export const addToCartSchema = z.object({
  productId: id,
  storeId: id,
  size: z.enum([...SIZES, ONE_SIZE]),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
});

export const cartQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});

export const checkoutKeySchema = z.uuid('Idempotency-Key header must be a UUID');

export const orderStatusSchema = z.object({
  status: z.enum(['confirmed', 'shipped', 'delivered', 'cancelled']),
});

export const stockSchema = z.object({
  storeId: id,
  productId: id,
  quantity: z.number().int().min(0).max(100_000),
});

export const sqlSchema = z.object({
  query: z.string().max(20_000),
});
