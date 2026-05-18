"""
Async email service using aiosmtplib with inline HTML templates.
"""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


def _base_template(title: str, body_html: str) -> str:
    """Wrap body HTML in a responsive email template."""
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{title}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f4f4f5; margin: 0; padding: 0; }}
    .wrapper {{ max-width: 600px; margin: 40px auto; background: #fff;
                border-radius: 8px; overflow: hidden;
                box-shadow: 0 1px 3px rgba(0,0,0,.1); }}
    .header {{ background: #1e40af; padding: 32px 40px; }}
    .header h1 {{ color: #fff; margin: 0; font-size: 24px; }}
    .body {{ padding: 32px 40px; color: #374151; line-height: 1.6; }}
    .button {{ display: inline-block; margin: 24px 0; padding: 12px 28px;
               background: #1e40af; color: #fff !important; text-decoration: none;
               border-radius: 6px; font-weight: 600; font-size: 15px; }}
    .footer {{ background: #f9fafb; padding: 20px 40px; text-align: center;
               color: #9ca3af; font-size: 12px; }}
    p {{ margin: 0 0 16px; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header"><h1>Private AI Assistant</h1></div>
    <div class="body">{body_html}</div>
    <div class="footer">
      &copy; 2025 Private AI Assistant. All rights reserved.<br/>
      If you did not request this email, you can safely ignore it.
    </div>
  </div>
</body>
</html>
"""


class EmailService:
    """Async SMTP email sender with HTML templates."""

    async def _send(self, to_email: str, subject: str, html_body: str) -> None:
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            logger.warning(
                "SMTP credentials not configured — skipping email to %s", to_email
            )
            return

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>"
        msg["To"] = to_email

        msg.attach(MIMEText(html_body, "html"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=True,
            )
            logger.info("Email '%s' sent to %s", subject, to_email)
        except Exception as exc:
            logger.error("Failed to send email to %s: %s", to_email, exc)
            raise

    # ─── Templates ────────────────────────────────────────────────────────────

    async def send_verification_email(
        self, email: str, token: str, name: str
    ) -> None:
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        body = _base_template(
            "Verify Your Email",
            f"""
            <p>Hi {name},</p>
            <p>Thank you for signing up for <strong>Private AI Assistant</strong>.
               Please verify your email address to activate your account.</p>
            <a class="button" href="{verify_url}">Verify Email Address</a>
            <p>This link expires in <strong>24 hours</strong>.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
            """,
        )
        await self._send(email, "Verify your email — Private AI Assistant", body)

    async def send_password_reset_email(
        self, email: str, token: str, name: str
    ) -> None:
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        body = _base_template(
            "Reset Your Password",
            f"""
            <p>Hi {name},</p>
            <p>We received a request to reset the password for your account.</p>
            <a class="button" href="{reset_url}">Reset Password</a>
            <p>This link expires in <strong>1 hour</strong>.</p>
            <p>If you didn't request a password reset, please ignore this email
               and your password will remain unchanged.</p>
            """,
        )
        await self._send(email, "Reset your password — Private AI Assistant", body)

    async def send_invitation_email(
        self,
        email: str,
        workspace_name: str,
        inviter_name: str,
        token: str,
    ) -> None:
        join_url = f"{settings.FRONTEND_URL}/join/{token}"
        body = _base_template(
            f"You're invited to {workspace_name}",
            f"""
            <p>Hi there,</p>
            <p><strong>{inviter_name}</strong> has invited you to join the
               <strong>{workspace_name}</strong> workspace on Private AI Assistant.</p>
            <a class="button" href="{join_url}">Accept Invitation</a>
            <p>This invitation expires in <strong>7 days</strong>.</p>
            <p>You'll need to create an account (or log in) to accept.</p>
            """,
        )
        await self._send(
            email,
            f"You're invited to {workspace_name} — Private AI Assistant",
            body,
        )

    async def send_welcome_email(self, email: str, name: str) -> None:
        dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
        body = _base_template(
            "Welcome to Private AI Assistant",
            f"""
            <p>Hi {name},</p>
            <p>Your account is now active. Welcome to <strong>Private AI Assistant</strong> —
               your private, secure AI knowledge base.</p>
            <p>Here's what you can do:</p>
            <ul>
              <li>Upload PDFs, Word documents, text files, and CSVs</li>
              <li>Ask questions and get AI-powered answers with citations</li>
              <li>Invite team members to collaborate in workspaces</li>
            </ul>
            <a class="button" href="{dashboard_url}">Go to Dashboard</a>
            <p>If you have any questions, reply to this email — we're here to help.</p>
            """,
        )
        await self._send(email, "Welcome to Private AI Assistant!", body)


# Singleton
email_service = EmailService()
