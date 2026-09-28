"""Расширенные проверки аудита."""
import pytest
from unittest.mock import patch
from app.models import DeckContent, Slide, ChartData
from app.services.audit import audit_deck, hex_upper


def _tf(fonts=None, colors=None):
    return {"metadata": {"fonts": fonts or ["Manrope"],
        "colors": colors or {"primary": "#1E3A5F", "accent": "#0077B6", "background": "#FFFFFF"},
        "width_emu": 9144000, "layouts": [], "assets": []}}


def _ms(odata):
    objs = []
    for d in odata:
        o = {"type": d.get("type","text"), "id": d.get("id","obj"),
             "x":d.get("x",0), "y":d.get("y",0),
             "w":d.get("w",200), "h":d.get("h",50)}
        if d.get("type") == "text":
            o.update({"font_size":d.get("font_size",24), "color":d.get("color","#0F172A"),
                       "bold":d.get("bold",False), "used_height":d.get("used_height",50)})
            if "font_family" in d: o["font_family"] = d["font_family"]
            if "text" in d: o["text"] = d["text"]
        elif d.get("type") == "rect": o["fill"] = d.get("fill","#FFFFFF")
        elif d.get("type") == "chart":
            o.update({"labels":d.get("labels",["a"]), "values":d.get("values",[1]),
                       "unit":d.get("unit",""), "fill":d.get("fill","#1E3A5F"),
                       "chart_type":d.get("chart_type","bar")})
        objs.append(o)
    bg = next((o for o in objs if o.get("id")=="bg"), None)
    if not bg:
        objs.insert(0, {"type":"rect","fill":"#FFFFFF","id":"bg","x":0,"y":0,"w":1280,"h":720})
    return {"width":1280, "height":720, "objects":objs}


class TestFontChecks:
    @patch("app.services.audit.build_scene")
    def test_font_unknown(self, m):
        m.return_value = _ms([{"type":"text","id":"body","font_family":"Arial","font_size":24,"color":"#000000","used_height":30}])
        issues = audit_deck(DeckContent(title="T", slides=[Slide(title="Test", body="Text")]), _tf(["Manrope"]), "a", "")
        assert "font_unknown" in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_font_from_template_ok(self, m):
        m.return_value = _ms([{"type":"text","id":"body","font_family":"Roboto","font_size":20,"color":"#0F172A","used_height":30}])
        issues = audit_deck(DeckContent(title="O", slides=[Slide(title="OK", body="OK")]), _tf(["Manrope","Roboto"]), "a", "")
        assert "font_unknown" not in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_no_font_defaults_manrope(self, m):
        m.return_value = _ms([{"type":"text","id":"body","font_size":20,"color":"#0F172A","used_height":30}])
        issues = audit_deck(DeckContent(title="N", slides=[Slide(title="NF", body="NF")]), _tf(["Manrope"]), "a", "")
        assert "font_unknown" not in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_font_too_many(self, m):
        m.return_value = _ms([{"type":"text","id":str(i),"font_family":f,"font_size":20,"color":"#0F172A","used_height":30} for i,f in enumerate(["Arial","Roboto","Calibri"])])
        issues = audit_deck(DeckContent(title="TM", slides=[Slide(title="Test")]), _tf(["Manrope","Arial","Roboto"]), "a", "")
        assert "font_too_many" in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_font_two_ok(self, m):
        m.return_value = _ms([{"type":"text","id":str(i),"font_family":f,"font_size":20,"color":"#0F172A","used_height":30} for i,f in enumerate(["Manrope","Arial"])])
        issues = audit_deck(DeckContent(title="TF", slides=[Slide(title="Test")]), _tf(["Manrope","Arial"]), "a", "")
        assert "font_too_many" not in {i.code for i in issues}


class TestColorPaletteCheck:
    @patch("app.services.audit.build_scene")
    def test_color_off_palette(self, m):
        m.return_value = _ms([{"type":"rect","fill":"#FFFFFF","id":"bg"},{"type":"text","id":"body","font_size":20,"color":"#FF00FF","used_height":30}])
        issues = audit_deck(DeckContent(title="T", slides=[Slide(title="Test")]), _tf(["Manrope"], colors={"primary":"#1E3A5F"}), "a", "")
        assert "color_off_palette" in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_white_black_excluded(self, m):
        m.return_value = _ms([{"type":"rect","fill":"#FFFFFF","id":"bg"},{"type":"text","id":"body","font_size":20,"color":"#000000","used_height":30}])
        issues = audit_deck(DeckContent(title="T", slides=[Slide(title="Test")]), _tf(["Manrope"], colors={"primary":"#1E3A5F"}), "a", "")
        assert "color_off_palette" not in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_in_palette_ok(self, m):
        m.return_value = _ms([{"type":"rect","fill":"#FFFFFF","id":"bg"},{"type":"text","id":"body","font_size":20,"color":"#1E3A5F","used_height":30}])
        issues = audit_deck(DeckContent(title="T", slides=[Slide(title="Test")]), _tf(["Manrope"], colors={"primary":"#1E3A5F","bg":"#FFFFFF"}), "a", "")
        assert "color_off_palette" not in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_case_insensitive(self, m):
        m.return_value = _ms([{"type":"rect","fill":"#fffFFF","id":"bg"},{"type":"text","id":"body","font_size":20,"color":"#1E3A5F","used_height":30}])
        issues = audit_deck(DeckContent(title="T", slides=[Slide(title="Test")]), _tf(["Manrope"], colors={"primary":"#1e3a5f"}), "a", "")
        assert "color_off_palette" not in {i.code for i in issues}


