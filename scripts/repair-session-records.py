#!/usr/bin/env python3
"""Repair only pre-0.5.1 Codex usage events in POSIX Harness v4 logs.
Dry-run by default. Requires zstd. Never rewrites a session held by a writer.
"""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile

TYPES = {
    'image/codex-llm-request': 'plugin:dsh-openai-oauth/image-llm-request',
    'web/codex-search-llm-request': 'plugin:dsh-openai-oauth/search-llm-request',
    'web/codex-fetch-llm-request': 'plugin:dsh-openai-oauth/fetch-llm-request',
}


def transform(data):
    lines = data.splitlines(keepends=True)
    if not lines:
        return data, 0
    header = json.loads(lines[0])
    if header.get('type') != 'session' or header.get('version') != 4:
        return data, 0
    count = 0
    for i, line in enumerate(lines[1:], 1):
        event = json.loads(line)
        if event.get('type') not in TYPES:
            continue
        if any(key in event for key in ('surfaceOp', 'sourceEventSeqs')):
            raise ValueError('Refusing to change a usage event with surface metadata')
        event['type'] = TYPES[event['type']]
        event['ignorable'] = True
        lines[i] = json.dumps(event, ensure_ascii=False, separators=(',', ':')).encode() + b'\n'
        count += 1
    return b''.join(lines), count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.home() / '.dsh/sessions')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup-dir', type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    backup = args.backup_dir or root.parent / 'install-backups' / ('session-records-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
    changed = 0
    for path in sorted(root.rglob('session.v4.jsonl.zstd')):
        with open(path.parent / 'session.lock', 'a+b') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print(json.dumps({'session': path.parent.name, 'status': 'busy-skipped'}))
                continue
            if os.fstat(lock.fileno()).st_ino != (path.parent / 'session.lock').stat().st_ino:
                raise RuntimeError('Lock inode changed')
            original = path.read_bytes()
            data = subprocess.run(['zstd', '-dc'], input=original, check=True, capture_output=True).stdout
            repaired, count = transform(data)
            if not count:
                continue
            report = {'session': path.parent.name, 'records': count, 'status': 'would-repair'}
            if args.apply:
                packed = subprocess.run(['zstd', '-q', '-c'], input=repaired, check=True, capture_output=True).stdout
                assert subprocess.run(['zstd', '-dc'], input=packed, check=True, capture_output=True).stdout == repaired
                dest = backup / path.relative_to(root)
                dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with open(dest, 'xb') as output:
                    os.chmod(dest, 0o600)
                    output.write(original)
                    output.flush()
                    os.fsync(output.fileno())
                fd, temporary = tempfile.mkstemp(prefix='.record-repair-', dir=path.parent)
                try:
                    with os.fdopen(fd, 'wb') as output:
                        os.fchmod(output.fileno(), path.stat().st_mode & 0o777)
                        output.write(packed)
                        output.flush()
                        os.fsync(output.fileno())
                    if path.read_bytes() != original:
                        raise RuntimeError('Log changed despite session lock; refusing replacement')
                    os.replace(temporary, path)
                    dirfd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
                    try:
                        os.fsync(dirfd)
                    finally:
                        os.close(dirfd)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
                report.update(status='repaired', backup=str(dest))
            changed += count
            print(json.dumps(report))
    print(json.dumps({'records': changed, 'applied': args.apply}))


if __name__ == '__main__':
    main()
