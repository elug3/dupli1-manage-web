# Schick Internal VPN

WireGuard VPN for accessing private Schick production resources (`10.0.0.0/16`).

## Server

| Property | Value |
|---|---|
| EC2 instance | `schick-internal-vpn` |
| Endpoint | `13.218.131.226:51820` (UDP) |
| VPN subnet | `10.8.0.0/24` |
| VPC DNS resolver | `10.0.0.2` |

## Admin dashboard (manage-web)

The admin UI is **VPN-only** — it is not on the public ALB.

1. Connect your WireGuard tunnel.
2. Open **http://manage.schick.internal**
3. Sign in with your admin credentials.

Backend API traffic uses the internal gateway at `http://proxy.schick.local`.

## Android / Chrome troubleshooting

**Yes — the VPN tunnel solves internal DNS**, but your WireGuard config must route DNS through the VPC:

```ini
[Interface]
DNS = 10.0.0.2

[Peer]
AllowedIPs = 10.0.0.0/16, 10.8.0.0/24
```

Also check:

| Issue | Fix |
|---|---|
| `manage.schick.local` not found on Android | Use **`manage.schick.internal`** instead. Android/Chrome treats `.local` as mDNS (Bonjour), not normal DNS. |
| DNS still fails | Android **Settings → Network → Private DNS → Off** (Cloudflare/Google Private DNS bypasses VPN DNS). |
| Tunnel not active | Confirm WireGuard app shows **Active** before opening Chrome. |
| Quick test | In WireGuard app logs, or with a network app: resolve `manage.schick.internal` via `10.0.0.2`. |

## Other internal services

| Service | URL (over VPN) |
|---|---|
| Admin UI | `http://manage.schick.internal` |
| API gateway | `http://proxy.schick.local` |
| Auth API | `http://proxy.schick.local/api/v1/auth/login` |

## Client config

Import your WireGuard client config (`.conf`) into the WireGuard app. Client configs with private keys are gitignored (`vpn/*.conf`).

Required settings:

```ini
[Interface]
DNS = 10.0.0.2
Address = 10.8.0.x/32

[Peer]
Endpoint = 13.218.131.226:51820
AllowedIPs = 10.0.0.0/16, 10.8.0.0/24
PersistentKeepalive = 25
```
