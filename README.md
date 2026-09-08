# Node-RED Industrial

A prebuilt Node-RED runtime for industrial integrations, with LDAP authentication and optional HTTPS support.

## Included

The image is based on Node-RED 5.0.7 and includes:

- `node-red-contrib-influxdb`
- `node-red-contrib-opcua`
- `node-red-contrib-modbus`
- `node-red-contrib-s7`
- `node-red-node-ping`
- `@flowfuse/node-red-dashboard`
- `ldap-authentication`
- `bcryptjs`

## Requirements

- Docker with Compose support
- Access to the LDAP/Active Directory server when LDAP authentication is enabled
- The LDAP CA certificate when certificate verification is enabled

## Configuration

Create the runtime environment file from the example:

```sh
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set the values for your environment. Never commit `.env`; it can contain LDAP bind credentials and password hashes.

### Authentication variables

| Variable                           | Description                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `NODE_RED_USE_LDAP`                | Enables LDAP authentication when `true`, `1`, or `yes`.                         |
| `NODE_RED_LDAP_SERVER`             | LDAP or LDAPS URL, for example `ldaps://ldap.example.com:636`.                  |
| `NODE_RED_LDAP_BIND_DN`            | Service account used to search for users.                                       |
| `NODE_RED_LDAP_BIND_PASSWORD`      | Password for the LDAP service account.                                          |
| `NODE_RED_LDAP_USER_SEARCH_BASE`   | Directory base used when searching for users.                                   |
| `NODE_RED_LDAP_USERNAME_ATTRIBUTE` | Login attribute; defaults to `sAMAccountName`.                                  |
| `NODE_RED_LDAP_USER_FILTER`        | Optional LDAP filter. Use `{{username}}` for the submitted username.            |
| `NODE_RED_LDAP_CA_CERT_FILE`       | Container path to the trusted LDAP CA certificate.                              |
| `NODE_RED_LDAP_BYPASS_TLS_VERIFY`  | Disables LDAP certificate verification. Use only for temporary troubleshooting. |
| `NODE_RED_ADMIN_USERNAME`          | Local fallback administrator username.                                          |
| `NODE_RED_ADMIN_PASSWORD_HASH`     | Bcrypt hash for the local fallback administrator password.                      |

LDAP users and the local administrator receive Node-RED admin permissions (`*`). LDAP authentication is attempted first; the local administrator is used as a fallback.

### HTTPS variables

| Variable                                | Description                                      |
| --------------------------------------- | ------------------------------------------------ |
| `NODE_RED_HTTPS_ENABLED`                | Enables HTTPS when set to `true`, `1`, or `yes`. |
| `NODE_RED_REQUIRE_HTTPS`                | Redirects HTTP requests to HTTPS when enabled.   |
| `NODE_RED_HTTPS_KEY`                    | Container path to the private key.               |
| `NODE_RED_HTTPS_CERT`                   | Container path to the server certificate.        |
| `NODE_RED_HTTPS_REFRESH_INTERVAL_HOURS` | Optional certificate refresh interval.           |

The compose file mounts `./certs` read-only at `/certs`, so certificates in that directory can be referenced with container paths such as `/certs/CA.crt`.

## Run

Start the published image:

```sh
docker compose up -d
```

Open the editor at <http://localhost:1880> unless HTTPS or a different port is configured.

View logs:

```sh
docker compose logs -f node-red
```

Stop the runtime:

```sh
docker compose down
```

## Build locally

To build the image from the included `Dockerfile`, enable the `build` entry in `compose.yaml` and remove or replace the `image` entry as appropriate for your workflow. Then run:

```sh
docker compose build
docker compose up -d
```

When changing the installed Node-RED modules or base Node-RED version, rebuild the image before starting the service.

## Project files

| File                     | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `compose.yaml`           | Runs the published Node-RED image and mounts certificates.               |
| `Dockerfile`             | Defines the base image and installed Node-RED modules.                   |
| `settings.js`            | Configures Node-RED, authentication, and optional HTTPS.                 |
| `user-authentication.js` | Implements LDAP authentication and local bcrypt fallback authentication. |
| `.env.example`           | Safe configuration template.                                             |
| `certs/`                 | Local trusted certificates, mounted read-only into the container.        |
