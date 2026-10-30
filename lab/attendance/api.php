<?php
// FACE//TIME API — ลงเวลาด้วยใบหน้า (ใช้ภายในวง LAN เท่านั้น)
//   GET  ?a=ping                 สถานะ
//   GET  ?a=list                 รายชื่อ + face descriptor (ใช้จับคู่ในเบราว์เซอร์)
//   GET  ?a=logs&date=YYYY-MM-DD ประวัติลงเวลาของวันนั้น
//   POST ?a=enrol  {id,name,dept,desc[128],samples,consent:true}
//   POST ?a=delete {id, logs:bool}
//   POST ?a=log    {id,type:'in'|'out',dist}   เวลาใช้ของเซิร์ฟเวอร์
// เก็บเป็นไฟล์ JSON ใน data/ (มี .htaccess กันเปิดตรง) — ไม่เก็บรูปภาพใบหน้า เก็บแค่ตัวเลข 128 ค่า
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
date_default_timezone_set('Asia/Bangkok');

// LAN only: localhost or a private address
$client = $_SERVER['REMOTE_ADDR'] ?? '';
// Tailscale peers come from 100.64.0.0/10 (private to your tailnet, not the public internet)
$tailscale = (ip2long($client) & 0xFFC00000) === (ip2long('100.64.0.0') & 0xFFC00000);
if (filter_var($client, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE) && !in_array($client, ['127.0.0.1', '::1']) && !$tailscale) {
    http_response_code(403);
    exit(json_encode(['error' => 'LAN only']));
}

define('DATA', __DIR__ . '/data/');
if (!is_dir(DATA . 'logs')) @mkdir(DATA . 'logs', 0775, true);
if (!is_file(DATA . '.htaccess')) @file_put_contents(DATA . '.htaccess', "Require all denied\n");

function out($v, $code = 200) { http_response_code($code); exit(json_encode($v, JSON_UNESCAPED_UNICODE)); }
function fail($msg, $code = 400) { out(['error' => $msg], $code); }
function load($p, $def) { return is_file($p) ? (json_decode(file_get_contents($p), true) ?? $def) : $def; }
function save($p, $v) { file_put_contents($p, json_encode($v, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX); }
function lock() { static $h; $h = fopen(DATA . '.lock', 'c'); flock($h, LOCK_EX); return $h; }
function logFile($date) { return DATA . 'logs/' . $date . '.json'; }
function validDate($d) { return is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d); }
function str($v, $max) { return mb_substr(trim(strip_tags((string)($v ?? ''))), 0, $max); }

$a = $_GET['a'] ?? '';
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) fail('bad json');
}
$EMP = DATA . 'employees.json';

switch ($a) {
case 'ping':
    out(['ok' => true, 'time' => date('c'), 'employees' => count(load($EMP, []))]);

case 'list':
    out(['employees' => array_values(load($EMP, []))]);

case 'enrol':
    $id = str($body['id'] ?? '', 20);
    if (!preg_match('/^[A-Za-z0-9_\-]{1,20}$/', $id)) fail('รหัสพนักงานใช้ได้เฉพาะ A-Z 0-9 - _ (ไม่เกิน 20 ตัว)');
    $name = str($body['name'] ?? '', 80);
    if ($name === '') fail('กรุณาใส่ชื่อ');
    if (($body['consent'] ?? false) !== true) fail('ต้องได้รับความยินยอม (PDPA) ก่อนเก็บข้อมูลใบหน้า');
    $desc = $body['desc'] ?? null;
    if (!is_array($desc) || count($desc) !== 128) fail('face descriptor ไม่ถูกต้อง');
    foreach ($desc as $i => $v) { if (!is_numeric($v) || !is_finite((float)$v) || abs($v) > 5) fail('face descriptor ไม่ถูกต้อง'); $desc[$i] = round((float)$v, 6); }
    $h = lock();
    $emps = load($EMP, []);
    $old = $emps[$id] ?? null;
    $emps[$id] = [
        'id' => $id, 'name' => $name, 'dept' => str($body['dept'] ?? '', 60),
        'desc' => $desc, 'samples' => max(1, min(20, (int)($body['samples'] ?? 1))),
        'consent_at' => date('c'), 'created' => $old['created'] ?? date('c'), 'updated' => date('c'),
    ];
    save($EMP, $emps);
    out(['ok' => true, 'updated' => (bool)$old]);

case 'delete':
    $id = str($body['id'] ?? '', 20);
    $h = lock();
    $emps = load($EMP, []);
    if (!isset($emps[$id])) fail('ไม่พบพนักงาน', 404);
    unset($emps[$id]);
    save($EMP, $emps);
    $removed = 0;
    if (!empty($body['logs'])) {
        foreach (glob(DATA . 'logs/*.json') as $f) {
            $rows = load($f, []);
            $keep = array_values(array_filter($rows, fn($r) => ($r['id'] ?? '') !== $id));
            if (count($keep) !== count($rows)) { $removed += count($rows) - count($keep); $keep ? save($f, $keep) : unlink($f); }
        }
    }
    out(['ok' => true, 'logs_removed' => $removed]);

case 'log':
    $id = str($body['id'] ?? '', 20);
    $type = $body['type'] ?? '';
    if (!in_array($type, ['in', 'out'], true)) fail('type ต้องเป็น in หรือ out');
    $h = lock();
    $emps = load($EMP, []);
    if (!isset($emps[$id])) fail('ไม่พบพนักงาน', 404);
    $e = $emps[$id];
    $row = ['id' => $id, 'name' => $e['name'], 'dept' => $e['dept'], 'type' => $type, 'at' => date('c'),
            'dist' => round((float)($body['dist'] ?? 0), 3), 'live' => (bool)($body['live'] ?? false)];
    $f = logFile(date('Y-m-d'));
    $rows = load($f, []);
    $rows[] = $row;
    save($f, $rows);
    out(['ok' => true, 'row' => $row]);

case 'logs':
    $d = $_GET['date'] ?? date('Y-m-d');
    if (!validDate($d)) fail('วันที่ไม่ถูกต้อง');
    out(['date' => $d, 'rows' => load(logFile($d), [])]);

default:
    fail('unknown action');
}
