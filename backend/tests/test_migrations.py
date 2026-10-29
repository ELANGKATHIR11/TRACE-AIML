from sqlalchemy import inspect


def test_head_creates_all_tables(session):
    names = set(inspect(session.get_bind()).get_table_names())
    assert {"users", "institutions", "checklist_rules", "applications", "documents", "validation_flags", "audit_logs", "officer_decisions", "alembic_version"} <= names


def test_startup_seeds_reference_data_but_no_users(client, session):
    from sqlmodel import select
    from app.models.models import User, ChecklistRule

    assert session.exec(select(User)).first() is None
    assert len(session.exec(select(ChecklistRule)).all()) == 4
