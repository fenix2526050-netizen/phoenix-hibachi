import { STORAGE_BUCKETS } from '../config/appConfig.js';
import { requireSupabaseClient } from './supabaseClient.js';

export async function uploadOrderPdf(filePath, pdfBlob, client = requireSupabaseClient()) {
  const { data, error } = await client.storage
    .from(STORAGE_BUCKETS.orderPdfs)
    .upload(filePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (error) throw error;
  return data;
}

export async function createSignedUrl(bucket, path, expiresInSeconds = 60 * 60 * 24, client = requireSupabaseClient()) {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl || '';
}

export async function createOrderPdfSignedUrl(path, expiresInSeconds, client) {
  return createSignedUrl(STORAGE_BUCKETS.orderPdfs, path, expiresInSeconds, client);
}
