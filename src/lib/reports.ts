import { supabase } from './supabase';

export type ReportReason = 'harassment' | 'hate' | 'threat' | 'sexual' | 'spam' | 'illegal' | 'other';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hateful content' },
  { id: 'threat', label: 'Threats or violence' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'spam', label: 'Spam or scams' },
  { id: 'illegal', label: 'Illegal content' },
  { id: 'other', label: 'Something else' },
];

export interface ReportInput {
  reporterId: string;
  targetType: 'message' | 'direct_message' | 'profile';
  targetId: string;
  targetUserId: string | null;
  serverId: string | null;
  reason: ReportReason;
  details: string;
  snapshot: string | null;
}

/** Files a report. The table allows one report per person per item, so repeats are refused. */
export async function submitReport(input: ReportInput): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    target_user_id: input.targetUserId,
    server_id: input.serverId,
    reason: input.reason,
    details: input.details.trim() || null,
    content_snapshot: input.snapshot ? input.snapshot.slice(0, 2000) : null,
  });
  if (error) {
    if (error.code === '23505') throw new Error('You have already reported this.');
    throw new Error('Could not send the report. Try again.');
  }
}
