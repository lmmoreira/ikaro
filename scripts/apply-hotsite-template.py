#!/usr/bin/env python3
"""Simulate a hotsite template on LOCALHOST: PATCH one of the six prototype manifests into your tenant.

Images go to the local Docker GCS emulator (fake-gcs-server, localhost:4443) through the local backend's
signed-URL endpoint. The script aborts if an upload URL is not localhost, so nothing can reach real GCP.

Usage:  python3 scripts/apply-hotsite-template.py <beloauto|casa47|mimo-pet|origem|clinica-lume|lume-studio>
Env:    INTERNAL_KEY (required: your local INTERNAL_API_KEY), BACKEND (default http://localhost:3001), TENANT_ID, ACTOR_ID,
        KEEP_BRAND=1|0 (default 1: keep your brand name/tagline/logo), PUBLISH=1|0 (default 1), REPO.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

TEMPLATES = ['beloauto', 'casa47', 'mimo-pet', 'origem', 'clinica-lume', 'lume-studio']
if len(sys.argv) != 2 or sys.argv[1] not in TEMPLATES:
    sys.exit(f"usage: {sys.argv[0]} <{'|'.join(TEMPLATES)}>")
template = sys.argv[1]

BACKEND = os.environ.get('BACKEND', 'http://localhost:3001')
if urlparse(BACKEND).hostname not in ('localhost', '127.0.0.1'):
    sys.exit(f'BACKEND must be localhost, got {BACKEND}')

INTERNAL_KEY = os.environ.get('INTERNAL_KEY') or os.environ.get('INTERNAL_API_KEY')
if not INTERNAL_KEY:
    sys.exit(
        'Set INTERNAL_KEY to your local backend INTERNAL_API_KEY (apps/backend/.env), e.g.\n'
        "  export INTERNAL_KEY=$(grep '^INTERNAL_API_KEY=' apps/backend/.env | cut -d= -f2)"
    )

HEADERS = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': os.environ.get('TENANT_ID', '00000000-0000-7000-8000-000000000001'),
    'X-Actor-ID': os.environ.get('ACTOR_ID', '00000000-0000-7000-8001-000000000001'),
    'X-Actor-Type': 'STAFF',
    'X-Actor-Role': 'MANAGER',
    'X-Internal-Key': INTERNAL_KEY,
}

repo = os.environ.get('REPO') or subprocess.check_output(
    ['git', 'rev-parse', '--show-toplevel'], text=True
).strip()
impl = Path(repo) / 'journeys/manager/prototypes/hotsite/hotsite-impl'


def call(method, url, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers=headers or HEADERS)
    try:
        with urllib.request.urlopen(req) as res:
            text = res.read().decode()
            return res.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as err:
        sys.exit(f'{method} {url} -> {err.code}\n{err.read().decode()}')
    except urllib.error.URLError as err:
        sys.exit(f'{method} {url} failed: {err.reason} (is the stack running?)')


manifest_file = impl / f'manifesto-{template}.json'
print(f'using repo: {repo}')
if not manifest_file.exists():
    sys.exit(
        f'manifest not found: {manifest_file}\n'
        'Run from the main ikaro checkout (after pulling TD56 Story 2), or set REPO=/path/to/ikaro'
    )
manifest = json.loads(manifest_file.read_text())
manifest.pop('seo', None)  # keep your own SEO; the prototype's og image does not exist anyway

_, current = call('GET', f'{BACKEND}/tenants/hotsite')
Path('/tmp/hotsite-backup.json').write_text(json.dumps(current, indent=2))
print('current config saved to /tmp/hotsite-backup.json')

PURPOSES = {'hero': 'hero', 'hero-v2': 'hero', 'about': 'about', 'booking': 'booking-cta', 'lead': 'lead-form'}
uploaded = {}


def upload(local: Path, name: str) -> str:
    if local in uploaded:
        return uploaded[local]
    purpose = 'gallery' if name.startswith('gallery') else PURPOSES.get(name, 'section-background')
    _, signed = call(
        'POST',
        f'{BACKEND}/tenants/hotsite/images/signed-url',
        {'fileName': local.name, 'contentType': 'image/png', 'purpose': purpose},
    )
    target = urlparse(signed['signedUrl'])
    if target.hostname not in ('localhost', '127.0.0.1'):
        sys.exit(
            f'ABORT: the backend returned a non-local upload URL ({target.hostname}). '
            'Check GCS_EMULATOR_HOST in apps/backend/.env; nothing was uploaded.'
        )
    call('PUT', signed['signedUrl'], raw=local.read_bytes(), headers={'Content-Type': 'image/png'})
    uploaded[local] = signed['filePath']
    print(f'uploaded to emulator ({target.netloc}): {local.name} -> {signed["filePath"]}')
    return signed['filePath']


text = json.dumps(manifest)
urls = sorted(set(re.findall(r'https://storage\.googleapis\.com/ikaro-template-assets/[^"]+', text)))
for url in urls:
    tid, name = re.match(r'.*/ikaro-template-assets/([^/]+)/([^/]+)\.png$', url).groups()
    candidates = [f'{tid}-{name}.png', f'{tid}-hero.png', f'{tid}-hero-v2.png', f'{tid}-gallery-1.png']
    local = next((impl / 'assets' / c for c in candidates if (impl / 'assets' / c).exists()), None)
    if local is None:
        sys.exit(f'no local image found for {url}')
    text = text.replace(url, upload(local, name))
manifest = json.loads(text)

branding = manifest['branding']
if os.environ.get('KEEP_BRAND', '1') == '1':  # keep your identity, like a real apply would
    cur = current['branding']
    branding['brandName'] = cur.get('brandName', branding['brandName'])
    branding['brandTagline'] = cur.get('brandTagline', branding.get('brandTagline', ''))
    logo = cur.get('logoUrl') or ''
    i = logo.find('tenants/')  # GET returns a full URL; PATCH wants the storage path
    branding['logoUrl'] = logo[i:] if i != -1 else logo

status, _ = call('PATCH', f'{BACKEND}/tenants/hotsite', {'branding': branding, 'layout': manifest['layout']})
print(f'PATCH -> {status}: template "{template}" saved as your draft')
if os.environ.get('PUBLISH', '1') == '1':
    status, _ = call('POST', f'{BACKEND}/tenants/hotsite/publish', {})
    print(f'publish -> {status}')
