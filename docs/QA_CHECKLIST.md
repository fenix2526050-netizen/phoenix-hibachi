# Phoenix Hibachi QA Checklist

## Booking flow

- [ ] Customer can open booking modal
- [ ] Required fields validate correctly
- [ ] Minimum guest rule works
- [ ] Protein selection rule works
- [ ] Add-on decision rule works
- [ ] Booking fails clearly if Supabase is unavailable
- [ ] Booking success only appears after Supabase insert succeeds
- [ ] New row appears in `bookings`
- [ ] Booking number is unique

## Dashboard

- [ ] Admin login works
- [ ] Manager login works
- [ ] Dashboard orders load from Supabase
- [ ] Accept order updates Supabase status
- [ ] Complete order updates Supabase status
- [ ] Delete order soft/hard behavior is understood
- [ ] Guest invoice opens
- [ ] Chef settlement opens
- [ ] Download PDF opens generated PDF if `pdf_url` exists

## Email and PDF

- [ ] Owner receives new order email
- [ ] Customer receives confirmation email
- [ ] Email contains date/time/address/guest/package details
- [ ] PDF is attached or linked
- [ ] PDF exists in Storage bucket `order-pdfs`
- [ ] `bookings.pdf_url` is filled

## RLS/security

- [ ] Anonymous users can insert bookings
- [ ] Anonymous users cannot select all bookings
- [ ] Admin can select/update bookings
- [ ] Manager can select/update bookings
- [ ] Chef cannot see unrelated orders
- [ ] Member cannot see other customers' orders
- [ ] Service role Edge Function can generate/upload PDFs

## Mobile

- [ ] iPhone homepage loads cleanly
- [ ] Android homepage loads cleanly
- [ ] Floating buttons do not cover booking submit
- [ ] Dashboard is usable on phone
- [ ] Theme switcher works in light/dark mode

## Launch

- [ ] Domain connected
- [ ] HTTPS active
- [ ] Google Business link points to domain
- [ ] Contact phone is 347-471-9190
- [ ] Contact email is phoenix4719190@gmail.com
- [ ] Test booking deleted after QA
