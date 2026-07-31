"""Application configuration — loads from .env via pydantic-settings."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    glm_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5"
    duckdb_path: str = "./data/fpa.duckdb"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    anomaly_threshold_pct: float = 10.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


def get_settings() -> Settings:
    return Settings()
