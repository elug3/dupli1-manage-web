# Schick Internal VPN (WireGuard)

WireGuard VPN for accessing the Schick production VPC (`10.0.0.0/16`) from outside AWS.

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
| EC2 instance | `internal-vpn` (`i-0f7a516c42a8b7afd`) |
| Public endpoint | `13.218.131.226:51820` (UDP) |
| VPN subnet | `10.8.0.0/24` |
| VPC | `web-prod-vpc` (`10.0.0.0/16`) |

Private subnets route `10.8.0.0/24` to the VPN instance so clients can reach internal services (ECS, RDS, etc.).

## Client setup

1. Install [WireGuard](https://www.wireguard.com/install/) on your machine.
2. Copy `schick-internal.conf` into your WireGuard config directory:
   - **macOS (app):** Import tunnel via WireGuard app
   - **Linux:** `/etc/wireguard/schick-internal.conf`
   - **Windows:** Import via WireGuard app
3. Activate the tunnel.

```bash
# Linux example
sudo cp schick-internal.conf /etc/wireguard/
sudo wg-quick up schick-internal
```

## Verify connectivity

```bash
# VPN gateway
ping 10.8.0.1

# Example internal host (dupli-server)
ping 10.0.29.174
```

## Adding another client

On the VPN server (`internal-vpn`):

```bash
CLIENT_PRIV=$(wg genkey)
CLIENT_PUB=$(echo "$CLIENT_PRIV" | wg pubkey)
echo "PrivateKey = $CLIENT_PRIV"
echo "PublicKey  = $CLIENT_PUB"

# Pick an unused address in 10.8.0.0/24 (e.g. 10.8.0.4)
sudo wg set wg0 peer "$CLIENT_PUB" allowed-ips 10.8.0.4/32
```

Add a matching `[Peer]` block to `/etc/wireguard/wg0.conf` on the server.

## Security

- `schick-internal.conf` contains a private key and is gitignored.
- Do not commit client configs with real keys to the repository.
- Rotate keys if a config file is exposed.
