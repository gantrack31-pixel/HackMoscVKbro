import pytest
from pydantic import ValidationError

from app.models import DeckContent
from app.services.visual_grounding import normalize_model_icons


def stored_deck():
    # Shape of the stored project that broke GET /api/projects/{id} (slide with unknown IDs).
    return {'title': 'Экология', 'slides': [
        {'title': 'Ок', 'kind': 'icons', 'bullets': ['а', 'б'], 'icon_names': ['cloud', 'heart']},
        {'title': 'Плохо', 'kind': 'icons', 'bullets': ['а', 'б', 'в', 'г'],
         'icon_names': ['cloud', 'heart', 'apps', 'home']},
    ]}


def test_stored_unknown_icons_are_rejected_by_public_schema():
    with pytest.raises(ValidationError):
        DeckContent.model_validate(stored_deck())


def test_stored_unknown_icons_map_to_auto_and_keep_valid_ones():
    deck = DeckContent.model_validate(normalize_model_icons(stored_deck(), 'slides'))
    assert deck.slides[0].icon_names == ['cloud', 'heart']
    assert deck.slides[1].icon_names == ['cloud', 'heart', 'auto', 'auto']


def test_normalization_does_not_mutate_input():
    raw = stored_deck()
    normalize_model_icons(raw, 'slides')
    assert raw['slides'][1]['icon_names'] == ['cloud', 'heart', 'apps', 'home']
