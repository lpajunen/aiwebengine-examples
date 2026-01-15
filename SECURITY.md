# Security Policy

## Supported Versions

This project is currently experimental and under active development. Security updates will be applied to the latest version.

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < Latest | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in this project, please report it responsibly.

### How to Report

**Please do NOT create a public GitHub issue for security vulnerabilities.**

Instead, report security issues via:

- **Email**: lpajunen@gmail.com
- **Subject**: [SECURITY] Brief description of the issue
- **GitHub**: [@lpajunen](https://github.com/lpajunen)

### What to Include

When reporting a vulnerability, please include:

1. **Description** - Clear description of the vulnerability
2. **Impact** - What could an attacker potentially do?
3. **Steps to Reproduce** - Detailed steps to reproduce the issue
4. **Proof of Concept** - Code or screenshots if applicable
5. **Suggested Fix** - If you have ideas for fixing it (optional)
6. **Your Contact Info** - So we can follow up with questions

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Assessment**: We'll assess the severity and impact
- **Updates**: We'll keep you informed of progress
- **Fix Timeline**: We'll work to fix verified issues as quickly as possible
- **Credit**: With your permission, we'll credit you in the fix announcement

## Security Best Practices for Users

When using this toolkit:

1. **Never commit secrets**:
   - Keep `.env` files local (already in `.gitignore`)
   - Don't hardcode API keys or tokens in scripts
   - Use environment variables for sensitive data

2. **Token security**:
   - `schemas/token.json` is gitignored - keep it that way
   - Tokens expire - refresh them regularly
   - Don't share tokens between environments

3. **OAuth security**:
   - Use PKCE flow (already implemented in scripts)
   - Keep client secrets secure
   - Use appropriate OAuth scopes

4. **Server configuration**:
   - Always use HTTPS for server endpoints
   - Validate server certificates
   - Configure CORS appropriately

5. **Dependencies**:
   - Keep dependencies updated: `npm outdated`
   - Review security advisories: `npm audit`
   - Use `package-lock.json` for reproducible builds

## Known Security Considerations

- This is a **development toolkit** - not intended for production use as-is
- OAuth token storage is file-based (`schemas/token.json`) - secure this file
- The project uses environment variables - ensure `.env` is not committed
- MCP server configurations may contain sensitive paths - review before sharing

## Security Updates

Security updates will be announced via:

- GitHub Releases
- Repository Security Advisories
- Commit messages tagged with `[SECURITY]`

## Questions?

If you have security-related questions that don't involve a vulnerability:

- Open a [Discussion](https://github.com/lpajunen/aiwebengine-examples/discussions)
- Contact: lpajunen@gmail.com

Thank you for helping keep aiwebengine-examples secure! 🔒
