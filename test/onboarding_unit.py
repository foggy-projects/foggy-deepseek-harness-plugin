import importlib.util
import os
from pathlib import Path
import tempfile
import subprocess
import time
import unittest
from unittest.mock import patch
import json


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "skills" / "foggy-deepseek-onboarding" / "scripts" / "onboarding.py"
SPEC = importlib.util.spec_from_file_location("foggy_onboarding", MODULE_PATH)
onboarding = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(onboarding)


class OnboardingUnitTests(unittest.TestCase):
    def test_atomic_json_retries_transient_windows_style_lock(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "operation-progress.json"
            target.write_text('{"old": true}', encoding="utf-8")
            real_replace = os.replace
            attempts = 0

            def flaky_replace(source, destination):
                nonlocal attempts
                attempts += 1
                if attempts < 4:
                    raise PermissionError(13, "temporarily locked", str(destination))
                real_replace(source, destination)

            with patch.object(onboarding.os, "replace", side_effect=flaky_replace), patch.object(onboarding.time, "sleep"):
                onboarding.atomic_json(target, {"success": True})

            self.assertEqual(attempts, 4)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), {"success": True})
            self.assertEqual([path.name for path in Path(temporary).iterdir()], ["operation-progress.json"])

    def test_atomic_json_preserves_previous_file_when_lock_persists(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "operation-progress.json"
            target.write_text('{"old": true}', encoding="utf-8")
            locked = PermissionError(13, "locked", str(target))
            with patch.object(onboarding.os, "replace", side_effect=locked) as replace, patch.object(onboarding.time, "sleep"):
                with self.assertRaises(PermissionError):
                    onboarding.atomic_json(target, {"success": True})

            self.assertEqual(replace.call_count, 12)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), {"old": True})
            self.assertEqual([path.name for path in Path(temporary).iterdir()], ["operation-progress.json"])

    def test_runtime_progress_records_elapsed_timeout_and_exact_percent(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "operation-progress.json"
            progress = onboarding.ProgressReporter(
                str(target),
                "runtime-test",
                "runtime-start",
                total_steps=6,
                completion_phase="runtime-complete",
                completion_message="Foggy Runtime is ready",
                failure_message="Foggy Runtime startup failed",
            )
            progress.update(
                "runtime-readiness",
                3,
                "Waiting for Java Runtime readiness",
                percent=47,
                elapsed_seconds=56,
                timeout_seconds=180,
            )
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(payload["percent"], 47)
            self.assertEqual(payload["timing"], {"elapsedSeconds": 56, "timeoutSeconds": 180})
            progress.finish()
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(payload["phase"], "runtime-complete")
            self.assertEqual(payload["message"], "Foggy Runtime is ready")
            self.assertEqual(payload["percent"], 100)

    def test_command_progress_updates_while_waiting(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "operation-progress.json"
            progress = onboarding.ProgressReporter(str(target), "runtime-test", "runtime-start", total_steps=6)
            result = onboarding.command_result_with_progress(
                [onboarding.sys.executable, "-c", "import time; time.sleep(0.08); print('{}')"],
                2,
                progress,
                phase="runtime-readiness",
                step_index=3,
                message="Waiting",
                readiness_timeout=1,
                start_percent=30,
                end_percent=85,
                poll_interval=0.01,
            )
            self.assertEqual(result["exitCode"], 0)
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(payload["phase"], "runtime-readiness")
            self.assertGreaterEqual(payload["timing"]["elapsedSeconds"], 1)

    def test_command_progress_stops_when_watched_runtime_exits(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "operation-progress.json"
            progress = onboarding.ProgressReporter(str(target), "runtime-test", "runtime-start", total_steps=6)
            runtime = subprocess.Popen([
                onboarding.sys.executable,
                "-c",
                "import time; time.sleep(0.08)",
            ])
            started = time.monotonic()
            try:
                with self.assertRaisesRegex(onboarding.OnboardingError, "exited before becoming ready"):
                    onboarding.command_result_with_progress(
                        [onboarding.sys.executable, "-c", "import time; time.sleep(5)"],
                        6,
                        progress,
                        phase="runtime-readiness",
                        step_index=3,
                        message="Waiting",
                        readiness_timeout=5,
                        start_percent=30,
                        end_percent=85,
                        poll_interval=0.05,
                        watched_pid=runtime.pid,
                    )
            finally:
                runtime.wait(timeout=2)
            self.assertLess(time.monotonic() - started, 1.0)

    def test_process_running_detects_current_process(self):
        self.assertTrue(onboarding.process_running(os.getpid()))
        self.assertFalse(onboarding.process_running(0))

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

    def test_legacy_profile_inventory_exposes_only_public_migration_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data_root = root / "state"
            legacy = root / "legacy"
            legacy.mkdir()
            profile_id = "fop_" + "a" * 32
            payload = {
                "schemaVersion": onboarding.OPAQUE_PROFILE_SCHEMA,
                "profileId": profile_id,
                "revision": "sha256:" + "b" * 64,
                "createdAt": "2026-09-01T00:00:00Z",
                "updatedAt": "2026-09-01T00:00:00Z",
                "connection": {
                    "name": "tms-mysql",
                    "type": "mysql",
                    "jdbcUrl": "jdbc:mysql://127.0.0.1/tms",
                    "username": "tms",
                    "passwordEnv": "TMS_DB_PW",
                    "namespace": "tms",
                },
            }
            (legacy / f"{profile_id}.json").write_text(json.dumps(payload), encoding="utf-8")
            with patch.dict(os.environ, {
                "FOGGY_RUNTIME_PROFILE_STORE": str(data_root / "cli-profiles"),
                "FOGGY_RUNTIME_PROFILE_LEGACY_STORES": str(legacy),
            }):
                inventory = onboarding.profile_migration_inventory(data_root)
                with patch.object(onboarding, "read_install_state", return_value={"dataRoot": str(data_root)}):
                    result = onboarding.profile_migrate_command(type("Args", (), {
                        "approve": True,
                        "install_root": None,
                        "data_root": str(data_root),
                    })())
            self.assertEqual(inventory["pendingCount"], 1)
            self.assertEqual(inventory["entries"][0]["profileId"], profile_id)
            self.assertNotIn("connection", inventory["entries"][0])
            self.assertNotIn("jdbcUrl", json.dumps(inventory))
            self.assertEqual(result["migratedCount"], 1)
            self.assertTrue(Path(result["migrated"][0]["destination"]).is_file())
            self.assertTrue(Path(result["migrated"][0]["legacyBackup"]).is_file())
            self.assertFalse((legacy / f"{profile_id}.json").exists())

    def test_completed_profile_can_bind_an_additional_workspace(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data_root = root / "state"
            original = root / "original"
            secondary = root / "secondary"
            original.mkdir()
            secondary.mkdir()
            state = {
                "schemaVersion": onboarding.ONBOARDING_STATE_SCHEMA,
                "profile": "tms",
                "dataRoot": str(data_root.resolve()),
                "projectRoot": str(original.resolve()),
                "steps": {
                    name: {"status": "completed"}
                    for name in ("datasourceConfigured", "datasourceVerified", "schemaDiscovered", "semanticPublished")
                },
            }
            adopted = onboarding.bind_completed_workspace(state, data_root.resolve(), secondary.resolve())
            self.assertTrue(adopted)
            self.assertTrue(onboarding.project_root_is_bound(state, secondary.resolve()))
            self.assertFalse(onboarding.bind_completed_workspace(state, data_root.resolve(), secondary.resolve()))

    def test_query_verification_is_scoped_to_the_workspace(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "one"
            second = root / "two"
            state = {
                "workspaceVerifications": [{
                    "projectRoot": str(first.resolve()),
                    "queryModel": "OrderQuery",
                    "queryPayloadDigest": "abc",
                    "rowCount": 3,
                }]
            }
            self.assertIsNotNone(onboarding.workspace_query_verification(state, first, "OrderQuery", "abc"))
            self.assertIsNone(onboarding.workspace_query_verification(state, second, "OrderQuery", "abc"))


if __name__ == "__main__":
    unittest.main()
