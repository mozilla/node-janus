function FindProxyForURL(url, host) {
  if ((url.substring(0, 5) == 'http:' ||
       url.substring(0, 6) == 'https:') &&
      !isPlainHostName(host))
  {
    return 'HTTPS <hostport>';
  } else {
    return 'DIRECT';
  }
}
