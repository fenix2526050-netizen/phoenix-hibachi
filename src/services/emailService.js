/**
 * Email must stay server-side. This module only calls the Supabase Edge Function.
 * Never put Resend/SendGrid/SMTP secret keys in browser code.
 */
import { requireSupabaseClient } from './supabaseClient.js';

export async function notifyBookingCreated(payload, client = requireSupabaseClient()) {
  const { data, error } = await client.functions.invoke('booking-created', { body: payload });
  if (error) throw error;
  return data;
}
