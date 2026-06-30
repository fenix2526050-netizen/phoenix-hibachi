# Phoenix Hibachi Button Backend Map V88

| Area | Button / Action | Current backend status | Risk | Next action |
|---|---|---:|---|---|
| Booking | Submit booking | Supabase insert exists | Medium | Migrate submit controller into module and remove local-success fallback |
| Dashboard | Load orders | Supabase select exists | Medium | Move rendering to dashboard module |
| Dashboard | Update status | Supabase update exists in some paths | Medium | Verify every status button writes Supabase |
| Dashboard | Delete order | Supabase delete/update plus local hide patches | High | Replace with single archive/delete service |
| Dashboard | Download PDF | Supported via `pdf_url` | Medium | Generate missing PDFs from Edge Function |
| Invoice | Guest invoice | Manual print HTML | Low | Move HTML to `pdfService` then server PDF |
| Invoice | Chef settlement | Manual print HTML | Low | Move HTML to `pdfService` |
| Contact Settings | Save contact info | Mostly localStorage | High | Create `contact_settings` table and policies |
| Date pause | Pause/resume booking date | localStorage | High | Move to Supabase `booking_blackouts` table |
| People / Staff | Add/hide person | localStorage | High | Move to Supabase profiles/staff table |
| Chef application | Submit application | Supabase + Storage exists | Medium | Verify RLS and file bucket permissions |
| Reviews / feedback | Submit feedback | localStorage in some flows | Medium | Move to Supabase feedback table |
| Theme | Day/night mode | localStorage UI preference | Low | Keep localStorage |
| Floating buttons | Contact/theme/admin shortcuts | UI only | Low | Keep as UI |

