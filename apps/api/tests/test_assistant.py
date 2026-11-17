import unittest

from app.assistant import interpret


class AssistantInterpretTest(unittest.TestCase):
    def test_state_year(self) -> None:
        plan = interpret("Quantos acidentes aconteceram em Santa Catarina em 2025?")
        self.assertEqual(plan["intent"], "count")
        self.assertEqual(plan["sigla"], "SC")
        self.assertEqual(plan["year"], 2025)

    def test_fatal_municipality(self) -> None:
        self.assertEqual(interpret("Qual município possui mais acidentes fatais?")["intent"], "fatal_municipality")

    def test_cnae_and_agents_and_commute(self) -> None:
        self.assertEqual(interpret("Quais são os CNAEs com maior incidência?")["intent"], "cnae")
        self.assertEqual(interpret("Quais agentes causadores aparecem com maior frequência?")["intent"], "agents")
        self.assertEqual(interpret("Qual foi a evolução dos acidentes de trajeto?")["intent"], "commute")

    def test_compare_cities(self) -> None:
        plan = interpret("Compare os acidentes de Chapecó com os de Florianópolis.")
        self.assertEqual(plan["intent"], "compare")
        names = {place.name for place in plan["municipalities"]}
        self.assertEqual(names, {"Chapecó", "Florianópolis"})
        self.assertTrue(all(place.sigla == "SC" for place in plan["municipalities"]))
        self.assertIsNone(plan["hint"])

    def test_highest_rate_in_state(self) -> None:
        plan = interpret("qual a cidade com maior taxa de SC")
        self.assertEqual(plan["intent"], "top_rate")
        self.assertEqual(plan["sigla"], "SC")

    def test_partial_city_compare(self) -> None:
        plan = interpret("compate chapeco com Ita")
        self.assertEqual(plan["intent"], "compare")
        self.assertEqual(plan["municipalities"][0].name, "Chapecó")
        self.assertEqual(plan["municipalities"][1].name, "Itajaí")
        self.assertEqual(plan["hint"], "ita")
        self.assertIn("Itapema", {place.name for place in plan["alternatives"]})
        self.assertTrue(all(place.sigla == "SC" for place in plan["municipalities"]))


if __name__ == "__main__":
    unittest.main()
