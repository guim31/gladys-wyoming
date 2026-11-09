# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores nothing in `/data` and handles no secret: its
configuration (server address, port, voice names, audio format) is kept by
Gladys. It opens plain TCP connections to the Wyoming server you configure,
on your local network, and sends it the texts Gladys asks to speak: the
Wyoming protocol has neither encryption nor authentication, so keep that
server on a trusted network. The spoken texts are never written to the logs.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Piper and the other Wyoming servers the integration talks to.
