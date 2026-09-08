from functools import lru_cache
from typing import Annotated

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


load_dotenv()


class Settings(BaseSettings):
    mongo_uri: Annotated[str, Field(alias="MONGO_URI")] = "mongodb://localhost:27017"
    mongo_database: Annotated[str, Field(alias="MONGO_DATABASE")] = "sentinela"
    mongo_collection: Annotated[str, Field(alias="MONGO_COLLECTION")] = "cat_comunicacoes"
    sentinela_dataset_url: Annotated[str, Field(alias="SENTINELA_DATASET_URL")] = (
        "https://dadosabertos.inss.gov.br/pt_BR/dataset/"
        "comunicacoes-de-acidente-de-trabalho-cat-plano-de-dados-abertos-jun-2023-a-jun-2025"
    )
    sentinela_tag: Annotated[str, Field(alias="SENTINELA_TAG")] = ""
    allowed_origins: Annotated[str, Field(alias="ALLOWED_ORIGINS")] = "http://localhost:3000"

    model_config = SettingsConfigDict(extra="ignore", populate_by_name=True)

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
