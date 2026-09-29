"""Shared TLS-only SMTP transport. Success means acceptance, not inbox delivery."""
import smtplib
import ssl
from ..config import settings

def send_message(message):
    starttls=settings.smtp_security=='starttls' or (settings.smtp_security=='auto' and settings.smtp_port==587)
    transport=smtplib.SMTP if starttls else smtplib.SMTP_SSL
    options={} if starttls else {'context':ssl.create_default_context()}
    with transport(settings.smtp_host,settings.smtp_port,timeout=15,**options) as server:
        if starttls:
            server.ehlo();server.starttls(context=ssl.create_default_context());server.ehlo()
        server.login(settings.smtp_username,settings.smtp_password)
        refused=server.send_message(message)
        if refused: raise smtplib.SMTPRecipientsRefused(refused)
