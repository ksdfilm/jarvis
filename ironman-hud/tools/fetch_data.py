"""ดึงข้อมูลที่หน้าเว็บดึงตรงไม่ได้ (ไม่มี CORS) มาเก็บเป็นไฟล์ JSON ในเว็บเรา — ฟรีทั้งหมด ไม่ต้องใช้คีย์
รันโดย GitHub Actions ทุก 3 ชม. (.github/workflows/data.yml) หรือรันเองก็ได้:
    python ironman-hud/tools/fetch_data.py ironman-hud/data

  storms.json   พายุหมุนเขตร้อนที่ยังมีอยู่ (GDACS)
  fires.json    จุดความร้อน/ไฟป่า 24 ชม. ในไทยและประเทศรอบๆ (NASA FIRMS, ดาวเทียม VIIRS)
  holidays.json วันหยุด/วันสำคัญของไทย 3 ปี (Google Calendar สาธารณะ)
ถ้าแหล่งไหนล่ม จะเก็บไฟล์เดิมไว้ ไม่เขียนทับด้วยข้อมูลว่าง
"""
import csv, datetime as dt, io, json, os, re, sys, urllib.request

OUT = sys.argv[1] if len(sys.argv) > 1 else 'data'
UA = {'User-Agent': 'edit-hud-data/1.0 (+https://github.com)'}
now = dt.datetime.now(dt.timezone.utc)


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('saved', name)


def storms():
    frm = (now - dt.timedelta(days=10)).strftime('%Y-%m-%d')
    to = now.strftime('%Y-%m-%d')
    d = json.loads(get(f'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&fromdate={frm}&todate={to}&alertlevel=green;orange;red'))
    items = []
    for f in d.get('features', []):
        p, g = f['properties'], f['geometry']
        if str(p.get('iscurrent')).lower() != 'true' or g.get('type') != 'Point':  # GDACS ส่งมาเป็นข้อความ "true"/"false"
            continue
        sev = p.get('severitydata') or {}
        items.append({
            'name': re.sub(r'^Tropical Cyclone\s+', '', p.get('name', '')),
            'level': p.get('alertlevel', ''),
            'lon': g['coordinates'][0], 'lat': g['coordinates'][1],
            'wind': sev.get('severity'),  # km/h
            'text': sev.get('severitytext', ''),
            'from': p.get('fromdate'), 'to': p.get('todate'),
            'url': (p.get('url') or {}).get('report', ''),
        })
    save('storms.json', {'source': 'GDACS', 'updated': now.isoformat(timespec='minutes'), 'items': items})


def fires():
    # VIIRS (NOAA-20 + Suomi NPP) ภูมิภาคเอเชียตะวันออกเฉียงใต้ 24 ชม. — ไฟล์สาธารณะ ไม่ต้องใช้ MAP_KEY
    rows = []
    for sat in ('noaa-20-viirs-c2/csv/J1_VIIRS_C2', 'suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2'):
        try:
            text = get(f'https://firms.modaps.eosdis.nasa.gov/data/active_fire/{sat}_SouthEast_Asia_24h.csv').decode('utf-8')
        except Exception as e:  # noqa: BLE001 — ดาวเทียมดวงหนึ่งล่มก็ใช้อีกดวง
            print('fires skip', sat, e)
            continue
        for r in csv.DictReader(io.StringIO(text)):
            lat, lon = float(r['latitude']), float(r['longitude'])
            if 4.5 <= lat <= 23.5 and 92 <= lon <= 110 and r.get('confidence', 'n') != 'l':  # ไทย พม่า ลาว กัมพูชา เวียดนาม
                rows.append([round(lat, 3), round(lon, 3), round(float(r.get('frp') or 0), 1), r['acq_date'], r['acq_time']])
    if not rows:
        raise RuntimeError('no fire data')
    rows.sort(key=lambda x: -x[2])
    save('fires.json', {'source': 'NASA FIRMS (VIIRS)', 'updated': now.isoformat(timespec='minutes'), 'count': len(rows), 'items': rows[:4000]})


def holidays():
    t = get('https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics').decode('utf-8')
    t = t.replace('\r\n', '\n').replace('\n ', '')  # รวมบรรทัดที่ถูกพับ (RFC 5545)
    keep = {str(now.year + i) for i in range(-1, 3)}
    days = {}
    for blk in t.split('BEGIN:VEVENT')[1:]:
        d = re.search(r'DTSTART;VALUE=DATE:(\d{8})', blk)
        s = re.search(r'\nSUMMARY:(.*)', blk)
        de = re.search(r'\nDESCRIPTION:(.*)', blk)
        if not d or d.group(1)[:4] not in keep:
            continue
        iso = f'{d.group(1)[:4]}-{d.group(1)[4:6]}-{d.group(1)[6:]}'
        name = s.group(1).strip().replace(r'\,', ',').replace('​', '')
        desc = de.group(1) if de else ''
        days.setdefault(iso, []).append((name, 'วันหยุดนักขัตฤกษ์' in desc or 'วันหยุดราชการ' in desc))
    items = [{'date': k, 'name': ' / '.join(n for n, _ in v), 'off': any(o for _, o in v)} for k, v in sorted(days.items())]
    if len(items) < 20:
        raise RuntimeError('holidays too few')
    save('holidays.json', {'source': 'Google Calendar: วันหยุดในประเทศไทย', 'updated': now.date().isoformat(), 'items': items})


if __name__ == '__main__':
    failed = 0
    for job in (storms, fires, holidays):
        try:
            job()
        except Exception as e:  # noqa: BLE001 — แหล่งไหนล่มก็เก็บไฟล์เดิมไว้
            failed += 1
            print('FAILED', job.__name__, e)
    sys.exit(1 if failed == 3 else 0)
