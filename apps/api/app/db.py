from functools import lru_cache

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from app.config import get_settings


@lru_cache
def get_mongo_client() -> MongoClient:
    settings = get_settings()
    return MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)


def get_database() -> Database:
    settings = get_settings()
    return get_mongo_client()[settings.mongo_database]


def get_cat_collection() -> Collection:
    settings = get_settings()
    return get_database()[settings.mongo_collection]
