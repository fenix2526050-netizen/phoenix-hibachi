import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "phoenix4719190@gmail.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Phoenix Hibachi <orders@phoenixhibachi.com>";
const SITE_PHONE = Deno.env.get("SITE_PHONE") || "347-471-9190";
const BUCKET = Deno.env.get("ORDER_PDF_BUCKET") || "order-pdfs";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Booking = Record<string, any>;

function value(v: any, fallback = "-") {
  return v === null || v === undefined || v === "" ? fallback : String(v);
}

function money(v: any) {
  const n = Number(v || 0);
  return `$${n.toFixed(2)}`;
}

function bookingHtml(b: Booking, pdfUrl?: string) {
  const number = value(b.booking_number || b.id);
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f160f">
    <h2 style="margin:0 0 8px;color:#8a4f10">Phoenix Hibachi Booking Confirmation</h2>
    <p>Thank you for your booking request. Phoenix Hibachi will review the details and confirm the final arrival window.</p>
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd;width:100%;max-width:720px">
      <tr><td><b>Order #</b></td><td>${number}</td></tr>
      <tr><td><b>Name</b></td><td>${value(b.customer_name)}</td></tr>
      <tr><td><b>Phone</b></td><td>${value(b.customer_phone)}</td></tr>
      <tr><td><b>Email</b></td><td>${value(b.customer_email)}</td></tr>
      <tr><td><b>Date</b></td><td>${value(b.event_date)}</td></tr>
      <tr><td><b>Time</b></td><td>${value(b.event_time)}</td></tr>
      <tr><td><b>Address</b></td><td>${value(b.address)}</td></tr>
      <tr><td><b>Guests</b></td><td>${value(b.adults, '0')} adults · ${value(b.kids, '0')} kids</td></tr>
      <tr><td><b>Package</b></td><td>${value(b.package_name)}</td></tr>
      <tr><td><b>Travel Fee</b></td><td>${money(b.travel_fee)}</td></tr>
      <tr><td><b>Deposit</b></td><td>${money(b.deposit_amount)}</td></tr>
      <tr><td><b>Status</b></td><td>${value(b.status)}</td></tr>
    </table>
    ${pdfUrl ? `<p><a href="${pdfUrl}">Download PDF invoice</a></p>` : ""}
    <p>Questions? Call or text ${SITE_PHONE}.</p>
  </div>`;
}

async function makePdf(b: Booking): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  const draw = (text: string, size = 11, isBold = false) => {
    page.drawText(text.slice(0, 95), { x: 54, y, size, font: isBold ? bold : font, color: rgb(0.12, 0.09, 0.06) });
    y -= size + 9;
  };
  draw("PHOENIX HIBACHI", 20, true);
  draw(`Order PDF / Booking Confirmation`, 13, true);
  y -= 8;
  const rows = [
    ["Order #", value(b.booking_number || b.id)],
    ["Customer", value(b.customer_name)],
    ["Phone", value(b.customer_phone)],
    ["Email", value(b.customer_email)],
    ["Date", value(b.event_date)],
    ["Time", value(b.event_time)],
    ["Address", value(b.address)],
    ["Guests", `${value(b.adults, "0")} adults · ${value(b.kids, "0")} kids`],
    ["Package", value(b.package_name)],
    ["Add-ons", Array.isArray(b.add_ons) ? b.add_ons.map((x: any) => x.name || x).join(", ") : value(b.add_ons)],
    ["Allergies", Array.isArray(b.allergies) ? b.allergies.join(", ") : value(b.allergies)],
    ["Travel Fee", money(b.travel_fee)],
    ["Deposit", money(b.deposit_amount)],
    ["Payment Status", value(b.payment_status)],
    ["Status", value(b.status)],
    ["Notes", value(b.admin_notes)],
  ];
  for (const [label, text] of rows) {
    if (y < 80) { y = 740; pdf.addPage([612,792]); }
    draw(`${label}: ${text}`, 11, label === "Order #");
  }
  y -= 12;
  draw(`Contact: ${SITE_PHONE}`, 10, true);
  draw("This PDF was generated automatically by Phoenix Hibachi booking system.", 9);
  return await pdf.save();
}

async function sendEmail(to: string, subject: string, html: string, pdfBytes?: Uint8Array, filename?: string) {
  if (!RESEND_API_KEY) return { skipped: true, reason: "RESEND_API_KEY not set" };
  const attachments = pdfBytes && filename ? [{ filename, content: btoa(String.fromCharCode(...pdfBytes)) }] : undefined;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, attachments }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const bookingNumber = body.booking_number || body.booking?.booking_number;
    if (!bookingNumber) throw new Error("booking_number is required");

    const { data: booking, error } = await supabase.from("bookings").select("*").eq("booking_number", bookingNumber).single();
    if (error || !booking) throw new Error(error?.message || "Booking not found");

    const pdfBytes = await makePdf(booking);
    const safeNumber = String(bookingNumber).replace(/[^a-z0-9_-]/gi, "-");
    const filePath = `${safeNumber}/Phoenix-Hibachi-Order-${safeNumber}.pdf`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`);

    const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60 * 24 * 30);
    if (signError) throw new Error(`Signed URL failed: ${signError.message}`);
    const pdfUrl = signed.signedUrl;

    await supabase.from("bookings").update({ pdf_url: pdfUrl, pdf_path: filePath }).eq("booking_number", bookingNumber);

    const adminSubject = `New Phoenix Hibachi Booking ${bookingNumber}`;
    const customerSubject = `Phoenix Hibachi Booking Received: ${bookingNumber}`;
    const html = bookingHtml(booking, pdfUrl);

    await sendEmail(ADMIN_EMAIL, adminSubject, html, pdfBytes, `Phoenix-Hibachi-Order-${safeNumber}.pdf`);
    if (booking.customer_email) await sendEmail(booking.customer_email, customerSubject, html, pdfBytes, `Phoenix-Hibachi-Order-${safeNumber}.pdf`);

    return new Response(JSON.stringify({ ok: true, pdf_url: pdfUrl, pdf_path: filePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
