from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth, models
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def unauthenticated_client(db: Session) -> Generator[TestClient, None, None]:
    def override_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def client(db: Session, unauthenticated_client: TestClient) -> Generator[TestClient, None, None]:
    user = models.User(email="test@example.com", password_hash=auth.hash_password("test-password"))
    db.add(user)
    db.commit()
    db.refresh(user)
    unauthenticated_client.headers["Authorization"] = f"Bearer {auth.issue_tokens(user)['access_token']}"
    yield unauthenticated_client


@pytest.fixture
def account(db: Session) -> models.Account:
    item = models.Account(
        name="Cuenta UYU",
        currency=models.Currency.UYU,
        opening_balance="100.00",
        is_active=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@pytest.fixture
def categories(db: Session) -> dict[str, models.Category]:
    auto = models.Category(name="Auto", kind=models.TransactionKind.EXPENSE, is_active=True)
    fuel = models.Category(
        name="Combustible", kind=models.TransactionKind.EXPENSE, parent=auto, is_active=True
    )
    food = models.Category(name="Alimentación", kind=models.TransactionKind.EXPENSE, is_active=True)
    salary = models.Category(name="Salario", kind=models.TransactionKind.INCOME, is_active=True)
    db.add_all([auto, fuel, food, salary])
    db.commit()
    return {"auto": auto, "fuel": fuel, "food": food, "salary": salary}
