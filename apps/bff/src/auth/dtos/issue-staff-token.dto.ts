import { z } from 'zod';

export const IssueStaffTokenSchema = z.object({
  selectionToken: z.string().min(1),
  staffId: z.uuid(),
});

export type IssueStaffTokenDto = z.infer<typeof IssueStaffTokenSchema>;
