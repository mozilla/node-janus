function FindProxyForURL(url, host) {
  if (url.substring(0, 5) == 'http:' && !isPlainHostName(host)) {
    return 'HTTPS <hostport>';
  } else {
    return 'DIRECT';
  }
}
