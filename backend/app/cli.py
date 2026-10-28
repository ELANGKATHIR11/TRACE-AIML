"""Operational CLI: ``python -m app.cli <command>``."""

import argparse
import base64
import getpass
import os
import secrets
import sys


def _generate_keys() -> int:
    print("# Paste into backend/.env (keep secret; never commit)")
    print(f"SECRET_KEY={secrets.token_urlsafe(48)}")
    print(f"AUDIT_HMAC_KEY={secrets.token_urlsafe(48)}")
    print(f"FILE_ENCRYPTION_KEY={base64.urlsafe_b64encode(os.urandom(32)).decode()}")
    return 0


def _create_admin(email: str, full_name: str) -> int:
    from sqlmodel import Session, select

    from app.database import get_engine
    from app.models.enums import UserRole
    from app.models.models import User
    from app.services.audit_service import log_audit_event
    from app.services.security import hash_password, validate_password_policy

    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match", file=sys.stderr)
        return 1
    try:
        validate_password_policy(password, email)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    with Session(get_engine()) as session:
        if session.exec(select(User).where(User.email == email)).first() is not None:
            print(f"A user with email {email} already exists", file=sys.stderr)
            return 1
        user = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            role=UserRole.ADMIN,
            must_change_password=False,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        log_audit_event(
            session,
            action_type="USER_CREATED",
            entity_type="User",
            entity_id=str(user.id),
            actor_role_override="SYSTEM",
            summary=f"Admin user {email} created via CLI",
            details={"role": "admin", "source": "cli"},
        )
    print(f"Created admin {email}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="app.cli", description="TRACE backend operations")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("generate-keys", help="Print fresh SECRET_KEY, AUDIT_HMAC_KEY, FILE_ENCRYPTION_KEY")
    admin = sub.add_parser("create-admin", help="Create an admin user (prompts for the password)")
    admin.add_argument("--email", required=True)
    admin.add_argument("--full-name", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "generate-keys":
        return _generate_keys()
    if args.command == "create-admin":
        return _create_admin(args.email, args.full_name)
    return 2


if __name__ == "__main__":
    sys.exit(main())
