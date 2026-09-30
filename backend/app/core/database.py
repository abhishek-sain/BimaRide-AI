from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_lightweight_migrations() -> None:
    """This project has no Alembic — `Base.metadata.create_all()` (called
    at startup) creates missing tables but never adds columns to a table
    that already exists. Without this, a schema change like adding
    SosAlert.speed_kmh would silently 500 on an existing dev database
    instead of showing up as a missing column, and the fix would look like
    "delete your database and lose your test accounts."

    This adds any column that's on a model but missing from the actual
    table — additive only, one ALTER TABLE per missing column. It never
    drops or renames a column, so it can't lose data. Good enough for a
    project at this stage; a real migration tool (Alembic) is the right
    call once the schema needs anything this can't do."""
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue  # create_all() will create it from scratch
            existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}'))
