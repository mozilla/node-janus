'use strict';

var url = require('url');
var util = require('util');
var http = require('http');
var log = require('./log');

var PAC_TUNNEL_HTTPS = 'function FindProxyForURL(url, host) {\n' +
                     '  return "HTTPS %s:%d";\n' +
                     '}\n';

var PAC_NO_TUNNEL = 'function FindProxyForURL(url, host) {\n' +
                       '  if (url.substring(0, 6) == "https:") {\n' +
                       '    return "DIRECT";\n' +
                       '  } else {\n' +
                       '    return "HTTPS %s:%d";\n' +
                       '  }\n' +
                       '}\n';

// Default PAC server.
var PacServer = function(options) {

  function handleListen() {
    log.debug('PAC Server listens on port %d', options.pac.port);
  }

  // Handle PAC file request.
  function handleRequest(request, response) {

    function createPacFile(host, port) {
      if (options.pac.tunnelSsl) {
        return util.format(PAC_TUNNEL_HTTPS, host, port);
      } else {
        return util.format(PAC_NO_TUNNEL, host, port);
      }
    }

    var httpOpts = {
      host: request.headers.host.split(':')[0],
      port: request.headers.host.split(':')[1] || 80,
      path: request.headers.path || url.parse(request.url).path,
      method: request.method,
      headers: request.headers
    };

    log.info('%s\tHTTP/%s\t%s\t%s\t%s',
        new Date().toISOString(),
        request.httpVersion,
        httpOpts.method,
        httpOpts.host,
        httpOpts.path
    );

    var pac = createPacFile(httpOpts.host, options.proxy.port);
    response.writeHead(200, {
      'Content-Length': pac.length,
      'Content-Type': 'text/plain'
    });
    response.end(pac);
  }

  http.Server.call(this);

  this.on('request', handleRequest);
  this.on('listening', handleListen);
};
util.inherits(PacServer, http.Server);

module.exports = PacServer;
