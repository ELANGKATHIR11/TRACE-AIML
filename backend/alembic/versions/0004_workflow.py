"""workflow

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-28 18:00:12.618984

Application lifecycle (spec §6.1-§6.3): `officer_decisions` table and
`documents.superseded_by_id`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK_SUPERSEDED_BY = 'fk_documents_superseded_by_id_documents'


def upgrade() -> None:
    op.create_table('officer_decisions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('application_id', sa.Integer(), nullable=False),
    sa.Column('officer_user_id', sa.Integer(), nullable=False),
    sa.Column('decision', sa.Enum('APPROVE', 'REQUEST_RECTIFICATION', 'REJECT', name='officerdecisiontype'), nullable=False),
    sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('audit_log_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
    sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ),
    sa.ForeignKeyConstraint(['audit_log_id'], ['audit_logs.id'], ),
    sa.ForeignKeyConstraint(['officer_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('officer_decisions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_officer_decisions_application_id'), ['application_id'], unique=False)

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('superseded_by_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(FK_SUPERSEDED_BY, 'documents', ['superseded_by_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_constraint(FK_SUPERSEDED_BY, type_='foreignkey')
        batch_op.drop_column('superseded_by_id')

    with op.batch_alter_table('officer_decisions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_officer_decisions_application_id'))

    op.drop_table('officer_decisions')
