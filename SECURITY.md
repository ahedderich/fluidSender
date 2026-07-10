# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes. Older versions are not actively patched.

| Version | Supported |
|---------|-----------|
| Latest (`main`) | Yes |
| Older releases | No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing:

**andreas.hedderich0@gmail.com**

Include as much of the following as possible:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if safe to share)
- Affected component (`ui`, `fluid-sim/sim`, `fluid-sim/sim-ui`, CI/CD, Docker config)
- Any suggested mitigation or fix

You will receive an acknowledgement within **72 hours**. If the issue is confirmed, a fix will be prepared and released as a `main/hotfix-*` patch. You will be credited in the release notes unless you request otherwise.

## Security Considerations

### Network Exposure

FluidSender controls physical CNC hardware. Exposing the application to an untrusted network **can cause physical damage to the machine or workpiece**. Always follow these guidelines:

- Run the application on a trusted local network only.
- Enable authentication (`auth.enabled: true` in `config/app.yaml`) if the host is reachable by untrusted users.
- Never expose port 3000 (or whichever port is configured) directly to the public internet without a reverse proxy with TLS and strong authentication.
- USB is the strongly recommended connection method; TCP/WiFi connectivity is less stable and increases the network attack surface.

### Container Security

- All published images are scanned with [Trivy](https://github.com/aquasecurity/trivy) before release; the image is only pushed to the registry after the scan passes.
- CRITICAL or HIGH CVEs block publishing **unless explicitly accepted** in [`.trivyignore`](.trivyignore), which is the authoritative, versioned record of every accepted finding and the reasoning behind it. Most accepted entries come from the Debian base image's own package manager requirements (`dpkg`/`apt` dependencies), not from FluidSender code, and are outside our control to patch until Debian ships a fix or the base image changes. Each entry has an expiry date and is periodically re-reviewed.
- This scan runs once, at release time — it is a point-in-time snapshot, not a continuous check. New CVEs are disclosed against existing package versions all the time, so the longer ago a version was released, the less that snapshot reflects its current, actual vulnerability status. Always prefer the latest release; do not treat an older release's clean scan result as still accurate.
- The `config/` and `data/` volumes are mounted at runtime and never baked into images.
- Containers run as a non-root user.

### Secrets

- No credentials, tokens, or secrets are stored in source code or container images.
- Passwords stored in `config/app.yaml` are bcrypt-hashed.
- Never commit `.env` files containing real secrets; use `.env.example` as a template.

## Scope

The following are **in scope** for security reports:

- Authentication bypass or privilege escalation in the web UI
- Arbitrary command execution via crafted GCode or config input
- Path traversal in file upload/download endpoints
- Container escape or privilege escalation in the Docker setup
- Dependency vulnerabilities with a practical exploitation path

The following are **out of scope**:

- Vulnerabilities in FluidNC firmware itself (report those to the [FluidNC project](https://github.com/bdring/FluidNC))
- Physical safety issues caused by incorrect machine configuration by the user
- Denial-of-service attacks against a locally-networked instance
