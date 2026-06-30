import { TABLES } from '../config/appConfig.js';
import { requireSupabaseClient } from './supabaseClient.js';

export async function createBooking(row, client = requireSupabaseClient()) {
  const { data, error } = await client
    .from(TABLES.bookings)
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listBookings(client = requireSupabaseClient()) {
  const { data, error } = await client
    .from(TABLES.bookings)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateBooking(bookingNumber, patch, client = requireSupabaseClient()) {
  if (!bookingNumber) throw new Error('Missing booking number.');
  const { data, error } = await client
    .from(TABLES.bookings)
    .update(patch)
    .eq('booking_number', bookingNumber)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateBookingStatus(bookingNumber, status, client = requireSupabaseClient()) {
  return updateBooking(bookingNumber, { status }, client);
}

export async function attachBookingPdf(bookingNumber, pdfUrl, client = requireSupabaseClient()) {
  return updateBooking(bookingNumber, { pdf_url: pdfUrl }, client);
}
