import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "skills" / "foggy-deepseek-onboarding" / "scripts" / "onboarding.py"
SPEC = importlib.util.spec_from_file_location("foggy_onboarding", MODULE_PATH)
onboarding = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(onboarding)


class OnboardingUnitTests(unittest.TestCase):
    def test_persistent_profile_store_is_private_and_overrideable(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {}, clear=False):
            os.environ.pop("FOGGY_RUNTIME_PROFILE_STORE", None)
            data_root = Path(temporary) / "state"
            store = onboarding.configure_profile_store(data_root)
            self.assertEqual(store, data_root / "cli-profiles")
            self.assertEqual(os.environ["FOGGY_RUNTIME_PROFILE_STORE"], str(store))
            self.assertTrue(store.is_dir())

    def test_profile_is_inferred_only_when_unambiguous(self):
        with tempfile.TemporaryDirectory() as temporary:
            data_root = Path(temporary)
            profiles = data_root / "onboarding" / "profiles"
            profiles.mkdir(parents=True)
            (profiles / "tms.json").write_text("{}", encoding="utf-8")
            self.assertEqual(onboarding.resolve_profile_name(data_root, None), "tms")
            (profiles / "finance.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(onboarding.OnboardingError, "Multiple onboarding profiles"):
                onboarding.resolve_profile_name(data_root, None)

    def test_existing_datasource_must_match_name_and_public_type(self):
        payload = {
            "data": {
                "datasources": [
                    {"name": "tms-mysql", "type": "mysql", "jdbcUrl": "jdbc:mysql://private"},
                ]
            }
        }
        self.assertEqual(
            onboarding.matching_datasource(payload, {"name": "tms-mysql", "type": "mysql"})["name"],
            "tms-mysql",
        )
        self.assertIsNone(onboarding.matching_datasource(payload, {"name": "tms-mysql", "type": "postgres"}))

    def test_semantic_checkpoint_matches_unchanged_registered_draft(self):
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            draft = project_root / ".foggy" / "onboarding-drafts" / "tms"
            draft.mkdir(parents=True)
            (draft / "Order.tm").write_text("export const tableModel = {};", encoding="utf-8")
            (draft / "Order.qm").write_text("export const queryModel = { name: 'OrderQuery' };", encoding="utf-8")
            manifest = onboarding.semantic_manifest(draft)
            plan = {
                "draftDir": ".foggy/onboarding-drafts/tms",
                "bundleName": "tms-semantic",
                "queryModels": ["OrderQuery"],
            }
            state = {
                "projectRoot": str(project_root),
                "semantic": {
                    "draftDir": str(draft),
                    "bundleName": "tms-semantic",
                    "queryModels": ["OrderQuery"],
                    "draftManifest": manifest,
                },
                "steps": {"semanticDrafted": {"status": "completed"}},
            }
            _, current, matches = onboarding.semantic_plan_snapshot(state, plan)
            self.assertTrue(matches)
            self.assertEqual(current["digest"], manifest["digest"])
            (draft / "Order.tm").write_text("export const tableModel = { changed: true };", encoding="utf-8")
            _, _, matches = onboarding.semantic_plan_snapshot(state, plan)
            self.assertFalse(matches)

    def test_semantic_composite_rejects_external_payload_before_mutation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project_root = root / "workspace"
            project_root.mkdir()
            plan = {
                "schemaVersion": onboarding.SEMANTIC_PLAN_SCHEMA,
                "profile": "tms",
                "draftDir": ".foggy/onboarding-drafts/tms",
                "bundleName": "tms-semantic",
                "queryModels": ["OrderQuery"],
            }
            args = type("Args", (), {
                "semantic_plan": str(root / "plan.json"),
                "query_payload": str(root / "outside-query.json"),
                "query_model": "OrderQuery",
                "profile": None,
                "install_root": None,
                "data_root": None,
                "evidence_dir": None,
                "approve_validate": True,
                "approve_publish": True,
                "approve_execute": True,
            })()
            state = {
                "profile": "tms",
                "projectRoot": str(project_root),
                "dataRoot": str(root / "state"),
            }
            with (
                patch.object(onboarding, "read_json_object", return_value=plan),
                patch.object(onboarding, "require_profile", return_value=(state, {}, root / "state", {})),
                patch.object(onboarding, "semantic_draft_command") as draft,
            ):
                with self.assertRaisesRegex(onboarding.OnboardingError, "inside projectRoot"):
                    onboarding.semantic_run_command(args)
                draft.assert_not_called()


if __name__ == "__main__":
    unittest.main()
