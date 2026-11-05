# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily a portfolio piece: recruiters and engineers open the live app to judge the author's backend and product work. It must feel like a real, finished tool they can sign up for and use in a couple of minutes.

## Product Purpose

Shrinkly shortens long URLs into short links and shows who clicked them. Success: a reviewer signs up, creates a link, clicks it, and sees the click land in analytics, without confusion.

## Positioning

Redirects are served from a Redis cache and return immediately; click enrichment (geolocation, device, referrer, dedup) happens afterwards in a Celery worker, so analytics never slow the redirect.

## Operating Context

Single-page app served by FastAPI at `/`. Flow: register with email and password, verify a 6-digit email code, receive an API key shown once, then use the dashboard. Login later may ask for the API key again (stored only in sessionStorage); a lost key can be regenerated.

## Capabilities and Constraints

- Create short links with optional custom alias (`[a-zA-Z0-9_-]+`) and optional expiry (1-365 days).
- List own links; select one to see total clicks, unique visitors, clicks per day (last 30 days, Chart.js), top referrers, top countries.
- API key auth (`Authorization: Bearer`) for creating links programmatically.
- Stack: vanilla HTML/CSS/JS in `app/static/` (no build step), FastAPI backend. Keep it build-free.
- Deployed at https://shortener-ramya.duckdns.org (GCP VM, Docker Compose, Caddy HTTPS).

## Brand Commitments

Name: Shrinkly. No other binding brand or visual constraints; the previous maroon glassmorphism look is not to be kept.

## Evidence on Hand

No real usage numbers, testimonials, or benchmarks. Do not invent any (including "sub-5 ms redirects", which was never measured).

## Product Principles

- A reviewer gets from landing to a working, clicked link in under two minutes.
- Show the system working: real data, real states, nothing faked.
- Every state (empty, loading, error, expired) is designed, not left default.
