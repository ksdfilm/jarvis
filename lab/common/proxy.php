<?php
// CORS proxy for public APIs that don't send Access-Control-Allow-Origin. LAN only, whitelisted hosts, 5 s cache.
$client = $_SERVER['REMOTE_ADDR'] ?? '';
// Tailscale peers come from 100.64.0.0/10 (private to your tailnet, not the public internet)
$tailscale = (ip2long($client) & 0xFFC00000) === (ip2long('100.64.0.0') & 0xFFC00000);
if (filter_var($client, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE) && !in_array($client, ['127.0.0.1', '::1']) && !$tailscale) {
    http_response_code(403); exit('LAN only');
}
const ALLOW = ['opendata.adsb.fi', 'api.adsb.lol', 'opensky-network.org', 'www.gdacs.org', 'firms.modaps.eosdis.nasa.gov', 'api.weather.gov', 'www.tmd.go.th', 'data.tmd.go.th'];
$u = $_GET['u'] ?? '';
$host = parse_url($u, PHP_URL_HOST);
if (!preg_match('#^https://#', $u) || !in_array($host, ALLOW, true)) { http_response_code(400); exit('host not allowed'); }

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
$cache = sys_get_temp_dir() . '/labproxy_' . md5($u);
if (is_file($cache) && time() - filemtime($cache) < 5) { readfile($cache); exit; }

$ctx = stream_context_create(['http' => ['timeout' => 12, 'header' => "User-Agent: ksd-lab/1.0\r\nAccept: application/json\r\n"]]);
$body = @file_get_contents($u, false, $ctx);
if ($body === false) { http_response_code(502); exit('{"error":"upstream failed"}'); }
file_put_contents($cache, $body);
echo $body;
