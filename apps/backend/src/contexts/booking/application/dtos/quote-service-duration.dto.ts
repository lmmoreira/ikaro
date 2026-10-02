import { z } from 'zod';
import { QuoteServiceDurationQuerySchema } from '@ikaro/validation';

// Shared with the BFF's identical query schema via @ikaro/validation (no per-app deviation).
export const QuoteServiceDurationSchema = QuoteServiceDurationQuerySchema;

export type QuoteServiceDurationDto = z.infer<typeof QuoteServiceDurationSchema>;
