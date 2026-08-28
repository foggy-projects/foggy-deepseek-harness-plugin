#!/usr/bin/env python3
"""Deterministic installer and local Runtime lifecycle for Foggy DSH onboarding."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import venv
import zipfile


STATE_SCHEMA = "foggy-deepseek-onboarding-install/v1"
RUNTIME_STATE_SCHEMA = "foggy-deepseek-onboarding-runtime/v1"
ONBOARDING_STATE_SCHEMA = "foggy-deepseek-onboarding-state/v1"
CONNECTION_SCHEMA = "foggy-deepseek-connection/v1"
SEMANTIC_PLAN_SCHEMA = "foggy-deepseek-semantic-plan/v1"
PROFILE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,62}$")
ENV_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
OPAQUE_PROFILE_PATTERN = re.compile(r"^fop_[a-f0-9]{32}$")
OPAQUE_REVISION_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
MODEL_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")


class OnboardingError(RuntimeError):
    pass


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def emit(payload: dict, exit_code: int = 0) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    raise SystemExit(exit_code)


def skill_root() -> Path:
    return Path(__file__).resolve().parent.parent


def versions_path() -> Path:
    return skill_root() / "assets" / "versions.json"


def load_versions() -> dict:
    data = json.loads(versions_path().read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "foggy-deepseek-onboarding-versions/v1":
        raise OnboardingError("Unexpected versions.json schema")
    return data


def default_install_root() -> Path:
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA")
        if not base:
            raise OnboardingError("LOCALAPPDATA is not set")
        return Path(base) / "Foggy" / "DeepSeekHarness"
    base = os.environ.get("XDG_DATA_HOME")
    return Path(base) / "foggy" / "deepseek-harness" if base else Path.home() / ".local" / "share" / "foggy" / "deepseek-harness"


def default_data_root() -> Path:
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA")
        if not base:
            raise OnboardingError("LOCALAPPDATA is not set")
        return Path(base) / "Foggy" / "DeepSeekHarnessData"
    base = os.environ.get("XDG_STATE_HOME")
    return Path(base) / "foggy" / "deepseek-harness" if base else Path.home() / ".local" / "state" / "foggy" / "deepseek-harness"


def normalized(path: str | Path) -> Path:
    return Path(path).expanduser().resolve(strict=False)


def is_child(path: Path, parent: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(parent.resolve(strict=False))
        return True
    except ValueError:
        return False


def assert_managed_root(path: Path, label: str) -> None:
    resolved = path.resolve(strict=False)
    anchor = Path(resolved.anchor).resolve(strict=False)
    if resolved in {Path.home().resolve(strict=False), anchor}:
        raise OnboardingError(f"{label} cannot be a home or filesystem root: {resolved}")
    if path.exists() and path.is_symlink():
        raise OnboardingError(f"{label} cannot be a symlink: {path}")


def version_tuple(text: str) -> tuple[int, ...]:
    match = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", text)
    if not match:
        return ()
    return tuple(int(item or 0) for item in match.groups())


def command_result(command: list[str], timeout: int = 30, check: bool = False) -> dict:
    started = time.monotonic()
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
        payload = {
            "command": command[0],
            "available": True,
            "exitCode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "durationMs": round((time.monotonic() - started) * 1000),
        }
    except FileNotFoundError:
        payload = {
            "command": command[0],
            "available": False,
            "exitCode": None,
            "stdout": "",
            "stderr": "command not found",
            "durationMs": round((time.monotonic() - started) * 1000),
        }
    except subprocess.TimeoutExpired:
        payload = {
            "command": command[0],
            "available": True,
            "exitCode": None,
            "stdout": "",
            "stderr": f"timed out after {timeout} seconds",
            "durationMs": round((time.monotonic() - started) * 1000),
        }
    if check and (not payload["available"] or payload["exitCode"] != 0):
        raise OnboardingError(f"Command failed: {command[0]}: {payload['stderr'] or payload['stdout']}")
    return payload


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_asset(path: Path, expected: str) -> None:
    actual = sha256(path)
    if actual.lower() != expected.lower():
        raise OnboardingError(f"SHA256 mismatch for {path.name}: expected={expected} actual={actual}")


def cached_asset(name: str, expected: str, cache_dirs: list[Path]) -> Path | None:
    for cache_dir in cache_dirs:
        direct = cache_dir / name
        candidates = [direct] if direct.is_file() else []
        if not candidates and cache_dir.is_dir():
            candidates = list(cache_dir.rglob(name))
        for candidate in candidates:
            try:
                verify_asset(candidate, expected)
                return candidate
            except OnboardingError:
                continue
    return None


def materialize(asset: dict, destination: Path, cache_dirs: list[Path]) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file():
        verify_asset(destination, asset["sha256"])
        return {"file": asset["file"], "path": str(destination), "source": "existing", "sha256": asset["sha256"]}
    cached = cached_asset(asset["file"], asset["sha256"], cache_dirs)
    if cached:
        shutil.copy2(cached, destination)
        source = "cache"
    else:
        temporary = destination.with_name(destination.name + ".download")
        if temporary.exists():
            temporary.unlink()
        try:
            urllib.request.urlretrieve(asset["url"], temporary)
            verify_asset(temporary, asset["sha256"])
            os.replace(temporary, destination)
        finally:
            if temporary.exists():
                temporary.unlink()
        source = "network"
    verify_asset(destination, asset["sha256"])
    return {"file": asset["file"], "path": str(destination), "source": source, "sha256": asset["sha256"]}


def venv_python(install_root: Path) -> Path:
    return install_root / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def venv_cli(install_root: Path) -> Path:
    return install_root / "venv" / ("Scripts/foggy-runtime.exe" if os.name == "nt" else "bin/foggy-runtime")


def atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, path)


def read_json_object(path: Path, label: str) -> dict:
    if not path.is_file():
        raise OnboardingError(f"{label} not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise OnboardingError(f"{label} is not valid JSON: {path}") from exc
    if not isinstance(payload, dict):
        raise OnboardingError(f"{label} must contain one JSON object: {path}")
    return payload


def safe_profile(value: str) -> str:
    if not PROFILE_PATTERN.fullmatch(value):
        raise OnboardingError("Profile must match ^[a-z0-9][a-z0-9._-]{0,62}$")
    return value


def onboarding_state_path(data_root: Path, profile: str) -> Path:
    return data_root / "onboarding" / "profiles" / f"{safe_profile(profile)}.json"


def read_onboarding_state(data_root: Path, profile: str, required: bool = True) -> dict | None:
    path = onboarding_state_path(data_root, profile)
    if not path.is_file():
        if required:
            raise OnboardingError(f"Onboarding profile not found: {path}")
        return None
    state = read_json_object(path, "Onboarding state")
    if state.get("schemaVersion") != ONBOARDING_STATE_SCHEMA:
        raise OnboardingError("Unexpected onboarding state schema")
    if state.get("profile") != profile:
        raise OnboardingError("Onboarding profile does not match its state file")
    if normalized(state.get("dataRoot", "")) != data_root:
        raise OnboardingError("Onboarding state data root does not match the requested data root")
    return state


def write_onboarding_state(data_root: Path, state: dict) -> Path:
    state["updatedAt"] = now_utc()
    path = onboarding_state_path(data_root, state["profile"])
    atomic_json(path, state)
    if os.name != "nt":
        path.parent.chmod(0o700)
        path.chmod(0o600)
    return path


def step(status: str = "pending", **values: object) -> dict:
    return {"status": status, **values}


def mark_step(state: dict, name: str, status: str, **values: object) -> None:
    state.setdefault("steps", {})[name] = step(status, at=now_utc(), **values)


def validate_connection(payload: dict) -> dict:
    if payload.get("schemaVersion") != CONNECTION_SCHEMA:
        raise OnboardingError(f"connection schemaVersion must be {CONNECTION_SCHEMA}")
    allowed = {
        "schemaVersion", "name", "type", "jdbcUrl", "username", "passwordEnv",
        "opaqueProfileId", "opaqueRevision",
        "profile", "namespace", "schemas", "modelsDir", "evidenceDir", "readOnlyRecommended",
    }
    unexpected = sorted(set(payload) - allowed)
    if unexpected:
        raise OnboardingError(f"Unsupported connection fields: {', '.join(unexpected)}")
    opaque = payload.get("opaqueProfileId") is not None
    required = ("name", "type", "namespace") if opaque else ("name", "type", "jdbcUrl", "namespace")
    for name in required:
        if not isinstance(payload.get(name), str) or not payload[name].strip():
            raise OnboardingError(f"connection.{name} must be a non-empty string")
    password_env = payload.get("passwordEnv")
    jdbc_url = None
    if opaque:
        if not isinstance(payload.get("opaqueProfileId"), str) or not OPAQUE_PROFILE_PATTERN.fullmatch(payload["opaqueProfileId"]):
            raise OnboardingError("connection.opaqueProfileId must be an opaque Foggy profile ID")
        if not isinstance(payload.get("opaqueRevision"), str) or not OPAQUE_REVISION_PATTERN.fullmatch(payload["opaqueRevision"]):
            raise OnboardingError("connection.opaqueRevision must be a sha256 revision")
        exposed = sorted(name for name in ("jdbcUrl", "username", "passwordEnv") if name in payload)
        if exposed:
            raise OnboardingError(f"Opaque connection plans must not contain: {', '.join(exposed)}")
    else:
        if password_env is not None and (not isinstance(password_env, str) or not ENV_NAME_PATTERN.fullmatch(password_env)):
            raise OnboardingError("connection.passwordEnv must be an environment variable name")
        jdbc_url = payload["jdbcUrl"].strip()
        if re.search(r"(?i)(?:password|passwd|pwd)\s*=", jdbc_url) or re.search(r"//[^/@:]+:[^/@]+@", jdbc_url):
            raise OnboardingError("Do not embed passwords in jdbcUrl; use passwordEnv")
    schemas = payload.get("schemas", [])
    if not isinstance(schemas, list) or any(not isinstance(item, str) or not item.strip() for item in schemas):
        raise OnboardingError("connection.schemas must be an array of non-empty strings")
    if payload.get("username") is not None and not isinstance(payload["username"], str):
        raise OnboardingError("connection.username must be a string")
    if not isinstance(payload.get("modelsDir", "models"), str) or not payload.get("modelsDir", "models").strip():
        raise OnboardingError("connection.modelsDir must be a non-empty string")
    if payload.get("profile") is not None:
        safe_profile(payload["profile"])
    if payload.get("evidenceDir") is not None and (not isinstance(payload["evidenceDir"], str) or not payload["evidenceDir"].strip()):
        raise OnboardingError("connection.evidenceDir must be a non-empty string")
    result = {
        "schemaVersion": CONNECTION_SCHEMA,
        "connectionMode": "opaque-profile" if opaque else "legacy-inline",
        "name": payload["name"].strip(),
        "type": payload["type"].strip().lower(),
        "namespace": payload["namespace"].strip(),
        "schemas": [item.strip() for item in schemas],
        "modelsDir": payload.get("modelsDir", "models"),
        "readOnlyRecommended": payload.get("readOnlyRecommended", True),
    }
    if opaque:
        result["opaqueProfileId"] = payload["opaqueProfileId"]
        result["opaqueRevision"] = payload["opaqueRevision"]
    else:
        result["jdbcUrl"] = jdbc_url
        result["username"] = payload.get("username")
        result["passwordEnv"] = password_env
    if payload.get("profile") is not None:
        result["profile"] = safe_profile(payload["profile"])
    if payload.get("evidenceDir") is not None:
        result["evidenceDir"] = payload["evidenceDir"].strip()
    if result["type"] not in {"sqlite", "mysql", "postgres", "postgresql"}:
        raise OnboardingError("Initial onboarding supports sqlite, mysql, postgres, and postgresql")
    if not opaque and result["type"] != "sqlite" and not result["passwordEnv"]:
        raise OnboardingError("Non-SQLite connections require passwordEnv")
    return result


def validate_semantic_plan(payload: dict) -> dict:
    if payload.get("schemaVersion") != SEMANTIC_PLAN_SCHEMA:
        raise OnboardingError(f"semantic plan schemaVersion must be {SEMANTIC_PLAN_SCHEMA}")
    allowed = {"schemaVersion", "profile", "draftDir", "bundleName", "evidenceDir", "queryModels"}
    unexpected = sorted(set(payload) - allowed)
    if unexpected:
        raise OnboardingError(f"Unsupported semantic plan fields: {', '.join(unexpected)}")
    for name in ("draftDir", "bundleName"):
        if not isinstance(payload.get(name), str) or not payload[name].strip():
            raise OnboardingError(f"semanticPlan.{name} must be a non-empty string")
    query_models = payload.get("queryModels")
    if not isinstance(query_models, list) or not query_models:
        raise OnboardingError("semanticPlan.queryModels must be a non-empty array")
    if any(not isinstance(item, str) or not MODEL_NAME_PATTERN.fullmatch(item) for item in query_models):
        raise OnboardingError("Every query model must be a stable identifier")
    if len(set(query_models)) != len(query_models):
        raise OnboardingError("semanticPlan.queryModels must not contain duplicates")
    result = {
        "schemaVersion": SEMANTIC_PLAN_SCHEMA,
        "draftDir": payload["draftDir"].strip(),
        "bundleName": payload["bundleName"].strip(),
        "queryModels": query_models,
    }
    if payload.get("profile") is not None:
        result["profile"] = safe_profile(payload["profile"])
    if payload.get("evidenceDir") is not None:
        if not isinstance(payload["evidenceDir"], str) or not payload["evidenceDir"].strip():
            raise OnboardingError("semanticPlan.evidenceDir must be a non-empty string")
        result["evidenceDir"] = payload["evidenceDir"].strip()
    return result


def semantic_files(root: Path) -> list[Path]:
    if not root.is_dir():
        raise OnboardingError(f"Semantic directory not found: {root}")
    if root.is_symlink():
        raise OnboardingError(f"Semantic directory cannot be a symlink: {root}")
    files = sorted(
        (item for item in root.rglob("*") if item.is_file() and item.suffix.lower() in {".tm", ".qm"}),
        key=lambda item: item.relative_to(root).as_posix(),
    )
    if len(files) > 500:
        raise OnboardingError("Semantic directory contains more than 500 TM/QM files; narrow the draft scope")
    for item in files:
        if item.is_symlink() or not is_child(item.resolve(strict=False), root.resolve(strict=False)):
            raise OnboardingError(f"Semantic file must stay inside the non-symlink draft directory: {item}")
    return files


def semantic_manifest(root: Path, require_pair: bool = True) -> dict:
    files = semantic_files(root)
    tm_count = sum(item.suffix.lower() == ".tm" for item in files)
    qm_count = sum(item.suffix.lower() == ".qm" for item in files)
    if require_pair and (tm_count == 0 or qm_count == 0):
        raise OnboardingError("Semantic draft must contain at least one .tm and one .qm file")
    entries = []
    secret_assignment = re.compile(r"(?i)(?:jdbc:|password\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=])")
    for item in files:
        try:
            content = item.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError as exc:
            raise OnboardingError(f"Semantic file must be valid UTF-8: {item.name}") from exc
        if secret_assignment.search(content):
            raise OnboardingError(f"Semantic file appears to contain a connection or secret assignment: {item.name}")
        entries.append({
            "path": item.relative_to(root).as_posix(),
            "sha256": sha256(item),
            "size": item.stat().st_size,
            "type": item.suffix.lower()[1:],
        })
    digest = hashlib.sha256(json.dumps(entries, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return {"root": str(root), "digest": digest, "tmCount": tm_count, "qmCount": qm_count, "files": entries}


def require_unchanged_semantic_draft(state: dict) -> tuple[Path, dict]:
    semantic = state.get("semantic", {})
    draft_dir = normalized(semantic.get("draftDir", ""))
    expected = semantic.get("draftManifest")
    if not isinstance(expected, dict):
        raise OnboardingError("Semantic draft is not registered; run semantic-draft first")
    current = semantic_manifest(draft_dir)
    if current["digest"] != expected.get("digest"):
        raise OnboardingError("Semantic draft changed after registration; rerun semantic-draft and validate again")
    return draft_dir, current


def semantic_diff(draft_manifest: dict, models_dir: Path, prune: bool) -> dict:
    source = {item["path"]: item for item in draft_manifest["files"]}
    target_manifest = semantic_manifest(models_dir, require_pair=False) if models_dir.is_dir() else {"files": []}
    target = {item["path"]: item for item in target_manifest["files"]}
    added = sorted(path for path in source if path not in target)
    updated = sorted(path for path in source if path in target and source[path]["sha256"] != target[path]["sha256"])
    unchanged = sorted(path for path in source if path in target and source[path]["sha256"] == target[path]["sha256"])
    target_only = sorted(path for path in target if path not in source)
    return {
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "removed": target_only if prune else [],
        "preserved": [] if prune else target_only,
        "prune": prune,
    }


def copy_file_atomic(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.is_symlink():
        raise OnboardingError(f"Refusing to overwrite symlink: {destination}")
    temporary = destination.with_name(destination.name + ".foggy-onboarding.tmp")
    shutil.copy2(source, temporary)
    os.replace(temporary, destination)


def publish_files(draft_dir: Path, models_dir: Path, diff: dict, backup_root: Path) -> dict:
    backup_dir = backup_root / dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_dir.mkdir(parents=True, exist_ok=False)
    changed_existing = diff["updated"] + diff["removed"]
    for relative in changed_existing:
        source = models_dir / Path(relative)
        copy_file_atomic(source, backup_dir / Path(relative))
    manifest = {
        "schemaVersion": "foggy-deepseek-semantic-backup/v1",
        "createdAt": now_utc(),
        "modelsDir": str(models_dir),
        "added": diff["added"],
        "backedUp": changed_existing,
    }
    atomic_json(backup_dir / "backup-manifest.json", manifest)
    backup = {"backupDir": str(backup_dir), **manifest}
    try:
        for relative in diff["added"] + diff["updated"]:
            copy_file_atomic(draft_dir / Path(relative), models_dir / Path(relative))
        for relative in diff["removed"]:
            target = models_dir / Path(relative)
            if target.is_symlink() or not is_child(target, models_dir):
                raise OnboardingError(f"Refusing to remove unsafe semantic target: {target}")
            target.unlink()
    except Exception:
        rollback_published_files(backup)
        raise
    return backup


def rollback_published_files(backup: dict) -> None:
    models_dir = normalized(backup["modelsDir"])
    backup_dir = normalized(backup["backupDir"])
    for relative in backup["added"]:
        target = models_dir / Path(relative)
        if target.is_file() and not target.is_symlink() and is_child(target, models_dir):
            target.unlink()
    for relative in backup["backedUp"]:
        copy_file_atomic(backup_dir / Path(relative), models_dir / Path(relative))


def safe_extract(zip_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            name = PurePosixPath(member.filename)
            if name.is_absolute() or ".." in name.parts:
                raise OnboardingError(f"Unsafe zip member: {member.filename}")
        archive.extractall(destination)


def install_analysis_skill(zip_path: Path, project_root: Path, version: str, expected_hash: str, replace: bool) -> dict:
    skills_root = project_root / ".agents" / "skills"
    destination = skills_root / "foggy-ai-analysis"
    marker = destination / ".foggy-onboarding-install.json"
    if destination.exists():
        if marker.is_file():
            installed = json.loads(marker.read_text(encoding="utf-8"))
            if installed.get("archiveSha256") == expected_hash:
                return {"path": str(destination), "version": version, "action": "kept-matching"}
        if not replace:
            raise OnboardingError(f"Analysis Skill already exists and is not managed at {destination}; rerun with --replace-skill to back it up")
        backup_root = project_root / ".foggy" / "onboarding-backups"
        backup_root.mkdir(parents=True, exist_ok=True)
        backup = backup_root / f"foggy-ai-analysis-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
        shutil.move(str(destination), str(backup))
    skills_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="foggy-skill-") as temporary:
        extract_root = Path(temporary)
        safe_extract(zip_path, extract_root)
        candidates = list(extract_root.rglob("SKILL.md"))
        if len(candidates) != 1:
            raise OnboardingError(f"Expected exactly one SKILL.md in analysis Skill archive, found {len(candidates)}")
        source = candidates[0].parent
        shutil.copytree(source, destination)
    atomic_json(marker, {"schemaVersion": "foggy-installed-skill/v1", "version": version, "archiveSha256": expected_hash})
    return {"path": str(destination), "version": version, "action": "installed"}


def install_onboarding_skill(project_root: Path) -> dict:
    destination = project_root / ".agents" / "skills" / "foggy-deepseek-onboarding"
    source = skill_root()
    if source.resolve() == destination.resolve(strict=False):
        return {"path": str(destination), "action": "already-running-from-target"}
    if destination.exists():
        return {"path": str(destination), "action": "kept-existing"}
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination)
    return {"path": str(destination), "action": "installed"}


def read_install_state(install_root: Path, required: bool = True) -> dict | None:
    path = install_root / "install-state.json"
    if not path.is_file():
        if required:
            raise OnboardingError(f"Install state not found: {path}")
        return None
    state = json.loads(path.read_text(encoding="utf-8"))
    if state.get("schemaVersion") != STATE_SCHEMA:
        raise OnboardingError("Unexpected install state schema")
    if normalized(state.get("installRoot", "")) != install_root:
        raise OnboardingError("Install state root does not match requested install root")
    return state


def java_probe() -> dict:
    result = command_result([os.environ.get("JAVA_EXE", "java"), "-version"])
    combined = "\n".join(part for part in (result["stderr"], result["stdout"]) if part)
    result["version"] = ".".join(str(item) for item in version_tuple(combined)) if version_tuple(combined) else None
    return result


def install_command(args: argparse.Namespace) -> dict:
    versions = load_versions()
    install_root = normalized(args.install_root or default_install_root())
    data_root = normalized(args.data_root or default_data_root())
    project_root = normalized(args.project_root or Path.cwd())
    cache_dirs = [normalized(item) for item in args.asset_cache_dir]
    components = versions["components"]
    assert_managed_root(install_root, "Install root")
    assert_managed_root(data_root, "Data root")
    if install_root == data_root:
        raise OnboardingError("Install root and data root must be different")
    plan = {
        "schemaVersion": "foggy-deepseek-onboarding-plan/v1",
        "installRoot": str(install_root),
        "dataRoot": str(data_root),
        "projectRoot": str(project_root),
        "versions": {name: value.get("version") for name, value in components.items()},
        "operations": ["install isolated CLI", "verify Launcher assets", "install project Skills", "write install state"],
        "productionReady": False,
    }
    if args.dry_run:
        return {"success": True, "dryRun": True, "plan": plan}
    if sys.version_info < (3, 11):
        raise OnboardingError(f"Python 3.11+ required, got {sys.version.split()[0]}")
    if not project_root.is_dir():
        raise OnboardingError(f"Project root not found: {project_root}")
    install_root.mkdir(parents=True, exist_ok=True)
    data_root.mkdir(parents=True, exist_ok=True)
    downloads = install_root / "downloads"
    verified: list[dict] = []

    cli_component = components["cli"]
    for role in ("wheel", "checksums"):
        asset = cli_component[role]
        verified.append(materialize(asset, downloads / "cli" / asset["file"], cache_dirs))
    checksum_lines = (downloads / "cli" / cli_component["checksums"]["file"]).read_text(encoding="utf-8").splitlines()
    checksum_entries = {line.split(maxsplit=1)[1].strip(): line.split(maxsplit=1)[0].lower() for line in checksum_lines if len(line.split(maxsplit=1)) == 2}
    wheel_asset = cli_component["wheel"]
    if checksum_entries.get(wheel_asset["file"]) != wheel_asset["sha256"]:
        raise OnboardingError("Pinned CLI SHA256SUMS does not match the pinned wheel hash")
    if args.skip_cli_install:
        cli_command = normalized(args.cli_command or shutil.which("foggy-runtime") or "")
        if not cli_command.is_file():
            raise OnboardingError("--skip-cli-install requires --cli-command or foggy-runtime on PATH")
        cli_mode = "external"
    else:
        python_path = venv_python(install_root)
        if not python_path.is_file():
            venv.EnvBuilder(with_pip=True).create(install_root / "venv")
        wheel = downloads / "cli" / cli_component["wheel"]["file"]
        command_result(
            [
                str(python_path), "-m", "pip", "install", "--upgrade",
                "--no-deps", "--disable-pip-version-check", str(wheel),
            ],
            timeout=300,
            check=True,
        )
        cli_command = venv_cli(install_root)
        cli_mode = "managed-venv"
    cli_version = command_result([str(cli_command), "--version"], check=True)
    actual_cli_version = version_tuple(cli_version["stdout"])[:3]
    pinned_cli_version = version_tuple(cli_component["version"])[:3]
    version_matches = actual_cli_version >= pinned_cli_version if cli_mode == "external" else actual_cli_version == pinned_cli_version
    if not version_matches:
        raise OnboardingError(f"Unexpected CLI version: {cli_version['stdout']}")

    launcher_dir = install_root / "launcher"
    for asset in components["launcher"]["assets"]:
        verified.append(materialize(asset, launcher_dir / asset["file"], cache_dirs))
    if os.name != "nt":
        (launcher_dir / "start-foggy-runtime.sh").chmod(0o755)

    analysis_assets = components["analysisSkill"]["assets"]
    for asset in analysis_assets:
        verified.append(materialize(asset, downloads / "skill" / asset["file"], cache_dirs))
    zip_asset = next(item for item in analysis_assets if item["role"] == "zip")
    analysis_skill = install_analysis_skill(
        downloads / "skill" / zip_asset["file"], project_root, components["analysisSkill"]["version"], zip_asset["sha256"], args.replace_skill
    )
    onboarding_skill = install_onboarding_skill(project_root)
    state = {
        "schemaVersion": STATE_SCHEMA,
        "installedAt": now_utc(),
        "packageVersion": versions["packageVersion"],
        "installRoot": str(install_root),
        "dataRoot": str(data_root),
        "projectRoot": str(project_root),
        "cli": {"version": cli_component["version"], "command": str(cli_command), "mode": cli_mode},
        "launcher": {"version": components["launcher"]["version"], "path": str(launcher_dir)},
        "skills": {"onboarding": onboarding_skill, "analysis": analysis_skill},
        "verifiedAssets": verified,
        "securityMode": versions["defaults"]["securityMode"],
        "productionReady": False,
    }
    atomic_json(install_root / "install-state.json", state)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-onboarding-install-result/v1",
        "statePath": str(install_root / "install-state.json"),
        "installRoot": str(install_root),
        "dataRoot": str(data_root),
        "projectRoot": str(project_root),
        "cliVersion": cli_component["version"],
        "launcherVersion": components["launcher"]["version"],
        "analysisSkill": analysis_skill,
        "onboardingSkill": onboarding_skill,
        "java": java_probe(),
        "next": "run doctor, then runtime-start",
        "productionReady": False,
    }


def process_info(pid: int) -> dict:
    if pid <= 0:
        return {"running": False, "commandLine": ""}
    if os.name == "nt":
        script = f"$p=Get-CimInstance Win32_Process -Filter \"ProcessId = {pid}\" -ErrorAction SilentlyContinue; if($p){{$p.CommandLine}}"
        result = command_result(["powershell", "-NoProfile", "-Command", script], timeout=15)
        if result["exitCode"] != 0:
            fallback_script = f"$p=Get-Process -Id {pid} -ErrorAction SilentlyContinue; if($p){{$p.Id}}"
            fallback = command_result(["powershell", "-NoProfile", "-Command", fallback_script], timeout=15)
            return {
                "running": fallback["exitCode"] == 0 and fallback["stdout"].strip() == str(pid),
                "commandLine": "",
                "inspectionError": "Windows process command line inspection failed",
            }
        command_line = result["stdout"]
        return {"running": bool(command_line), "commandLine": command_line}
    proc = Path("/proc") / str(pid) / "cmdline"
    if not proc.is_file():
        return {"running": False, "commandLine": ""}
    try:
        command_line = proc.read_bytes().replace(b"\0", b" ").decode("utf-8", errors="replace").strip()
    except OSError:
        command_line = ""
    return {"running": bool(command_line), "commandLine": command_line}


def stop_recorded_runtime(data_root: Path, force: bool = False) -> dict:
    state_path = data_root / "runtime-state.json"
    if not state_path.is_file():
        return {"success": True, "action": "already-stopped", "statePath": str(state_path)}
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("schemaVersion") != RUNTIME_STATE_SCHEMA:
        raise OnboardingError("Unexpected Runtime state schema")
    pid = int(state["pid"])
    expected_jar = state["launcherJar"]
    info = process_info(pid)
    if not info["running"]:
        state_path.unlink()
        return {"success": True, "action": "stale-state-removed", "pid": pid}
    if Path(expected_jar).name not in info["commandLine"]:
        raise OnboardingError(f"Refusing to stop PID {pid}: command line does not contain expected Launcher jar")
    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and process_info(pid)["running"]:
        time.sleep(0.25)
    if process_info(pid)["running"] and force:
        if os.name == "nt":
            command_result(["taskkill", "/PID", str(pid), "/T", "/F"], timeout=20, check=True)
        else:
            os.kill(pid, signal.SIGKILL)
    if process_info(pid)["running"]:
        raise OnboardingError(f"Runtime PID {pid} did not stop; rerun with --force")
    state_path.unlink()
    return {"success": True, "action": "stopped", "pid": pid, "statePath": str(state_path)}


def parse_json_output(result: dict, label: str) -> dict:
    if result["exitCode"] != 0:
        try:
            failed = json.loads(result["stdout"])
        except (json.JSONDecodeError, TypeError):
            failed = None
        error = failed.get("error") if isinstance(failed, dict) else None
        if isinstance(error, dict):
            parts = [str(error.get(name)) for name in ("code", "phase", "message") if error.get(name)]
            detail = " | ".join(parts)
        else:
            detail = None
        raise OnboardingError(f"{label} failed with exit code {result['exitCode']}" + (f": {detail}" if detail else ""))
    try:
        return json.loads(result["stdout"])
    except json.JSONDecodeError as exc:
        raise OnboardingError(f"{label} did not return JSON") from exc


def runtime_start_command(args: argparse.Namespace) -> dict:
    versions = load_versions()
    install_root = normalized(args.install_root or default_install_root())
    state = read_install_state(install_root)
    data_root = normalized(args.data_root or state["dataRoot"])
    existing = data_root / "runtime-state.json"
    if existing.is_file():
        prior = json.loads(existing.read_text(encoding="utf-8"))
        if process_info(int(prior.get("pid", 0)))["running"]:
            raise OnboardingError(f"Recorded Runtime is already running with PID {prior['pid']}")
        existing.unlink()
    port = args.port or int(versions["defaults"]["port"])
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError as exc:
            raise OnboardingError(f"Port {port} is not available") from exc
    work_dir = data_root / "runtime"
    work_dir.mkdir(parents=True, exist_ok=True)
    launcher_dir = normalized(state["launcher"]["path"])
    java_exe = args.java or os.environ.get("JAVA_EXE", "java")
    if os.name == "nt":
        shell = shutil.which("pwsh") or shutil.which("powershell")
        if not shell:
            raise OnboardingError("PowerShell is required to start the Windows Launcher")
        command = [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(launcher_dir / "start-foggy-runtime.ps1"), "-Port", str(port), "-WorkDir", str(work_dir), "-JavaExe", java_exe]
        # Do not use PIPE here. A long-lived process spawned by Windows PowerShell can inherit the
        # capture handles and keep subprocess.run waiting for EOF after the launcher script exits.
        launcher_stdout = work_dir / "launcher-command.stdout.json"
        launcher_stderr = work_dir / "launcher-command.stderr.log"
        started = time.monotonic()
        with launcher_stdout.open("w", encoding="utf-8") as stdout_stream, launcher_stderr.open("w", encoding="utf-8") as stderr_stream:
            process = subprocess.run(command, stdout=stdout_stream, stderr=stderr_stream, stdin=subprocess.DEVNULL, timeout=60, check=False)
        launch_result = {
            "command": shell,
            "available": True,
            "exitCode": process.returncode,
            "stdout": launcher_stdout.read_text(encoding="utf-8", errors="replace").strip(),
            "stderr": launcher_stderr.read_text(encoding="utf-8", errors="replace").strip(),
            "durationMs": round((time.monotonic() - started) * 1000),
        }
        if process.returncode != 0:
            raise OnboardingError(f"Launcher failed: {launch_result['stderr'] or launch_result['stdout']}")
    else:
        environment = os.environ.copy()
        environment.update({"PORT": str(port), "WORK_DIR": str(work_dir), "JAVA_EXE": java_exe})
        started = time.monotonic()
        process = subprocess.run(
            ["bash", str(launcher_dir / "start-foggy-runtime.sh")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            env=environment,
            check=False,
        )
        launch_result = {"command": "bash", "available": True, "exitCode": process.returncode, "stdout": process.stdout.strip(), "stderr": process.stderr.strip(), "durationMs": round((time.monotonic() - started) * 1000)}
        if process.returncode != 0:
            raise OnboardingError(f"Launcher failed: {process.stderr or process.stdout}")
    launch = parse_json_output(launch_result, "Launcher")
    pid = int(launch["pid"])
    cli = state["cli"]["command"]
    namespace = args.namespace or versions["defaults"]["namespace"]
    base_url = launch["runtimeUrl"]
    evidence_dir = data_root / "evidence" / f"runtime-start-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    atomic_json(evidence_dir / "launch.json", launch)
    try:
        wait_result = command_result([cli, "--base-url", base_url, "--namespace", namespace, "--output", "json", "wait-ready", "--timeout-seconds", str(args.timeout or versions["defaults"]["readinessTimeoutSeconds"]), "--interval-seconds", "1"], timeout=(args.timeout or versions["defaults"]["readinessTimeoutSeconds"]) + 30)
        wait_payload = parse_json_output(wait_result, "wait-ready")
        if wait_payload.get("success") is not True:
            raise OnboardingError("wait-ready returned success=false")
        atomic_json(evidence_dir / "wait-ready.json", wait_payload)
        capabilities_result = command_result([cli, "--base-url", base_url, "--namespace", namespace, "--output", "json", "capabilities"], timeout=30)
        capabilities = parse_json_output(capabilities_result, "capabilities")
        expected_contract = versions["components"]["launcher"]["runtimeApiContract"]
        if capabilities.get("success") is not True or capabilities.get("runtimeApiVersion") != expected_contract:
            raise OnboardingError(f"Unexpected Runtime API contract; expected {expected_contract}")
        if capabilities.get("data", {}).get("securityMode") != versions["defaults"]["securityMode"]:
            raise OnboardingError("Packaged Launcher did not report the expected dev/test security mode")
        atomic_json(evidence_dir / "capabilities.json", capabilities)
    except Exception:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        raise
    runtime_state = {
        "schemaVersion": RUNTIME_STATE_SCHEMA,
        "startedAt": now_utc(),
        "pid": pid,
        "runtimeUrl": base_url,
        "port": port,
        "namespace": namespace,
        "workDir": str(work_dir),
        "launcherJar": str(launcher_dir / f"foggy-runtime-launcher-{state['launcher']['version']}.jar"),
        "evidenceDir": str(evidence_dir),
        "identity": {
            "engine": capabilities.get("engine"),
            "runtimeApiVersion": capabilities.get("runtimeApiVersion"),
            "schemaVersion": capabilities.get("data", {}).get("schemaVersion"),
            "securityMode": capabilities.get("data", {}).get("securityMode"),
        },
    }
    atomic_json(data_root / "runtime-state.json", runtime_state)
    return {"success": True, **runtime_state, "productionReady": False}


def onboarding_context(args: argparse.Namespace, require_runtime: bool = False) -> tuple[Path, dict, Path, dict | None]:
    install_root = normalized(args.install_root or default_install_root())
    install_state = read_install_state(install_root)
    data_root = normalized(args.data_root or install_state["dataRoot"])
    assert_managed_root(data_root, "Data root")
    runtime_state_path = data_root / "runtime-state.json"
    runtime_state = read_json_object(runtime_state_path, "Runtime state") if runtime_state_path.is_file() else None
    if runtime_state and runtime_state.get("schemaVersion") != RUNTIME_STATE_SCHEMA:
        raise OnboardingError("Unexpected Runtime state schema")
    if require_runtime:
        if not runtime_state:
            raise OnboardingError("Runtime is not started; run runtime-start first")
        if not process_info(int(runtime_state.get("pid", 0)))["running"]:
            raise OnboardingError("Runtime state is stale; restart Runtime before continuing")
    return install_root, install_state, data_root, runtime_state


def cli_json(install_state: dict, runtime_state: dict, namespace: str, command: list[str], label: str, timeout: int = 60) -> dict:
    invocation = [
        install_state["cli"]["command"],
        "--base-url", runtime_state["runtimeUrl"],
        "--namespace", namespace,
        "--output", "json",
        *command,
    ]
    payload = parse_json_output(command_result(invocation, timeout=timeout), label)
    if payload.get("success") is not True:
        error = payload.get("error")
        if isinstance(error, dict):
            detail = error.get("message") or error.get("code")
        else:
            detail = error
        raise OnboardingError(f"{label} returned success=false: {detail or 'unknown Runtime error'}")
    return payload


CONNECTION_SECRET_KEYS = {
    "jdbcurl", "url", "username", "password", "passwordenv", "passwordref",
}


def redact_connection_material(value: Any) -> Any:
    """Remove connection material from Runtime payloads before returning or persisting them."""
    if isinstance(value, dict):
        return {
            key: redact_connection_material(item)
            for key, item in value.items()
            if key.lower() not in CONNECTION_SECRET_KEYS
        }
    if isinstance(value, list):
        return [redact_connection_material(item) for item in value]
    if isinstance(value, str) and "jdbc:" in value.lower():
        return "[REDACTED_CONNECTION_URL]"
    return value


def require_opaque_profile_cli(install_state: dict) -> None:
    probe = command_result([install_state["cli"]["command"], "profiles", "--help"])
    if not probe["available"] or probe["exitCode"] != 0:
        raise OnboardingError(
            "Opaque datasource onboarding requires foggy-runtime-cli 0.1.23+ with the profiles command"
        )


def onboarding_plan_command(args: argparse.Namespace) -> dict:
    install_root, install_state, data_root, runtime_state = onboarding_context(args, require_runtime=False)
    profile = safe_profile(args.profile)
    project_root = normalized(args.project_root or install_state["projectRoot"])
    if not project_root.is_dir():
        raise OnboardingError(f"Project root not found: {project_root}")
    connection_file = normalized(args.connection_file)
    connection = validate_connection(read_json_object(connection_file, "Connection plan"))
    if connection.get("connectionMode") == "opaque-profile":
        require_opaque_profile_cli(install_state)
    existing = read_onboarding_state(data_root, profile, required=False)
    if existing and not args.replace_plan:
        raise OnboardingError(f"Onboarding profile already exists: {profile}; use --replace-plan to replace its non-secret plan")
    models_dir = normalized(project_root / connection["modelsDir"])
    if not is_child(models_dir, project_root):
        raise OnboardingError("modelsDir must stay inside projectRoot")
    if models_dir == project_root:
        raise OnboardingError("modelsDir cannot be the project root")
    state = {
        "schemaVersion": ONBOARDING_STATE_SCHEMA,
        "profile": profile,
        "createdAt": existing.get("createdAt", now_utc()) if existing else now_utc(),
        "updatedAt": now_utc(),
        "installRoot": str(install_root),
        "dataRoot": str(data_root),
        "projectRoot": str(project_root),
        "runtime": {
            "available": runtime_state is not None,
            "runtimeUrl": runtime_state.get("runtimeUrl") if runtime_state else None,
            "namespace": runtime_state.get("namespace") if runtime_state else None,
        },
        "connection": connection,
        "semantic": {"modelsDir": str(models_dir)},
        "steps": {
            "planned": step("completed", at=now_utc()),
            "datasourceConfigured": step("pending"),
            "datasourceVerified": step("pending"),
            "schemaDiscovered": step("pending"),
            "semanticDrafted": step("pending"),
            "semanticValidated": step("pending"),
            "semanticPublished": step("pending"),
            "semanticVerified": step("pending"),
        },
        "artifacts": {},
    }
    path = write_onboarding_state(data_root, state)
    password_env = connection.get("passwordEnv")
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-onboarding-plan-result/v1",
        "profile": profile,
        "statePath": str(path),
        "connection": {**connection, "passwordEnvPresent": bool(password_env and os.environ.get(password_env))},
        "runtimeAvailable": runtime_state is not None,
        "next": "run datasource-configure --apply after reviewing the plan",
        "productionReady": False,
    }


def require_profile(args: argparse.Namespace, require_runtime: bool = False) -> tuple[dict, dict, Path, dict | None]:
    _install_root, install_state, data_root, runtime_state = onboarding_context(args, require_runtime=require_runtime)
    state = read_onboarding_state(data_root, safe_profile(args.profile))
    if normalized(state["installRoot"]) != normalized(install_state["installRoot"]):
        raise OnboardingError("Onboarding profile belongs to a different install root")
    return state, install_state, data_root, runtime_state


def datasource_configure_command(args: argparse.Namespace) -> dict:
    state, install_state, data_root, runtime_state = require_profile(args, require_runtime=args.apply)
    connection = state["connection"]
    opaque = connection.get("connectionMode") == "opaque-profile"
    plan = {
        "operation": "profiles apply" if opaque else "datasources add",
        "name": connection["name"],
        "type": connection["type"],
        "namespace": connection["namespace"],
        "replace": args.replace,
    }
    if opaque:
        plan.update({"profileId": connection["opaqueProfileId"], "revision": connection["opaqueRevision"]})
    else:
        plan.update({
            "jdbcUrl": connection["jdbcUrl"],
            "username": connection.get("username"),
            "passwordEnv": connection.get("passwordEnv"),
        })
    if not args.apply:
        return {"success": True, "dryRun": True, "profile": state["profile"], "plan": plan, "next": "rerun with --apply after approval"}
    if opaque:
        command = [
            "profiles", "apply", connection["opaqueProfileId"],
            "--approve-revision", connection["opaqueRevision"],
            "--approve-configure",
        ]
        label = "opaque profile configure"
    else:
        password_env = connection.get("passwordEnv")
        if password_env and not os.environ.get(password_env):
            raise OnboardingError(f"Required password environment variable is not present: {password_env}")
        command = ["datasources", "add", "--name", connection["name"], "--type", connection["type"], "--jdbc-url", connection["jdbcUrl"]]
        if connection.get("username"):
            command.extend(["--username", connection["username"]])
        if password_env:
            command.extend(["--password-env", password_env])
        label = "datasources add"
    if args.replace:
        command.append("--replace")
    result = redact_connection_material(
        cli_json(install_state, runtime_state, connection["namespace"], command, label)
    )
    mark_step(state, "datasourceConfigured", "completed", replace=args.replace)
    path = write_onboarding_state(data_root, state)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-datasource-configure/v1",
        "profile": state["profile"],
        "statePath": str(path),
        "dataSource": connection["name"],
        "runtime": result,
        "next": "run datasource-verify; add --bind to approve namespace binding",
        "productionReady": False,
    }


def datasource_verify_command(args: argparse.Namespace) -> dict:
    state, install_state, data_root, runtime_state = require_profile(args, require_runtime=True)
    if state["steps"]["datasourceConfigured"]["status"] != "completed":
        raise OnboardingError("Datasource is not configured; run datasource-configure --apply first")
    connection = state["connection"]
    namespace = connection["namespace"]
    tested = redact_connection_material(cli_json(
        install_state, runtime_state, namespace,
        ["datasources", "test", connection["name"]], "datasources test",
    ))
    if not args.bind:
        mark_step(state, "datasourceVerified", "waiting-for-binding", connectionTested=True)
        path = write_onboarding_state(data_root, state)
        return {
            "success": True,
            "schemaVersion": "foggy-deepseek-datasource-verify/v1",
            "profile": state["profile"],
            "connectionTested": True,
            "namespaceBound": False,
            "test": tested,
            "statePath": str(path),
            "next": "rerun datasource-verify --bind after approving namespace binding",
            "productionReady": False,
        }
    if connection.get("connectionMode") == "opaque-profile":
        bind_command = [
            "profiles", "apply", connection["opaqueProfileId"],
            "--approve-revision", connection["opaqueRevision"],
            "--approve-bind",
        ]
        bind_label = "opaque profile bind"
    else:
        bind_command = ["datasources", "bind", "--namespace", namespace, "--data-source", connection["name"]]
        bind_label = "datasources bind"
    bound = redact_connection_material(cli_json(
        install_state, runtime_state, namespace, bind_command, bind_label,
    ))
    binding = redact_connection_material(cli_json(
        install_state, runtime_state, namespace,
        ["datasources", "binding", "--namespace", namespace], "datasources binding",
    ))
    diagnostics = redact_connection_material(cli_json(
        install_state, runtime_state, namespace,
        ["datasources", "diagnostics"], "datasources diagnostics",
    ))
    mark_step(state, "datasourceVerified", "completed", connectionTested=True, namespaceBound=True)
    evidence_dir = data_root / "onboarding" / "evidence" / state["profile"] / f"datasource-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    atomic_json(evidence_dir / "test.json", tested)
    atomic_json(evidence_dir / "bind.json", bound)
    atomic_json(evidence_dir / "binding.json", binding)
    atomic_json(evidence_dir / "diagnostics.json", diagnostics)
    state.setdefault("artifacts", {})["datasourceEvidence"] = str(evidence_dir)
    path = write_onboarding_state(data_root, state)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-datasource-verify/v1",
        "profile": state["profile"],
        "connectionTested": True,
        "namespaceBound": True,
        "test": tested,
        "binding": binding,
        "diagnostics": diagnostics,
        "evidenceDir": str(evidence_dir),
        "statePath": str(path),
        "next": "run schema-discover",
        "productionReady": False,
    }


def listed_tables(payload: dict) -> list[dict]:
    data = payload.get("data")
    tables = data.get("tables") if isinstance(data, dict) else None
    if not isinstance(tables, list) or any(not isinstance(item, dict) for item in tables):
        raise OnboardingError("tables list returned an unexpected data.tables shape")
    return tables


def schema_discover_command(args: argparse.Namespace) -> dict:
    if args.max_tables < 1 or args.max_tables > 500:
        raise OnboardingError("--max-tables must be between 1 and 500")
    state, install_state, data_root, runtime_state = require_profile(args, require_runtime=True)
    if state["steps"]["datasourceVerified"]["status"] != "completed":
        raise OnboardingError("Datasource is not verified and bound; run datasource-verify --bind first")
    connection = state["connection"]
    namespace = connection["namespace"]
    schemas = args.schema or connection.get("schemas") or [None]
    list_results: list[dict] = []
    candidates: list[dict] = []
    for schema in schemas:
        command = ["tables", "list", "--data-source", connection["name"]]
        if schema:
            command.extend(["--schema", schema])
        if args.pattern:
            command.extend(["--pattern", args.pattern])
        if args.no_views:
            command.append("--no-views")
        result = cli_json(install_state, runtime_state, namespace, command, f"tables list ({schema or 'default schema'})")
        list_results.append(result)
        candidates.extend(listed_tables(result))
    unique: dict[tuple[str, str], dict] = {}
    for item in candidates:
        name = item.get("name")
        if isinstance(name, str) and name:
            unique[(str(item.get("schema") or ""), name)] = item
    tables = list(unique.values())
    requested = set(args.table or [])
    if requested:
        selected = [item for item in tables if item["name"] in requested or f"{item.get('schema')}.{item['name']}" in requested]
        matched = {item["name"] for item in selected} | {f"{item.get('schema')}.{item['name']}" for item in selected}
        missing = sorted(name for name in requested if name not in matched)
        if missing:
            raise OnboardingError(f"Requested tables were not returned by discovery: {', '.join(missing)}")
    else:
        selected = tables[:args.max_tables]
    inspections: list[dict] = []
    if not args.list_only:
        for item in selected:
            command = ["tables", "inspect", "--data-source", connection["name"], "--table", item["name"], "--include-foreign-keys"]
            if item.get("schema"):
                command.extend(["--schema", str(item["schema"])])
            if args.include_indexes:
                command.append("--include-indexes")
            inspections.append(cli_json(install_state, runtime_state, namespace, command, f"tables inspect ({item['name']})"))
    artifact = {
        "schemaVersion": "foggy-deepseek-schema-discovery/v1",
        "createdAt": now_utc(),
        "profile": state["profile"],
        "dataSource": connection["name"],
        "namespace": namespace,
        "schemas": schemas,
        "tableCount": len(tables),
        "selectedCount": len(selected),
        "truncated": not requested and len(tables) > len(selected),
        "lists": list_results,
        "inspections": inspections,
    }
    evidence_dir = data_root / "onboarding" / "evidence" / state["profile"]
    artifact_path = evidence_dir / f"schema-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    atomic_json(artifact_path, artifact)
    mark_step(state, "schemaDiscovered", "completed", tableCount=len(tables), selectedCount=len(selected), listOnly=args.list_only)
    state.setdefault("artifacts", {})["schemaDiscovery"] = str(artifact_path)
    path = write_onboarding_state(data_root, state)
    return {
        "success": True,
        **artifact,
        "artifactPath": str(artifact_path),
        "statePath": str(path),
        "next": "review discovered metadata, then create a semantic draft",
        "productionReady": False,
    }


def semantic_draft_command(args: argparse.Namespace) -> dict:
    state, _install_state, data_root, _runtime_state = require_profile(args, require_runtime=False)
    if state["steps"]["schemaDiscovered"]["status"] != "completed":
        raise OnboardingError("Schema discovery is not complete; run schema-discover before drafting TM/QM")
    plan = validate_semantic_plan(read_json_object(normalized(args.semantic_plan), "Semantic plan"))
    if plan.get("profile") is not None and plan["profile"] != state["profile"]:
        raise OnboardingError("semanticPlan.profile does not match the onboarding state profile")
    project_root = normalized(state["projectRoot"])
    models_dir = normalized(state["semantic"]["modelsDir"])
    draft_dir = normalized(project_root / plan["draftDir"])
    if not is_child(draft_dir, project_root) or draft_dir == project_root:
        raise OnboardingError("draftDir must stay inside projectRoot and cannot equal it")
    if is_child(draft_dir, models_dir) or is_child(models_dir, draft_dir):
        raise OnboardingError("draftDir and modelsDir must be separate, non-nested directories")
    manifest = semantic_manifest(draft_dir)
    qm_text = "\n".join(item.read_text(encoding="utf-8-sig") for item in semantic_files(draft_dir) if item.suffix.lower() == ".qm")
    missing_models = [
        name for name in plan["queryModels"]
        if not re.search(rf"\bname\s*:\s*['\"]{re.escape(name)}['\"]", qm_text)
    ]
    if missing_models:
        raise OnboardingError(f"Declared query models were not found in .qm files: {', '.join(missing_models)}")
    state["semantic"].update({
        "draftDir": str(draft_dir),
        "bundleName": plan["bundleName"],
        "queryModels": plan["queryModels"],
        "draftManifest": manifest,
    })
    mark_step(state, "semanticDrafted", "completed", digest=manifest["digest"], tmCount=manifest["tmCount"], qmCount=manifest["qmCount"])
    for later in ("semanticValidated", "semanticPublished", "semanticVerified"):
        state["steps"][later] = step("pending")
    evidence_dir = data_root / "onboarding" / "evidence" / state["profile"]
    artifact_path = evidence_dir / f"semantic-draft-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    atomic_json(artifact_path, {"schemaVersion": "foggy-deepseek-semantic-draft/v1", "createdAt": now_utc(), **plan, "manifest": manifest})
    state.setdefault("artifacts", {})["semanticDraft"] = str(artifact_path)
    path = write_onboarding_state(data_root, state)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-semantic-draft/v1",
        "profile": state["profile"],
        "draftDir": str(draft_dir),
        "modelsDir": str(models_dir),
        "bundleName": plan["bundleName"],
        "queryModels": plan["queryModels"],
        "manifest": manifest,
        "artifactPath": str(artifact_path),
        "statePath": str(path),
        "next": "run semantic-validate without --apply to review, then approve --apply",
        "productionReady": False,
    }


def validation_passed(payload: dict) -> bool:
    data = payload.get("data")
    return bool(
        isinstance(data, dict)
        and data.get("valid") is True
        and isinstance(data.get("totalFiles"), int)
        and data["totalFiles"] > 0
        and data.get("validFiles") == data["totalFiles"]
        and data.get("invalidFiles") == 0
    )


def validation_summary(payload: dict) -> dict:
    data = payload.get("data")
    if not isinstance(data, dict):
        return {"valid": False, "totalFiles": None, "validFiles": None, "invalidFiles": None, "warningCount": None}
    warnings = data.get("warnings")
    return {
        "valid": data.get("valid") is True,
        "totalFiles": data.get("totalFiles"),
        "validFiles": data.get("validFiles"),
        "invalidFiles": data.get("invalidFiles"),
        "cascadingErrors": data.get("cascadingErrors"),
        "warningCount": len(warnings) if isinstance(warnings, list) else None,
    }


def semantic_validate_command(args: argparse.Namespace) -> dict:
    state, install_state, data_root, runtime_state = require_profile(args, require_runtime=args.apply)
    if state["steps"]["semanticDrafted"]["status"] != "completed":
        raise OnboardingError("Semantic draft is not registered; run semantic-draft first")
    draft_dir, manifest = require_unchanged_semantic_draft(state)
    plan = {
        "operation": "models validate",
        "modelsDir": str(draft_dir),
        "namespace": state["connection"]["namespace"],
        "draftDigest": manifest["digest"],
        "includeStackTrace": args.include_stack_trace,
        "runtimeMutation": "Runtime validation catalog may be replaced",
    }
    if not args.apply:
        return {"success": True, "dryRun": True, "profile": state["profile"], "plan": plan, "next": "rerun with --apply after approval"}
    command = ["models", "validate", "--models-dir", str(draft_dir)]
    if args.include_stack_trace:
        command.append("--include-stack-trace")
    result = cli_json(install_state, runtime_state, state["connection"]["namespace"], command, "models validate", timeout=180)
    evidence_dir = data_root / "onboarding" / "evidence" / state["profile"]
    artifact_path = evidence_dir / f"semantic-validate-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    atomic_json(artifact_path, result)
    if not validation_passed(result):
        mark_step(state, "semanticValidated", "failed", digest=manifest["digest"], evidence=str(artifact_path))
        write_onboarding_state(data_root, state)
        raise OnboardingError(f"Semantic validation did not pass; inspect evidence: {artifact_path}")
    mark_step(state, "semanticValidated", "completed", digest=manifest["digest"], evidence=str(artifact_path))
    state.setdefault("artifacts", {})["semanticValidation"] = str(artifact_path)
    path = write_onboarding_state(data_root, state)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-semantic-validate/v1",
        "profile": state["profile"],
        "valid": True,
        "validation": validation_summary(result),
        "artifactPath": str(artifact_path),
        "statePath": str(path),
        "next": "run semantic-publish without --apply to review the file and Runtime mutations",
        "productionReady": False,
    }


def semantic_publish_command(args: argparse.Namespace) -> dict:
    state, install_state, data_root, runtime_state = require_profile(args, require_runtime=args.apply)
    if state["steps"]["semanticValidated"]["status"] != "completed":
        raise OnboardingError("Semantic draft has not passed validation")
    draft_dir, manifest = require_unchanged_semantic_draft(state)
    if state["steps"]["semanticValidated"].get("digest") != manifest["digest"]:
        raise OnboardingError("Semantic validation does not match the current draft")
    project_root = normalized(state["projectRoot"])
    models_dir = normalized(state["semantic"]["modelsDir"])
    if not is_child(models_dir, project_root) or models_dir == project_root or models_dir.is_symlink():
        raise OnboardingError("modelsDir must be a non-symlink child of projectRoot")
    diff = semantic_diff(manifest, models_dir, args.prune)
    plan = {
        "copy": diff,
        "modelsDir": str(models_dir),
        "bundleName": state["semantic"]["bundleName"],
        "queryModels": state["semantic"]["queryModels"],
        "replaceBundle": args.replace_bundle,
        "watch": args.watch,
        "operations": ["backup changed project model files", "copy draft TM/QM", "validate published directory", "register bundle", "refresh declared query models"],
    }
    if not args.apply:
        return {"success": True, "dryRun": True, "profile": state["profile"], "plan": plan, "next": "rerun with --apply after reviewing project and Runtime mutations"}
    backup_root = project_root / ".foggy" / "onboarding-backups" / state["profile"] / "semantic"
    backup = publish_files(draft_dir, models_dir, diff, backup_root)
    evidence_dir = data_root / "onboarding" / "evidence" / state["profile"] / f"semantic-publish-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    namespace = state["connection"]["namespace"]
    try:
        published_validation = cli_json(
            install_state, runtime_state, namespace,
            ["models", "validate", "--models-dir", str(models_dir)], "published models validate", timeout=180,
        )
        atomic_json(evidence_dir / "validate.json", published_validation)
        if not validation_passed(published_validation):
            raise OnboardingError("Published model directory did not pass validation")
        bundle_command = ["bundles", "add", "--name", state["semantic"]["bundleName"], "--path", str(models_dir)]
        if args.watch:
            bundle_command.append("--watch")
        if args.replace_bundle:
            bundle_command.append("--replace")
        bundle = cli_json(install_state, runtime_state, namespace, bundle_command, "bundles add", timeout=60)
        atomic_json(evidence_dir / "bundle.json", bundle)
    except Exception as exc:
        rollback_published_files(backup)
        mark_step(state, "semanticPublished", "failed", rolledBack=True, backupDir=backup["backupDir"], error=str(exc))
        state.setdefault("artifacts", {})["semanticPublishEvidence"] = str(evidence_dir)
        write_onboarding_state(data_root, state)
        raise OnboardingError(f"Semantic publish failed before refresh; project files were rolled back: {exc}") from exc
    refresh_command = ["models", "refresh"]
    for model in state["semantic"]["queryModels"]:
        refresh_command.extend(["--model", model])
    try:
        refresh = cli_json(install_state, runtime_state, namespace, refresh_command, "models refresh", timeout=180)
        atomic_json(evidence_dir / "refresh.json", refresh)
    except Exception as exc:
        mark_step(state, "semanticPublished", "refresh-failed", bundleRegistered=True, backupDir=backup["backupDir"], error=str(exc))
        state.setdefault("artifacts", {})["semanticPublishEvidence"] = str(evidence_dir)
        write_onboarding_state(data_root, state)
        raise OnboardingError(f"Bundle was registered but model refresh failed; inspect evidence and do not republish blindly: {exc}") from exc
    mark_step(
        state, "semanticPublished", "completed", digest=manifest["digest"], bundleName=state["semantic"]["bundleName"],
        backupDir=backup["backupDir"], replaceBundle=args.replace_bundle, watch=args.watch,
    )
    state.setdefault("artifacts", {})["semanticPublishEvidence"] = str(evidence_dir)
    state["artifacts"]["semanticBackup"] = backup["backupDir"]
    path = write_onboarding_state(data_root, state)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-semantic-publish/v1",
        "profile": state["profile"],
        "modelsDir": str(models_dir),
        "bundleName": state["semantic"]["bundleName"],
        "queryModels": state["semantic"]["queryModels"],
        "diff": diff,
        "backupDir": backup["backupDir"],
        "evidenceDir": str(evidence_dir),
        "statePath": str(path),
        "next": "prepare a bounded query payload and run semantic-verify without --execute, then approve --execute",
        "productionReady": False,
    }


def bounded_query_payload(path: Path) -> dict:
    payload = read_json_object(path, "Query payload")
    limit = payload.get("limit")
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1 or limit > 100:
        raise OnboardingError("Query smoke payload must set integer limit between 1 and 100")
    return payload


def safe_evidence_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value)[:128]


def nested_data_objects(payload: dict) -> list[dict]:
    objects: list[dict] = []
    current: object = payload
    for _ in range(4):
        if not isinstance(current, dict):
            break
        objects.append(current)
        next_value = current.get("data")
        if not isinstance(next_value, dict) or next_value is current:
            break
        current = next_value
    return objects


def response_field_count(payload: dict) -> int | None:
    for item in nested_data_objects(payload):
        fields = item.get("fields")
        if isinstance(fields, (list, dict)):
            return len(fields)
    return None


def response_row_count(payload: dict) -> int | None:
    for item in nested_data_objects(payload):
        for key in ("items", "rows", "records"):
            rows = item.get(key)
            if isinstance(rows, list):
                return len(rows)
    return None


def semantic_verify_command(args: argparse.Namespace) -> dict:
    state, install_state, data_root, runtime_state = require_profile(args, require_runtime=True)
    if state["steps"]["semanticPublished"]["status"] != "completed":
        raise OnboardingError("Semantic layer is not published and refreshed")
    declared_models = state["semantic"]["queryModels"]
    query_model = args.query_model or (declared_models[0] if len(declared_models) == 1 else None)
    if not query_model:
        raise OnboardingError("--query-model is required when the semantic plan declares multiple query models")
    if query_model not in declared_models:
        raise OnboardingError("--query-model must be declared in the registered semantic plan")
    if not args.query_payload:
        raise OnboardingError("--query-payload is required for semantic verification")
    project_root = normalized(state["projectRoot"])
    payload_path = normalized(args.query_payload)
    if not is_child(payload_path, project_root):
        raise OnboardingError("Query payload must stay inside projectRoot")
    bounded_query_payload(payload_path)
    namespace = state["connection"]["namespace"]
    evidence_dir = data_root / "onboarding" / "evidence" / state["profile"] / f"semantic-verify-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    model_list = cli_json(install_state, runtime_state, namespace, ["models", "list"], "models list")
    atomic_json(evidence_dir / "models-list.json", model_list)
    descriptions = []
    for model in declared_models:
        description = cli_json(install_state, runtime_state, namespace, ["models", "describe", model], f"models describe ({model})", timeout=90)
        atomic_json(evidence_dir / f"describe-{safe_evidence_name(model)}.json", description)
        descriptions.append({"model": model, "fieldCount": response_field_count(description)})
    validated = cli_json(
        install_state, runtime_state, namespace,
        ["query", "validate", query_model, "--payload", str(payload_path)], "query validate", timeout=90,
    )
    atomic_json(evidence_dir / "query-validate.json", validated)
    if not args.execute:
        mark_step(state, "semanticVerified", "waiting-for-query-execution", queryModel=query_model, queryValidated=True)
        state.setdefault("artifacts", {})["semanticVerifyEvidence"] = str(evidence_dir)
        path = write_onboarding_state(data_root, state)
        return {
            "success": True,
            "schemaVersion": "foggy-deepseek-semantic-verify/v1",
            "profile": state["profile"],
            "models": descriptions,
            "queryModel": query_model,
            "queryValidated": True,
            "queryExecuted": False,
            "evidenceDir": str(evidence_dir),
            "statePath": str(path),
            "next": "rerun semantic-verify with --execute after approving the bounded business-data query",
            "productionReady": False,
        }
    executed = cli_json(
        install_state, runtime_state, namespace,
        ["query", "execute", query_model, "--payload", str(payload_path)], "query execute", timeout=120,
    )
    atomic_json(evidence_dir / "query-execute.json", executed)
    row_count = response_row_count(executed)
    mark_step(state, "semanticVerified", "completed", queryModel=query_model, queryValidated=True, queryExecuted=True)
    state.setdefault("artifacts", {})["semanticVerifyEvidence"] = str(evidence_dir)
    path = write_onboarding_state(data_root, state)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-semantic-verify/v1",
        "profile": state["profile"],
        "models": descriptions,
        "queryModel": query_model,
        "queryValidated": True,
        "queryExecuted": True,
        "rowCount": row_count,
        "evidenceDir": str(evidence_dir),
        "statePath": str(path),
        "next": "onboarding complete; begin analysis with described field names",
        "productionReady": False,
    }


def next_onboarding_action(state: dict) -> dict:
    ordered = [
        ("datasourceConfigured", "datasource-configure --apply"),
        ("datasourceVerified", "datasource-verify --bind"),
        ("schemaDiscovered", "schema-discover"),
        ("semanticDrafted", "semantic-draft --semantic-plan <json>"),
        ("semanticValidated", "semantic-validate --apply"),
        ("semanticPublished", "semantic-publish --apply"),
        ("semanticVerified", "semantic-verify --query-payload <json> --execute"),
    ]
    for name, command in ordered:
        current = state.get("steps", {}).get(name, {})
        if current.get("status") != "completed":
            if name == "semanticPublished" and current.get("status") == "refresh-failed":
                return {
                    "step": name,
                    "command": None,
                    "status": "refresh-failed",
                    "instruction": "Inspect semantic publish evidence and repair refresh before any republish attempt.",
                }
            if name == "semanticValidated" and current.get("status") == "failed":
                command = "repair TM/QM, then semantic-draft --semantic-plan <json>"
            return {"step": name, "command": command, "status": current.get("status", "pending")}
    return {"step": None, "command": None, "status": "completed"}


def onboarding_status_command(args: argparse.Namespace) -> dict:
    state, _install_state, _data_root, runtime_state = require_profile(args, require_runtime=False)
    runtime_running = bool(runtime_state and process_info(int(runtime_state.get("pid", 0)))["running"])
    connection = state["connection"]
    password_env = connection.get("passwordEnv")
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-onboarding-status/v1",
        "profile": state["profile"],
        "runtimeRunning": runtime_running,
        "passwordEnv": password_env,
        "passwordEnvPresent": bool(password_env and os.environ.get(password_env)),
        "steps": state["steps"],
        "artifacts": state.get("artifacts", {}),
        "next": next_onboarding_action(state),
        "productionReady": False,
    }


def onboarding_resume_command(args: argparse.Namespace) -> dict:
    result = onboarding_status_command(args)
    result["schemaVersion"] = "foggy-deepseek-onboarding-resume/v1"
    result["instruction"] = "Execute only the reported next command; this command does not mutate Runtime or project files."
    return result


def composite_evidence_dir(project_root: Path, profile: str, requested: str | None) -> Path:
    destination = normalized(requested) if requested else project_root / ".foggy" / "onboarding-command-evidence" / profile
    if not is_child(destination, project_root) or destination == project_root:
        raise OnboardingError("Composite evidence directory must stay below projectRoot")
    destination.mkdir(parents=True, exist_ok=True)
    return destination


def save_composite_result(evidence_dir: Path, name: str, payload: dict, files: list[str]) -> None:
    path = evidence_dir / name
    atomic_json(path, payload)
    files.append(str(path))


def datasource_run_command(args: argparse.Namespace) -> dict:
    _install_root, install_state, data_root, _runtime_state = onboarding_context(args, require_runtime=True)
    project_root = normalized(args.project_root or install_state["projectRoot"])
    requested_connection = validate_connection(read_json_object(normalized(args.connection_file), "Connection plan"))
    if not requested_connection.get("profile"):
        raise OnboardingError("Composite datasource onboarding requires connection.profile in the approved contract")
    profile = requested_connection["profile"]
    if args.profile is not None and safe_profile(args.profile) != profile:
        raise OnboardingError("Command profile conflicts with the approved connection.profile")
    contract_evidence = requested_connection.get("evidenceDir")
    if contract_evidence and args.evidence_dir:
        if normalized(project_root / contract_evidence) != normalized(args.evidence_dir):
            raise OnboardingError("Command evidence directory conflicts with the approved connection.evidenceDir")
    evidence_dir = composite_evidence_dir(project_root, profile, str(project_root / contract_evidence) if contract_evidence else args.evidence_dir)
    files: list[str] = []
    existing = read_onboarding_state(data_root, profile, required=False)
    if existing:
        if existing.get("connection") != requested_connection:
            raise OnboardingError("Existing onboarding profile does not match the requested connection plan")
        plan_result = {
            "success": True,
            "schemaVersion": "foggy-deepseek-onboarding-plan-result/v1",
            "profile": profile,
            "resumed": True,
            "statePath": str(onboarding_state_path(data_root, profile)),
            "next": next_onboarding_action(existing),
            "productionReady": False,
        }
    else:
        plan_result = onboarding_plan_command(argparse.Namespace(
            install_root=args.install_root,
            data_root=args.data_root,
            project_root=str(project_root),
            profile=profile,
            connection_file=args.connection_file,
            replace_plan=False,
        ))
    save_composite_result(evidence_dir, "01-plan.json", plan_result, files)

    configure_dry = datasource_configure_command(argparse.Namespace(
        install_root=args.install_root, data_root=args.data_root, profile=profile, apply=False, replace=False,
    ))
    save_composite_result(evidence_dir, "02-datasource-dry.json", configure_dry, files)
    if not args.approve_configure:
        return {
            "success": True,
            "schemaVersion": "foggy-deepseek-datasource-run/v1",
            "profile": profile,
            "phaseStatus": "awaiting-configure-approval",
            "evidenceDir": str(evidence_dir),
            "evidenceFiles": files,
            "next": "rerun with --approve-configure after the datasource mutation is approved",
            "productionReady": False,
        }

    configured = datasource_configure_command(argparse.Namespace(
        install_root=args.install_root, data_root=args.data_root, profile=profile, apply=True, replace=False,
    ))
    save_composite_result(evidence_dir, "03-datasource-apply.json", configured, files)
    tested = datasource_verify_command(argparse.Namespace(
        install_root=args.install_root, data_root=args.data_root, profile=profile, bind=False,
    ))
    save_composite_result(evidence_dir, "04-datasource-test.json", tested, files)
    if not args.approve_bind:
        return {
            "success": True,
            "schemaVersion": "foggy-deepseek-datasource-run/v1",
            "profile": profile,
            "phaseStatus": "awaiting-bind-approval",
            "evidenceDir": str(evidence_dir),
            "evidenceFiles": files,
            "next": "rerun with --approve-configure --approve-bind after namespace binding is approved",
            "productionReady": False,
        }

    bound = datasource_verify_command(argparse.Namespace(
        install_root=args.install_root, data_root=args.data_root, profile=profile, bind=True,
    ))
    save_composite_result(evidence_dir, "05-datasource-bind.json", bound, files)
    discovered = schema_discover_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        schema=args.schema,
        pattern=args.pattern,
        table=args.table,
        max_tables=args.max_tables,
        list_only=False,
        no_views=args.no_views,
        include_indexes=args.include_indexes,
    ))
    save_composite_result(evidence_dir, "06-schema.json", discovered, files)
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-datasource-run/v1",
        "profile": profile,
        "phaseStatus": "completed",
        "selectedTableCount": discovered["selectedCount"],
        "schemaArtifactPath": discovered["artifactPath"],
        "evidenceDir": str(evidence_dir),
        "evidenceFiles": files,
        "next": "author TM/QM drafts from schema metadata and confirmed business definitions",
        "productionReady": False,
    }


def semantic_run_command(args: argparse.Namespace) -> dict:
    approved_plan = validate_semantic_plan(read_json_object(normalized(args.semantic_plan), "Semantic plan"))
    if not approved_plan.get("profile"):
        raise OnboardingError("Composite semantic onboarding requires semanticPlan.profile in the approved contract")
    profile = approved_plan["profile"]
    if args.profile is not None and safe_profile(args.profile) != profile:
        raise OnboardingError("Command profile conflicts with the approved semanticPlan.profile")
    profile_args = argparse.Namespace(**vars(args))
    profile_args.profile = profile
    state, _install_state, _data_root, _runtime_state = require_profile(profile_args, require_runtime=True)
    project_root = normalized(state["projectRoot"])
    contract_evidence = approved_plan.get("evidenceDir")
    if contract_evidence and args.evidence_dir:
        if normalized(project_root / contract_evidence) != normalized(args.evidence_dir):
            raise OnboardingError("Command evidence directory conflicts with the approved semanticPlan.evidenceDir")
    evidence_dir = composite_evidence_dir(project_root, profile, str(project_root / contract_evidence) if contract_evidence else args.evidence_dir)
    files: list[str] = []

    drafted = semantic_draft_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        semantic_plan=args.semantic_plan,
    ))
    save_composite_result(evidence_dir, "07-semantic-draft.json", drafted, files)
    validate_dry = semantic_validate_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        apply=False,
        include_stack_trace=False,
    ))
    save_composite_result(evidence_dir, "08-semantic-validate-dry.json", validate_dry, files)
    if not args.approve_validate:
        return {
            "success": True,
            "schemaVersion": "foggy-deepseek-semantic-run/v1",
            "profile": profile,
            "phaseStatus": "awaiting-validate-approval",
            "evidenceDir": str(evidence_dir),
            "evidenceFiles": files,
            "next": "rerun with --approve-validate after the validation catalog mutation is approved",
            "productionReady": False,
        }

    validated = semantic_validate_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        apply=True,
        include_stack_trace=False,
    ))
    save_composite_result(evidence_dir, "09-semantic-validate-apply.json", validated, files)
    publish_dry = semantic_publish_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        apply=False,
        replace_bundle=False,
        watch=False,
        prune=False,
    ))
    save_composite_result(evidence_dir, "10-semantic-publish-dry.json", publish_dry, files)
    if not args.approve_publish:
        return {
            "success": True,
            "schemaVersion": "foggy-deepseek-semantic-run/v1",
            "profile": profile,
            "phaseStatus": "awaiting-publish-approval",
            "evidenceDir": str(evidence_dir),
            "evidenceFiles": files,
            "next": "rerun with --approve-validate --approve-publish after publication is approved",
            "productionReady": False,
        }

    published = semantic_publish_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        apply=True,
        replace_bundle=False,
        watch=False,
        prune=False,
    ))
    save_composite_result(evidence_dir, "11-semantic-publish-apply.json", published, files)
    query_validated = semantic_verify_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        query_model=args.query_model,
        query_payload=args.query_payload,
        execute=False,
    ))
    save_composite_result(evidence_dir, "12-query-validate.json", query_validated, files)
    if not args.approve_execute:
        return {
            "success": True,
            "schemaVersion": "foggy-deepseek-semantic-run/v1",
            "profile": profile,
            "phaseStatus": "awaiting-query-execution-approval",
            "queryValidated": True,
            "queryExecuted": False,
            "evidenceDir": str(evidence_dir),
            "evidenceFiles": files,
            "next": "rerun with all three approval flags after bounded query execution is approved",
            "productionReady": False,
        }

    executed = semantic_verify_command(argparse.Namespace(
        install_root=args.install_root,
        data_root=args.data_root,
        profile=profile,
        query_model=args.query_model,
        query_payload=args.query_payload,
        execute=True,
    ))
    save_composite_result(evidence_dir, "13-query-execute.json", executed, files)
    status = onboarding_status_command(argparse.Namespace(
        install_root=args.install_root, data_root=args.data_root, profile=profile,
    ))
    save_composite_result(evidence_dir, "14-status.json", status, files)
    if status["next"].get("status") != "completed":
        raise OnboardingError("Composite semantic run ended with an incomplete persisted onboarding state")
    return {
        "success": True,
        "schemaVersion": "foggy-deepseek-semantic-run/v1",
        "profile": profile,
        "phaseStatus": "completed",
        "queryModel": executed["queryModel"],
        "queryValidated": executed["queryValidated"],
        "queryExecuted": executed["queryExecuted"],
        "rowCount": executed["rowCount"],
        "evidenceDir": str(evidence_dir),
        "evidenceFiles": files,
        "productionReady": False,
    }


def doctor_command(args: argparse.Namespace) -> dict:
    versions = load_versions()
    install_root = normalized(args.install_root or default_install_root())
    project_root = normalized(args.project_root or Path.cwd())
    state = read_install_state(install_root, required=False)
    python_ok = sys.version_info >= (3, 11)
    java = java_probe()
    java_ok = java["available"] and java["exitCode"] == 0 and version_tuple(java["version"] or "") >= (17, 0, 0)
    cli_command = state.get("cli", {}).get("command") if state else shutil.which("foggy-runtime")
    cli = command_result([cli_command, "--version"]) if cli_command else {"available": False, "exitCode": None, "stdout": "", "stderr": "command not found", "durationMs": 0}
    cli_ok = cli["available"] and cli["exitCode"] == 0 and version_tuple(cli["stdout"]) >= version_tuple(versions["components"]["analysisSkill"]["minimumCliVersion"])
    launcher_checks = []
    if state:
        launcher_dir = normalized(state["launcher"]["path"])
        for asset in versions["components"]["launcher"]["assets"]:
            path = launcher_dir / asset["file"]
            launcher_checks.append({"file": asset["file"], "present": path.is_file(), "sha256Valid": path.is_file() and sha256(path) == asset["sha256"]})
    launcher_ok = bool(launcher_checks) and all(item["present"] and item["sha256Valid"] for item in launcher_checks)
    analysis_skill = project_root / ".agents" / "skills" / "foggy-ai-analysis" / "SKILL.md"
    onboarding_skill = project_root / ".agents" / "skills" / "foggy-deepseek-onboarding" / "SKILL.md"
    runtime = {"status": "stopped"}
    if state:
        data_root = normalized(state["dataRoot"])
        runtime_state_path = data_root / "runtime-state.json"
        if runtime_state_path.is_file():
            runtime_state = json.loads(runtime_state_path.read_text(encoding="utf-8"))
            info = process_info(int(runtime_state.get("pid", 0)))
            runtime = {"status": "running" if info["running"] else "stale", "pid": runtime_state.get("pid"), "runtimeUrl": runtime_state.get("runtimeUrl"), "identity": runtime_state.get("identity")}
    required = {
        "python": python_ok,
        "java": java_ok,
        "cli": cli_ok,
        "launcher": launcher_ok,
        "analysisSkill": analysis_skill.is_file(),
    }
    if args.strict_runtime:
        required["runtime"] = runtime["status"] == "running"
    result = {
        "success": all(required.values()),
        "schemaVersion": "foggy-deepseek-onboarding-doctor/v1",
        "installRoot": str(install_root),
        "projectRoot": str(project_root),
        "checks": required,
        "python": {"version": sys.version.split()[0], "minimum": versions["components"]["cli"]["minimumPythonVersion"]},
        "java": java,
        "cli": cli,
        "launcherAssets": launcher_checks,
        "skills": {"analysis": str(analysis_skill), "onboarding": str(onboarding_skill), "onboardingPresent": onboarding_skill.is_file()},
        "runtime": runtime,
        "environmentPresence": {name: bool(os.environ.get(name)) for name in ("DEEPSEEK_API_KEY", "ALIYUN_TOKEN_PLAN_API_KEY", "FOGGY_RUNTIME_API_AUTH_CODE", "FOGGY_RUNTIME_AUTHORIZATION")},
        "productionReady": False,
    }
    return result


def uninstall_command(args: argparse.Namespace) -> dict:
    install_root = normalized(args.install_root or default_install_root())
    state = read_install_state(install_root)
    data_root = normalized(state["dataRoot"])
    assert_managed_root(install_root, "Install root")
    assert_managed_root(data_root, "Data root")
    if install_root == data_root:
        raise OnboardingError("Install root and data root must be different")
    project_root = normalized(state["projectRoot"])
    skills_root = project_root / ".agents" / "skills"
    skill_targets = [skills_root / name for name in ("foggy-deepseek-onboarding", "foggy-ai-analysis")]
    if args.remove_skills:
        for target in skill_targets:
            if target.exists() and (target.is_symlink() or not is_child(target, skills_root)):
                raise OnboardingError(f"Refusing to remove unexpected Skill path: {target}")
    plan = {"installRoot": str(install_root), "dataRoot": str(data_root), "removeSkills": args.remove_skills, "purgeData": args.purge_data}
    if args.dry_run:
        return {"success": True, "dryRun": True, "plan": plan}
    if not args.yes:
        raise OnboardingError("Uninstall requires --yes; use --dry-run to inspect the plan")
    stopped = stop_recorded_runtime(data_root, force=args.force)
    removed_skills = []
    if args.remove_skills:
        for target in skill_targets:
            if target.exists():
                shutil.rmtree(target)
                removed_skills.append(str(target))
    if not (install_root / "install-state.json").is_file():
        raise OnboardingError(f"Refusing to remove unsafe install root: {install_root}")
    shutil.rmtree(install_root)
    data_removed = False
    if args.purge_data and data_root.exists():
        shutil.rmtree(data_root)
        data_removed = True
    return {"success": True, "schemaVersion": "foggy-deepseek-onboarding-uninstall/v1", "stopped": stopped, "removedInstallRoot": str(install_root), "removedSkills": removed_skills, "dataRemoved": data_removed, "preservedDataRoot": None if data_removed else str(data_root)}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    manifest = sub.add_parser("manifest")
    manifest.set_defaults(handler=lambda _args: {"success": True, "versions": load_versions()})

    install = sub.add_parser("install")
    install.add_argument("--install-root")
    install.add_argument("--data-root")
    install.add_argument("--project-root")
    install.add_argument("--asset-cache-dir", action="append", default=[])
    install.add_argument("--replace-skill", action="store_true")
    install.add_argument("--skip-cli-install", action="store_true")
    install.add_argument("--cli-command")
    install.add_argument("--dry-run", action="store_true")
    install.set_defaults(handler=install_command)

    doctor = sub.add_parser("doctor")
    doctor.add_argument("--install-root")
    doctor.add_argument("--project-root")
    doctor.add_argument("--strict-runtime", action="store_true")
    doctor.add_argument("--no-fail", action="store_true")
    doctor.set_defaults(handler=doctor_command)

    start = sub.add_parser("runtime-start")
    start.add_argument("--install-root")
    start.add_argument("--data-root")
    start.add_argument("--project-root")
    start.add_argument("--port", type=int)
    start.add_argument("--namespace")
    start.add_argument("--timeout", type=int)
    start.add_argument("--java")
    start.set_defaults(handler=runtime_start_command)

    stop = sub.add_parser("runtime-stop")
    stop.add_argument("--install-root")
    stop.add_argument("--data-root")
    stop.add_argument("--force", action="store_true")
    stop.set_defaults(handler=lambda args: stop_recorded_runtime(normalized(args.data_root or read_install_state(normalized(args.install_root or default_install_root()))["dataRoot"]), force=args.force))

    plan = sub.add_parser("onboard-plan")
    plan.add_argument("--install-root")
    plan.add_argument("--data-root")
    plan.add_argument("--project-root")
    plan.add_argument("--profile", default="default")
    plan.add_argument("--connection-file", required=True)
    plan.add_argument("--replace-plan", action="store_true")
    plan.set_defaults(handler=onboarding_plan_command)

    status = sub.add_parser("onboard-status")
    status.add_argument("--install-root")
    status.add_argument("--data-root")
    status.add_argument("--profile", default="default")
    status.set_defaults(handler=onboarding_status_command)

    resume = sub.add_parser("onboard-resume")
    resume.add_argument("--install-root")
    resume.add_argument("--data-root")
    resume.add_argument("--profile", default="default")
    resume.set_defaults(handler=onboarding_resume_command)

    datasource_run = sub.add_parser("onboard-datasource-run")
    datasource_run.add_argument("--install-root")
    datasource_run.add_argument("--data-root")
    datasource_run.add_argument("--project-root")
    datasource_run.add_argument("--profile")
    datasource_run.add_argument("--connection-file", required=True)
    datasource_run.add_argument("--evidence-dir")
    datasource_run.add_argument("--approve-configure", action="store_true")
    datasource_run.add_argument("--approve-bind", action="store_true")
    datasource_run.add_argument("--schema", action="append")
    datasource_run.add_argument("--pattern")
    datasource_run.add_argument("--table", action="append")
    datasource_run.add_argument("--max-tables", type=int, default=25)
    datasource_run.add_argument("--no-views", action="store_true")
    datasource_run.add_argument("--include-indexes", action="store_true")
    datasource_run.set_defaults(handler=datasource_run_command)

    semantic_run = sub.add_parser("onboard-semantic-run")
    semantic_run.add_argument("--install-root")
    semantic_run.add_argument("--data-root")
    semantic_run.add_argument("--profile")
    semantic_run.add_argument("--semantic-plan", required=True)
    semantic_run.add_argument("--query-payload", required=True)
    semantic_run.add_argument("--query-model")
    semantic_run.add_argument("--evidence-dir")
    semantic_run.add_argument("--approve-validate", action="store_true")
    semantic_run.add_argument("--approve-publish", action="store_true")
    semantic_run.add_argument("--approve-execute", action="store_true")
    semantic_run.set_defaults(handler=semantic_run_command)

    datasource_configure = sub.add_parser("datasource-configure")
    datasource_configure.add_argument("--install-root")
    datasource_configure.add_argument("--data-root")
    datasource_configure.add_argument("--profile", default="default")
    datasource_configure.add_argument("--apply", action="store_true")
    datasource_configure.add_argument("--replace", action="store_true")
    datasource_configure.set_defaults(handler=datasource_configure_command)

    datasource_verify = sub.add_parser("datasource-verify")
    datasource_verify.add_argument("--install-root")
    datasource_verify.add_argument("--data-root")
    datasource_verify.add_argument("--profile", default="default")
    datasource_verify.add_argument("--bind", action="store_true")
    datasource_verify.set_defaults(handler=datasource_verify_command)

    schema_discover = sub.add_parser("schema-discover")
    schema_discover.add_argument("--install-root")
    schema_discover.add_argument("--data-root")
    schema_discover.add_argument("--profile", default="default")
    schema_discover.add_argument("--schema", action="append")
    schema_discover.add_argument("--pattern")
    schema_discover.add_argument("--table", action="append")
    schema_discover.add_argument("--max-tables", type=int, default=25)
    schema_discover.add_argument("--list-only", action="store_true")
    schema_discover.add_argument("--no-views", action="store_true")
    schema_discover.add_argument("--include-indexes", action="store_true")
    schema_discover.set_defaults(handler=schema_discover_command)

    semantic_draft = sub.add_parser("semantic-draft")
    semantic_draft.add_argument("--install-root")
    semantic_draft.add_argument("--data-root")
    semantic_draft.add_argument("--profile", default="default")
    semantic_draft.add_argument("--semantic-plan", required=True)
    semantic_draft.set_defaults(handler=semantic_draft_command)

    semantic_validate = sub.add_parser("semantic-validate")
    semantic_validate.add_argument("--install-root")
    semantic_validate.add_argument("--data-root")
    semantic_validate.add_argument("--profile", default="default")
    semantic_validate.add_argument("--apply", action="store_true")
    semantic_validate.add_argument("--include-stack-trace", action="store_true")
    semantic_validate.set_defaults(handler=semantic_validate_command)

    semantic_publish = sub.add_parser("semantic-publish")
    semantic_publish.add_argument("--install-root")
    semantic_publish.add_argument("--data-root")
    semantic_publish.add_argument("--profile", default="default")
    semantic_publish.add_argument("--apply", action="store_true")
    semantic_publish.add_argument("--replace-bundle", action="store_true")
    semantic_publish.add_argument("--watch", action="store_true")
    semantic_publish.add_argument("--prune", action="store_true")
    semantic_publish.set_defaults(handler=semantic_publish_command)

    semantic_verify = sub.add_parser("semantic-verify")
    semantic_verify.add_argument("--install-root")
    semantic_verify.add_argument("--data-root")
    semantic_verify.add_argument("--profile", default="default")
    semantic_verify.add_argument("--query-model")
    semantic_verify.add_argument("--query-payload", required=True)
    semantic_verify.add_argument("--execute", action="store_true")
    semantic_verify.set_defaults(handler=semantic_verify_command)

    uninstall = sub.add_parser("uninstall")
    uninstall.add_argument("--install-root")
    uninstall.add_argument("--yes", action="store_true")
    uninstall.add_argument("--dry-run", action="store_true")
    uninstall.add_argument("--remove-skills", action="store_true")
    uninstall.add_argument("--purge-data", action="store_true")
    uninstall.add_argument("--force", action="store_true")
    uninstall.set_defaults(handler=uninstall_command)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        result = args.handler(args)
        exit_code = 0
        if args.command == "doctor" and not result["success"] and not args.no_fail:
            exit_code = 1
        emit(result, exit_code)
    except OnboardingError as exc:
        emit({"success": False, "error": {"code": "ONBOARDING_ERROR", "message": str(exc)}, "productionReady": False}, 1)
    except Exception as exc:
        emit({"success": False, "error": {"code": "UNEXPECTED_ERROR", "message": str(exc)}, "productionReady": False}, 1)


if __name__ == "__main__":
    main()
