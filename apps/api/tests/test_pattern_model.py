import unittest

from app.pattern_model import build_pattern_report


def _months():
    return [f"2024-{number:02d}" for number in range(1, 9)]


def _monthly():
    return [
        {"_id": month, "total": 1000, "typical": 700, "commute": 200, "disease": 100}
        for month in _months()
    ]


def _sector_rows():
    rows = []
    for month in _months():
        rows.append({"_id": {"month": month, "cnae2": "41"}, "total": 200})
        rows.append({"_id": {"month": month, "cnae2": "10"}, "total": 150})
    return rows


def _machine_rows():
    rows = []
    for month in _months():
        number = int(month[-2:])
        rows.append({"_id": {"month": month, "cnae2": "41"}, "total": 132 if number >= 6 else 100})
        rows.append({"_id": {"month": month, "cnae2": "10"}, "total": 200})
    return rows


def _ufs():
    profiles = [
        ("SC", "Santa Catarina", 1800, 20),
        ("PR", "Paraná", 1600, 18),
        ("RS", "Rio Grande do Sul", 1500, 16),
        ("SP", "São Paulo", 900, 40),
        ("MG", "Minas Gerais", 880, 36),
        ("RJ", "Rio de Janeiro", 860, 34),
        ("MA", "Maranhão", 400, 8),
        ("PI", "Piauí", 380, 7),
        ("AL", "Alagoas", 360, 6),
    ]
    ufs = []
    for sigla, nome, rate, deaths in profiles:
        ufs.append(
            {
                "sigla": sigla,
                "nome": nome,
                "total": 1000,
                "deaths": deaths,
                "typical": 700,
                "commute": 200,
                "disease": 100,
                "population": round(1000 * 100_000 / rate),
                "rate": rate,
            }
        )
    return ufs


class PatternModelTest(unittest.TestCase):
    def test_machine_increase_and_region_clusters(self) -> None:
        report = build_pattern_report(
            {
                "monthly": _monthly(),
                "sector_month": _sector_rows(),
                "machine_month": _machine_rows(),
                "weekday_month": [
                    {"_id": {"month": "2024-08", "weekday": 3}, "total": 400},
                    {"_id": {"month": "2024-08", "weekday": 1}, "total": 80},
                ],
                "pairs": [{"_id": {"agent": "Prensa", "lesion": "Amputacao"}, "total": 80}],
                "agents": [{"_id": "Prensa", "total": 100}, {"_id": "Queda", "total": 300}],
                "lesions": [{"_id": "Amputacao", "total": 90}, {"_id": "Corte", "total": 310}],
                "activities": [{"_id": "Fabricacao de Produt", "total": 500}],
                "municipalities": [],
            },
            _ufs(),
        )

        self.assertEqual(report["status"], "ready")
        self.assertIn("construção", report["headline"])
        self.assertIn("máquinas", report["headline"])
        self.assertIn("32%", report["headline"])
        self.assertEqual(report["stability"], 50)
        self.assertEqual(report["headline_change"], 32.0)
        self.assertGreaterEqual(len(report["clusters"]), 2)
        self.assertEqual(report["associations"][0]["agent"], "Prensa")
        self.assertGreater(report["associations"][0]["lift"], 1.35)
        self.assertIn("Terça-feira", report["peak"])


if __name__ == "__main__":
    unittest.main()
