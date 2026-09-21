"""Авторские темы: композиция и цвета общие для обложки, редактора и экспорта."""
THEMES = [
    # id, название, категория, заголовок обложки, акцент, фон, композиция
    ('strategy', 'Стратегия роста', 'Бизнес', 'Видение. Приоритеты. Результат.', '#205649', '#EFF5EF', 'editorial'),
    ('marketing', 'Кампания с характером', 'Маркетинг', 'Идеи, которые замечают.', '#A53159', '#FFF1F5', 'split'),
    ('product', 'Продукт в фокусе', 'Стартапы', 'От проблемы — к решению.', '#4455B7', '#F2F3FF', 'grid'),
    ('workshop', 'Практикум', 'Образование', 'Учимся. Пробуем. Создаём.', '#925526', '#FFF8E9', 'split'),
    ('analytics', 'История в данных', 'Отчёты', 'За каждой цифрой — решение.', '#146578', '#EDF8FA', 'grid'),
    ('editorial', 'Новая перспектива', 'Креативные', 'Посмотрите на привычное иначе.', '#A54B33', '#FFF3E8', 'editorial'),
    ('roadmap', 'Дорожная карта', 'Бизнес', 'Большая цель. Понятные шаги.', '#344DA8', '#F0F4FF', 'split'),
    ('conference', 'На одной волне', 'События', 'Люди. Идеи. Новые связи.', '#734AA8', '#F7F0FF', 'editorial'),
    ('case-study', 'История решения', 'Портфолио', 'Задача. Процесс. Результат.', '#2E6473', '#F2F7F8', 'grid'),
]

def theme_metadata(theme):
    tid, name, category, title, accent, background, composition = theme
    return {'category':category, 'cover_title':title, 'accent':accent, 'background':background,
            'composition':composition, 'colors':{'accent1':accent,'lt1':background,'dk1':'#0F172A'},
            'heading_pt':36 if composition=='editorial' else 32, 'body_pt':18,
            'font':'Manrope','count':0,'recommended_slides':12,'ratio':16/9,'layouts':[],
            'source':'starter','warnings':[]}
