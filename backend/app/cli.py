"""Operational CLI: ``python -m app.cli <command>``."""

import argparse
import base64
import os
import secrets
import sys


def _generate_keys() -> int:
    print("# Paste into backend/.env (keep secret; never commit)")
    print(f"SECRET_KEY={secrets.token_urlsafe(48)}")
    print(f"AUDIT_HMAC_KEY={secrets.token_urlsafe(48)}")
    print(f"FILE_ENCRYPTION_KEY={base64.urlsafe_b64encode(os.urandom(32)).decode()}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="app.cli", description="TRACE backend operations")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("generate-keys", help="Print fresh SECRET_KEY, AUDIT_HMAC_KEY, FILE_ENCRYPTION_KEY")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "generate-keys":
        return _generate_keys()
    return 2


if __name__ == "__main__":
    sys.exit(main())
