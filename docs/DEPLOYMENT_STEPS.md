# Phoenix Hibachi Deployment Steps

## 1. Backup first

Before replacing anything:

1. Download your current Replit project as a ZIP.
2. Export Supabase table data if you already have real bookings.
3. Keep the current working version as `V1-safe-backup`.

## 2. Upload this package to Replit

Replace files carefully. Do not delete your `.env` or Replit secrets.

## 3. Supabase SQL

Open Supabase → SQL Editor → run:

`supabase/migrations/001_phoenix_business.sql`

Verify:

- `bookings.pdf_url` exists
- `bookings.pdf_path` exists
- bucket `order-pdfs` exists
- RLS policies do not block admin dashboard

## 4. Edge Function secrets

In Supabase CLI or dashboard, set these secrets:

```bash
supabase secrets set RESEND_API_KEY="re_xxx"
supabase secrets set ADMIN_EMAIL="phoenix4719190@gmail.com"
supabase secrets set FROM_EMAIL="Phoenix Hibachi <orders@yourdomain.com>"
supabase secrets set SITE_PHONE="347-471-9190"
supabase secrets set ORDER_PDF_BUCKET="order-pdfs"
```

Supabase automatically provides:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 5. Deploy function

```bash
supabase functions deploy booking-created
```

## 6. Test function directly

After creating a test booking, call:

```bash
supabase functions invoke booking-created --body '{"booking_number":"PHX-TEST"}'
```

## 7. Website test

1. Open the site.
2. Submit a fake booking with your email.
3. Confirm booking appears in Supabase `bookings`.
4. Confirm owner receives email.
5. Confirm customer receives email.
6. Confirm `pdf_url` is written to booking row.
7. Log into dashboard.
8. Click `Download PDF`.

## 8. If email does not send

Check:

- Resend API key
- Resend verified domain
- `FROM_EMAIL` domain verification
- Supabase Function logs

## 9. If PDF does not generate

Check:

- Function logs
- Storage bucket exists
- `SERVICE_ROLE_KEY` exists
- `order-pdfs` bucket name matches
