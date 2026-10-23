#!/usr/bin/env python3
"""Mirror only the reviewed public dist tree; never copy the Sites Git history."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import html
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
from urllib.parse import unquote


MIRROR = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = MIRROR.parent / "shanghai-tech-2026"
REPOSITORY = "ingunbi/shanghai-tech-2026"
CLEAN_ROOT = "9ea017d638cb2073ffb6e2cf4982582a64a2466b"
HOOK_START = "# BEGIN shanghai-tech GitHub sync (managed)"
HOOK_END = "# END shanghai-tech GitHub sync (managed)"
ALLOWED = {
    ".html", ".css", ".js", ".json", ".geojson", ".svg", ".txt", ".webmanifest",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
    ".woff", ".woff2", ".ttf", ".otf",
}
TEXT = {".html", ".css", ".js", ".json", ".geojson", ".svg", ".txt", ".webmanifest"}
EXCLUDED_DIRS = {"private", "notes-private", "node_modules", "bookings", "passports", "receipts"}
EXCLUDED_SUFFIXES = {".map", ".pdf", ".eml", ".msg", ".csv", ".zip", ".gz", ".tar", ".7z", ".bak", ".db", ".sqlite", ".pem", ".key"}
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b"),
    re.compile(r"[\"']?(?:pnr|booking[_-]?(?:number|code|ref(?:erence)?|id)|reservation[_-]?(?:number|code|id)|confirmation[_-]?(?:number|code)|passport[_-]?(?:number|no)|passenger[_-]?name|traveler[_-]?name)[\"']?\s*[:=]\s*[\"']?\s*[A-Za-z0-9가-힣][^\n,;}]{2,}", re.I),
    re.compile(r"(?:예약\s*번호|여권\s*번호|항공사\s*예약\s*코드)\s*[:：=]\s*[A-Za-z0-9-]{5,}", re.I),
    re.compile(r"[\"']?(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password)[\"']?\s*[:=]\s*[\"'][A-Za-z0-9_+/=-]{12,}[\"']", re.I),
]


class SyncError(Exception):
    pass


def clean_env():
    # post-commit inherits the source repository's Git context and Sites auth.
    # None of those values belongs in a subprocess that addresses GitHub.
    env = {k: v for k, v in os.environ.items() if not k.startswith(("GIT_", "SITES_"))}
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def command(args, cwd=None, *, ok=(0,), operation="Command"):
    try:
        result = subprocess.run(args, cwd=cwd, env=clean_env(), text=True, capture_output=True, timeout=45)
    except subprocess.TimeoutExpired as exc:
        raise SyncError(f"{operation} timed out; retry when the connection is available.") from exc
    except OSError as exc:
        raise SyncError(f"{operation} could not start; check the required executable.") from exc
    if result.returncode not in ok:
        # Do not echo command output: an auth failure can contain credential URLs.
        raise SyncError(f"{operation} failed; check authentication/connection and retry.")
    return result


def git(repo, *args, **kwargs):
    return command(["git", "-C", str(repo), *args], operation="Git " + args[0], **kwargs)


def git_dir(repo):
    return Path(git(repo, "rev-parse", "--absolute-git-dir").stdout.strip())


def read_private_markers(source):
    """Local-only length:sha256 denylist; no personal markers live in this repo."""
    path = git_dir(source) / "site-sync-private-markers.sha256"
    if not path.is_file():
        raise SyncError("Local private-marker denylist is missing; create it in the source Git directory first.")
    groups = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([1-9][0-9]{0,2}):([a-fA-F0-9]{64})", line)
        if not match or int(match[1]) > 256:
            raise SyncError("Invalid private-marker denylist format; use character-length:SHA256(casefold marker).")
        groups.setdefault(int(match[1]), set()).add(match[2].lower())
    if not groups:
        raise SyncError("Local private-marker denylist is empty.")
    return groups


def scan_text(text, markers, label):
    decoded = html.unescape(unquote(text))
    for pattern in SECRET_PATTERNS:
        if pattern.search(decoded):
            raise SyncError(f"Privacy check blocked {label}; inspect it locally for sensitive fields or credentials.")
    folded = decoded.casefold()
    for length, hashes in markers.items():
        for i in range(max(0, len(folded) - length + 1)):
            digest = hashlib.sha256(folded[i:i + length].encode("utf-8")).hexdigest()
            if digest in hashes:
                raise SyncError(f"Privacy check blocked {label}; a historical private marker was detected.")


def snapshot(dist, markers):
    if not dist.is_dir() or dist.is_symlink():
        raise SyncError("The source dist directory is missing or is a symlink.")
    result, excluded = {}, 0
    for base, dirs, files in os.walk(dist, followlinks=False):
        base = Path(base)
        for name in list(dirs):
            path = base / name
            if path.is_symlink():
                raise SyncError("Symlinks are not allowed in the public source tree.")
            if name.startswith(".") or name.casefold() in EXCLUDED_DIRS:
                dirs.remove(name)
                excluded += 1
        for name in files:
            path = base / name
            if path.is_symlink() or not path.is_file():
                raise SyncError("Only regular public static files may be synchronized.")
            if name.startswith(".") or path.suffix.lower() in EXCLUDED_SUFFIXES:
                excluded += 1
                continue
            if path.suffix.lower() not in ALLOWED:
                raise SyncError(f"Unsupported public file type: {path.relative_to(dist)}")
            rel = path.relative_to(dist).as_posix()
            payload = path.read_bytes()
            if path.suffix.lower() in TEXT:
                try:
                    scan_text(payload.decode("utf-8"), markers, rel)
                except UnicodeDecodeError as exc:
                    raise SyncError(f"Public text must be UTF-8: {rel}") from exc
            elif b"Exif\x00\x00" in payload or b"<exif:GPS" in payload or (path.suffix.lower() == ".png" and b"eXIf" in payload):
                raise SyncError(f"Image metadata needs review before synchronization: {rel}")
            result[rel] = payload
    if "index.html" not in result:
        raise SyncError("The public snapshot must include index.html.")
    return result, excluded


def current_files(dist):
    if not dist.exists():
        return {}
    if dist.is_symlink():
        raise SyncError("The mirror dist directory must not be a symlink.")
    files = {}
    for path in dist.rglob("*"):
        if path.is_symlink():
            raise SyncError("The mirror dist tree contains a symlink; inspect it before syncing.")
        if path.is_file():
            files[path.relative_to(dist).as_posix()] = path.read_bytes()
    return files


def changes(old, new):
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed = sorted(p for p in set(old) & set(new) if old[p] != new[p])
    return added, changed, removed


def render_hook(original, source, script):
    first, _, rest = original.partition("\n")
    if first.startswith("#!") and not re.search(r"(?:/|\s)(?:sh|bash|zsh|dash|ksh)(?:\s|$)", first):
        raise SyncError("The existing post-commit hook is not a shell script; leave it intact and chain manually.")
    block = f"""{HOOK_START}