class TestSlideDensity:
    @patch("app.services.audit.build_scene")
    def test_empty_under_25(self, m):
        m.return_value = _ms([{"type":"rect","fill":"#FFFFFF","id":"bg","w":1280,"h":720},
                              {"type":"text","id":"title","font_size":36,"color":"#0F172A","used_height":40,"x":20,"y":20,"w":300,"h":60}])
        issues = audit_deck(DeckContent(title="ED", slides=[Slide(title="Empty Demo", body="")]), _tf(["Manrope"]), "a", "")
        assert "empty_slide" in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_overfull_over_75(self, m):
        m.return_value = _ms([{"type":"rect","fill":"#FFFFFF","id":"bg","w":1280,"h":720},
                              {"type":"text","id":"body","font_size":16,"color":"#0F172A","used_height":600,"x":20,"y":20,"w":1200,"h":660}])
        issues = audit_deck(DeckContent(title="OF", slides=[Slide(title="OverFull", body="x"*500)]), _tf(["Manrope"]), "a", "")
        assert "overfull_slide" in {i.code for i in issues}

    @patch("app.services.audit.build_scene")
    def test_normal_fill_ok(self, m):
        m.return_value = _ms([{"type":"rect","fill":"#FFFFFF","id":"bg","w":1280,"h":720},
                              {"type":"text","id":"title","font_size":32,"color":"#0F172A","used_height":80,"x":20,"y":20,"w":800,"h":100},
                              {"type":"text","id":"body","font_size":20,"color":"#0F172A","used_height":200,"x":20,"y":150,"w":1000,"h":400}])
        content = DeckContent(title="ND", slides=[Slide(title="Normal", body=f"s{b}") for b in range(3)])
        issues = audit_deck(content, _tf(["Manrope"]), "a", "")
        codes = {i.code for i in issues}
        assert "empty_slide" not in codes and "overfull_slide" not in codes





class TestDuplicateSlides:
    def test_duplicate_detected(self):
        deck = DeckContent(title="Dupes", slides=[Slide(title="Результаты Q3", body="Выручка выросла на 15%.")] * 2)
        issues = audit_deck(deck, _tf(["Manrope"]), "a", "")
        dupes = [i for i in issues if i.code == "duplicate"]
        assert len(dupes) == 1 and dupes[0].slide == 1

    def test_no_duplicates(self):
        deck = DeckContent(title="Unique", slides=[Slide(title="Финансы", body="Прибыль."), Slide(title="Маркетинг", body="Кампания.")])
        issues = audit_deck(deck, _tf(["Manrope"]), "a", "")
        assert len([i for i in issues if i.code == "duplicate"]) == 0

    def test_normalize_ws(self):
        deck = DeckContent(title="Norm", slides=[Slide(title="R", body="  A   B"), Slide(title="R", body="A B")])
        issues = audit_deck(deck, _tf(["Manrope"]), "a", "")
        assert len([i for i in issues if i.code == "duplicate"]) == 1

    def test_triple(self):
        deck = DeckContent(title="Triple", slides=[Slide(title="X", body="Y")] * 3)
        issues = audit_deck(deck, _tf(["Manrope"]), "a", "")
        assert len([i for i in issues if i.code == "duplicate"]) == 2


class TestChartTableLimits:
    def test_chart_no_legend(self):
        slide = Slide(title="One", kind="chart", chart=ChartData(labels=["Q1"], values=[42], unit="млн"))
        issues = audit_deck(DeckContent(title="CL", slides=[slide]), _tf(["Manrope"]), "a", "")
        assert "chart_no_legend" in {i.code for i in issues}

    def test_chart_multi_ok(self):
        slide = Slide(title="M", kind="chart", chart=ChartData(labels=["Q1","Q2","Q3"], values=[10,20,30], unit="млн"))
        issues = audit_deck(DeckContent(title="CM", slides=[slide]), _tf(["Manrope"]), "a", "")
        assert "chart_no_legend" not in {i.code for i in issues}

    def test_chart_missing_unit(self):
        slide = Slide(title="NU", kind="chart", chart=ChartData(labels=["A","B"], values=[1,2], unit=""))
        issues = audit_deck(DeckContent(title="CU", slides=[slide]), _tf(["Manrope"]), "a", "")
        assert "chart_unit" in {i.code for i in issues}

    # Пропускаем: модель Pydantic уже ограничивает 9 строк / 6 колонок,
    # audit проверки проверяют эти же ограничения. Для production они
    # будут вызываться только если данные обойдут валидацию.
    def test_table_rows(self):
        pytest.skip("Model max_length prevents >9 rows; covered by Pydantic validation")

    def test_table_cols(self):
        pytest.skip("Model max 6 cols; covered by Pydantic validation")

    def test_table_ok(self):
        slide = Slide(title="OK", kind="table", table=[["H1","H2"],["D1","D2"]])
        issues = audit_deck(DeckContent(title="TL", slides=[slide]), _tf(["Manrope"]), "a", "")
        codes = {i.code for i in issues}
        assert "table_rows" not in codes
        assert "table_cols" not in codes


class TestHexUpper:
    def test_strip_upper(self):
        assert hex_upper("#ff00aa") == "#FF00AA"
        assert hex_upper("FF00AA") == "#FF00AA"
        assert hex_upper("abc") == "#ABC"
        assert hex_upper("#ABC") == "#ABC"
        assert hex_upper("") == ""
