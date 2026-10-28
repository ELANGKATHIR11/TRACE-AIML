"""audit_chain

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-28 14:36:08.754292

Adds the HMAC hash chain columns to audit_logs and backfills existing rows in id order (spec §5.4),
keyed with AUDIT_HMAC_KEY from settings.
"""
from types import SimpleNamespace
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backfill() -> None:
    from app.services.audit_service import GENESIS_HASH, compute_record_hash

    audit_logs = sa.table(
        'audit_logs',
        sa.column('id', sa.Integer()),
        sa.column('application_id', sa.Integer()),
        sa.column('actor_user_id', sa.Integer()),
        sa.column('actor_role', sa.String()),
        sa.column('action_type', sa.String()),
        sa.column('entity_type', sa.String()),
        sa.column('entity_id', sa.String()),
        sa.column('summary', sa.String()),
        sa.column('details', sa.JSON()),
        sa.column('timestamp', sqlmodel.sql.sqltypes.UTCDateTime()),
        sa.column('prev_hash', sa.String()),
        sa.column('record_hash', sa.String()),
    )
    bind = op.get_bind()
    rows = bind.execute(sa.select(audit_logs).order_by(audit_logs.c.id)).mappings().all()
    prev_hash = GENESIS_HASH
    for row in rows:
        values = dict(row)
        values['details'] = values['details'] or {}
        values['prev_hash'] = prev_hash
        record_hash = compute_record_hash(SimpleNamespace(**values))
        bind.execute(
            audit_logs.update()
            .where(audit_logs.c.id == row['id'])
            .values(details=values['details'], prev_hash=prev_hash, record_hash=record_hash)
        )
        prev_hash = record_hash


def upgrade() -> None:
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('prev_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True))
        batch_op.add_column(sa.Column('record_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True))

    _backfill()

    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.alter_column('prev_hash', existing_type=sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_column('record_hash')
        batch_op.drop_column('prev_hash')
