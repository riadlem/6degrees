import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: "Reset your 6Degrees password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
        <h1 style="font-size:28px;font-weight:900;color:#2563EB;margin:0 0 8px">6°</h1>
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 16px">Reset your password</h2>
        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px">
          You requested a password reset for your 6Degrees account.
          Click the button below to set a new password.
        </p>
        <a href="${resetUrl}"
          style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px">
          Reset password
        </a>
        <p style="color:#6B7280;font-size:12px;margin:24px 0 0">
          This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}
