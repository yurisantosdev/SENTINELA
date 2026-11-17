import random
import unittest

from app.risk_model import fit_risk_model


def _record(*, death: bool, construction: bool, head: bool, female: bool) -> dict[str, str]:
    return {
        "Indica Óbito Acidente": "Sim" if death else "Não",
        "Tipo do Acidente": "Típico",
        "Sexo": "Feminino" if female else "Masculino",
        "Data Nascimento": "1990-05-10",
        "Data Acidente": "2024-06-01",
        "Parte Corpo Atingida": "Cabeça" if head else "Dedo",
        "CNAE2_0 Empregador": "4120-4/00" if construction else "4711-3/02",
    }


class RiskModelTest(unittest.TestCase):
    def test_logistic_regression_finds_fatal_patterns(self) -> None:
        rng = random.Random(7)
        records = []
        for _ in range(1600):
            construction = rng.random() < 0.35
            head = rng.random() < 0.3
            female = rng.random() < 0.4
            probability = 0.03
            if construction:
                probability += 0.28
            if head:
                probability += 0.34
            if female:
                probability -= 0.015
            records.append(
                _record(
                    death=rng.random() < probability,
                    construction=construction,
                    head=head,
                    female=female,
                )
            )

        report = fit_risk_model(records)

        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["algorithm"], "Regressão logística")
        self.assertGreater(report["auc"], 0.7)
        factors = {factor["code"]: factor for factor in report["factors"]}
        self.assertGreater(factors["setor_construcao"]["odds_ratio"], 1.5)
        self.assertGreater(factors["corpo_cabeca"]["odds_ratio"], 1.5)
        self.assertEqual(factors["setor_construcao"]["effect"], "aumenta")

    def test_small_sample_is_insufficient(self) -> None:
        records = [_record(death=index % 2 == 0, construction=False, head=False, female=False) for index in range(20)]
        report = fit_risk_model(records)
        self.assertEqual(report["status"], "insufficient")
        self.assertEqual(report["factors"], [])


if __name__ == "__main__":
    unittest.main()
