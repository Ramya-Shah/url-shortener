import smtplib
import structlog
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import HTTPException
from app.core.config import settings

logger = structlog.get_logger(__name__)


class EmailService:
    @staticmethod
    async def send_otp(to_email: str, otp: str):
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            # Dev fallback: just log the OTP — no email needed to test locally
            logger.warning(
                "SMTP not configured — OTP logged for dev use only",
                otp=otp,
                email=to_email,
            )
            return

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = "Your Login OTP - URL Shortener"
            msg["From"] = f"URL Shortener <{settings.SMTP_USER}>"
            msg["To"] = to_email

            html = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #541A1A;">Your One-Time Password</h2>
                <p>Use the following 6-digit code to complete your login/registration:</p>
                <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #810B38;">{otp}</span>
                </div>
                <p style="color: #71717a; font-size: 14px;">This code will expire in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
            </div>
            """
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.ehlo()
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_USER, to_email, msg.as_string())

            logger.info("otp_email_sent", email=to_email)

        except smtplib.SMTPAuthenticationError:
            logger.error("smtp_auth_failed", email=to_email)
            raise HTTPException(
                status_code=502,
                detail="Email authentication failed. Check your SMTP_USER and SMTP_PASSWORD in .env.",
            )
        except Exception as e:
            logger.error("failed_to_send_otp_email", error=str(e), email=to_email)
            raise HTTPException(
                status_code=502,
                detail=f"Failed to send OTP email: {str(e)}",
            )
