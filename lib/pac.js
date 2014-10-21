'use strict';

var url = require('url');
var util = require('util');
var http = require('http');
var CONFIG = require('config');

var log = require('./log');

var PAC_TUNNEL_HTTPS =
  'function FindProxyForURL(url, host) {\n' +
  '  if ((url.substring(0, 5) != "http:" &&\n' +
  '       url.substring(0, 6) != "https:") ||\n' +
  '      isPlainHostName(host) ||\n' +
  '      shExpMatch(host, "*.local") ||\n' +
  '      isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0") ||\n' +
  '      isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0") ||\n' +
  '      isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||\n' +
  '      isInNet(dnsResolve(host), "127.0.0.0", "255.255.255.0")) {\n' +
  '    return "DIRECT";\n' +
  '  }\n' +
  '  return "HTTPS %s:%d";\n' +
  '}\n';

var PAC_NO_TUNNEL =
  'function FindProxyForURL(url, host) {\n' +
  '  if (url.substring(0, 5) != "http:" ||\n' +
  '      isPlainHostName(host) ||\n' +
  '      shExpMatch(host, "*.local") ||\n' +
  '      isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0") ||\n' +
  '      isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0") ||\n' +
  '      isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||\n' +
  '      isInNet(dnsResolve(host), "127.0.0.0", "255.255.255.0")) {\n' +
  '    return "DIRECT";\n' +
  '  }\n' +
  '  return "HTTPS %s:%d";\n' +
  '}\n';

// Default PAC server.
var PacServer = function(options) {

  function createPacFile(host, port) {
    if (options.pac.tunnelSsl) {
      return util.format(PAC_TUNNEL_HTTPS, host, port);
    } else {
      return util.format(PAC_NO_TUNNEL, host, port);
    }
  }

  function handleListen() {
    log.info('PAC Server listens on port %d', options.pac.port);
  }

  // Handle client-side JSON reports.
  function handleClientReport(request, callback) {
    var report = '';
    request.on('data', function(chunk) {
      report += chunk.toString();
    });

    request.on('end', function() {
      try {
        report = { bugReport: JSON.parse(report) };

        if (!report.bugReport.client) {
          log.warn('malformed client bug report');
          return callback(null, false);
        }

        // Add server config and log report.
        report.bugReport.server = CONFIG;
        log.error(JSON.stringify(report));

        return callback(null, true);
      } catch (e) {
        log.warn('client report parse error: ' + e.message);
        return callback(e, false);
      }
    });

    request.on('close', function() {
      log.warn('unexpected close in PAC client report');
      return callback(null, false);
    });

    request.on('error', function(e) {
      log.error('client report error: ' + e.message);
      return callback(e, false);
    });
  }

  function sendPac(httpOpts, response) {
    var pac = createPacFile(httpOpts.host, options.proxy.port);
    response.writeHead(200, {
      'Content-Length': pac.length,
      'Content-Type': 'text/plain'
    });
    response.end(pac);
  }

  // Handle PAC file request.
  function handleRequest(request, response) {
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

    if (httpOpts.method === 'POST') {
      // This could be a client report.
      handleClientReport(request, function(err, handled) {
        if (!err && handled) {
          response.end();
        } else {
          sendPac(httpOpts, response);
        }
      });
    } else {
      sendPac(httpOpts, response);
    }
  }

  http.Server.call(this);

  this.on('request', handleRequest);
  this.on('listening', handleListen);
};
util.inherits(PacServer, http.Server);

module.exports = PacServer;
