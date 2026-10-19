"""Bounded assistant context and review contracts; never executable instructions."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class ConversationTurn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=3000)


class LockedField(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slide: int = Field(ge=0, le=199)
    field: Literal['title', 'body', 'bullets', 'source_quote', 'chart', 'table', 'notes']


class ProjectVersionRequest(BaseModel):
    base_updated_at: str | None = Field(default=None, min_length=1, max_length=80)