if command -v python3 >/dev/null 2>&1; then
    python3 {shlex.quote(str(script))} --source {shlex.quote(str(source))} || :
else
    printf '%s\\n' 'GitHub sync failed: python3 is unavailable.' >&2
fi
{HOOK_END}
"""
    if HOOK_START in original or HOOK_END in original:
        if original.count(HOOK_START) != 1 or original.count(HOOK_END) != 1:
            raise SyncError("Existing managed hook markers are inconsistent; inspect the hook before editing.")
        pattern = re.escape(HOOK_START) + r".*?" + re.escape(HOOK_END) + r"\n?"
        updated = re.sub(pattern, lambda _: block, original, flags=re.S)
    else:
        if first.startswith("#!"):
            updated = first + "\n" + block + "\n" + rest
        else:
            updated = "#!/bin/sh\n" + block + "\n" + original
    return updated


def install_hook(source):
    custom = git(source, "config", "--get", "core.hooksPath", ok=(0, 1)).stdout.strip()
    if custom:
        raise SyncError("A custom core.hooksPath is configured; chain this script there explicitly instead of changing shared hooks.")
    path = git_dir(source) / "hooks" / "post-commit"
    if path.is_symlink():
        raise SyncError("The existing post-commit hook is a symlink; leave it intact and chain manually.")
    original = path.read_text(encoding="utf-8") if path.exists() else "#!/bin/sh\n"
    updated = render_hook(original, source, Path(__file__).resolve())
    if path.exists() and HOOK_START not in original:
        backup = path.with_name("post-commit.before-shanghai-sync")
        if not backup.exists():
            shutil.copy2(path, backup)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name("post-commit.site-sync-tmp")
    temporary.write_text(updated, encoding="utf-8")
    temporary.chmod(0o755)
    temporary.replace(path)
    print("Installed the managed post-commit GitHub sync block; existing shell hook content was preserved.")


def synchronize(source, public, old):
    if source == MIRROR:
        raise SyncError("The source and GitHub mirror must be different repositories.")
    if git(MIRROR, "status", "--porcelain=v1", "--untracked-files=all").stdout.strip():
        raise SyncError("The GitHub mirror has local changes; commit/reconcile them before syncing.")
    if git(MIRROR, "ls-files", "--others", "--ignored", "--exclude-standard", "--", "dist").stdout.strip():
        raise SyncError("The mirror dist contains ignored local files; preserve/reconcile them before syncing.")
    if git(source, "status", "--porcelain=v1", "--untracked-files=all", "--", "dist").stdout.strip():
        raise SyncError("The source dist has uncommitted changes; commit the Site source before syncing.")
    if git(MIRROR, "symbolic-ref", "--short", "HEAD").stdout.strip() != "main":
        raise SyncError("The GitHub mirror must be on main.")
    if git(MIRROR, "rev-list", "--max-parents=0", "HEAD").stdout.strip() != CLEAN_ROOT:
        raise SyncError("The mirror history is not the clean public-source history; do not push the Sites history.")
    remote = git(MIRROR, "remote", "get-url", "origin").stdout.strip()
    if remote not in (f"https://github.com/{REPOSITORY}.git", f"git@github.com:{REPOSITORY}.git"):
        raise SyncError("The mirror origin does not match the intended GitHub repository.")
    visibility = command(["gh", "repo", "view", REPOSITORY, "--json", "visibility", "--jq", ".visibility"], operation="GitHub visibility check").stdout.strip()
    if visibility != "PRIVATE":
        raise SyncError("The GitHub repository is no longer private; review its visibility before syncing.")
    git(MIRROR, "fetch", "--quiet", "origin", "main")
    ancestry = git(MIRROR, "merge-base", "--is-ancestor", "origin/main", "HEAD", ok=(0, 1))
    if ancestry.returncode:
        raise SyncError("GitHub has commits absent locally; reconcile main before syncing. No force push is used.")
    added, changed, removed = changes(old, public)
    target = MIRROR / "dist"
    for rel in removed:
        (target / rel).unlink()
    for rel in added + changed:
        path = target / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(public[rel])
    if added or changed or removed:
        git(MIRROR, "add", "-A", "--", "dist")
        source_commit = git(source, "rev-parse", "--short=12", "HEAD").stdout.strip()
        git(MIRROR, "commit", "-m", f"Sync public travel site ({source_commit})")
    # A previous push failure can leave a valid local commit awaiting retry.
    git(MIRROR, "push", "origin", "HEAD:main")
    if current_files(target) != public:
        raise SyncError("Post-sync file comparison failed; inspect the mirror before further changes.")
    local = git(MIRROR, "rev-parse", "HEAD").stdout.strip()
    remote_commit = git(MIRROR, "ls-remote", "origin", "refs/heads/main").stdout.split()
    if not remote_commit or remote_commit[0] != local:
        raise SyncError("GitHub main could not be confirmed at the local commit; retry verification.")
    print(f"GitHub synchronized: {len(public)} public files; main {local[:12]}.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Sites checkout root (default: sibling shanghai-tech-2026)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--install-hook", action="store_true", help="Install a managed source post-commit hook; do not sync")
    mode.add_argument("--check", action="store_true", help="Read-only privacy/equality check; exit 1 if dist differs")
    mode.add_argument("--dry-run", action="store_true", help="Read-only privacy check and change counts; never push")
    args = parser.parse_args(argv)
    source = args.source.expanduser().resolve()
    try:
        markers = read_private_markers(source)
        if args.install_hook:
            install_hook(source)
            return 0
        public, excluded = snapshot(source / "dist", markers)
        old = current_files(MIRROR / "dist")
        delta = changes(old, public)
        if args.check or args.dry_run:
            print(f"Public snapshot checked: {len(public)} files, {excluded} excluded; add {len(delta[0])}, change {len(delta[1])}, remove {len(delta[2])}.")
            return int(args.check and any(delta))
        # A second source commit must not race a first commit's still-running hook.
        with (git_dir(MIRROR) / "site-sync.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise SyncError("Another GitHub synchronization is running; retry after it finishes.") from exc
            synchronize(source, public, current_files(MIRROR / "dist"))
        return 0
    except (SyncError, OSError, UnicodeError) as exc:
        # Fixed policy errors contain file names at most, never matching text/auth.
        print(f"GitHub sync failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
