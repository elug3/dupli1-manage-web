# Schick Internal VPN (WireGuard)

WireGuard VPN for accessing the Schick production VPC (`10.0.0.0/16`) from outside AWS.

## Server

| Property | Value |
|---|---|
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
