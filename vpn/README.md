# Schick Internal VPN

WireGuard VPN for accessing private Schick production resources (`10.0.0.0/16`).

## Server

| Property | Value |
|---|---|
| EC2 instance | `schick-internal-vpn` |
| Endpoint | `13.218.131.226:51820` (UDP) |
| VPN subnet | `10.8.0.0/24` |

## Admin dashboard (manage-web)

The admin UI is **VPN-only** — it is not on the public ALB.

1. Connect your WireGuard tunnel.
2. Open **http://manage.schick.local:3000**
3. Sign in with your admin credentials.

Backend API traffic uses the internal gateway at `http://proxy.schick.local`.

## Other internal services

| Service | URL (over VPN) |
|---|---|
| API gateway | `http://proxy.schick.local` |
| Auth API | `http://proxy.schick.local/api/v1/auth/login` |

## Client config

Import your WireGuard client config (`.conf`) into the WireGuard app. Client configs with private keys are gitignored (`vpn/*.conf`).
