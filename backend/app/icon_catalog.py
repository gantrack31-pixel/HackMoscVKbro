"""Stable, allowlisted names shared by API validation and AI prompts."""
from typing import Literal

IconName = Literal['idea', 'people', 'target', 'growth', 'shield', 'clock',
                   'heart', 'briefcase', 'calendar', 'location', 'settings', 'search',
                   'document', 'cloud', 'link', 'check', 'warning', 'chat',
                   'education', 'package', 'delivery', 'calculator', 'star', 'compare']

# id: (upstream category, upstream filename stem, Russian semantic description)
ICONS = {
    'idea': ('General', 'Lightning 1', 'идея, энергия, инновации'),
    'people': ('Communication', 'Profile', 'люди, команда, аудитория'),
    'target': ('General', 'Flag', 'цель, ориентир, результат'),
    'growth': ('Math', 'Trend Up', 'рост, прогресс, динамика'),
    'shield': ('General', 'Shield Yes', 'безопасность, защита, надёжность'),
    'clock': ('General', 'Clock', 'время, сроки, скорость'),
    'heart': ('General', 'Heart', 'здоровье, забота, благополучие'),
    'briefcase': ('General', 'Briefcase', 'бизнес, работа, карьера'),
    'calendar': ('General', 'Calendar 1', 'план, расписание, события'),
    'location': ('General', 'Location Pin', 'место, география, адрес'),
    'settings': ('General', 'Settings', 'настройка, процессы, инструменты'),
    'search': ('General', 'Search', 'исследование, поиск, анализ'),
    'document': ('Files', 'File Document', 'документ, отчёт, материалы'),
    'cloud': ('Files', 'Cloud', 'облако, инфраструктура, хранение'),
    'link': ('Interface', 'Link', 'связь, интеграция, партнёрство'),
    'check': ('Interface', 'Check Circle 1', 'проверка, готовность, качество'),
    'warning': ('Interface', 'Attention Circle', 'риск, ограничение, внимание'),
    'chat': ('Communication', 'Comment Dots', 'обсуждение, обратная связь'),
    'education': ('eCommerce', 'Certificate Badge', 'обучение, сертификация, квалификация'),
    'package': ('eCommerce', 'Box', 'продукт, поставка, упаковка'),
    'delivery': ('eCommerce', 'Delivery', 'логистика, доставка, транспорт'),
    'calculator': ('Math', 'Calculator', 'расчёт, бюджет, экономика'),
    'star': ('General', 'Star', 'преимущество, качество, приоритет'),
    'compare': ('Interface', 'Compare', 'сравнение, варианты, выбор'),
}

def model_icons():
    return {'library': 'IconaMoon Regular', 'icons': {name: item[2] for name, item in ICONS.items()},
            'usage': 'kind=icons; icon_names[i] соответствует bullets[i]. Только по смыслу, не для украшения каждого слайда.'}
