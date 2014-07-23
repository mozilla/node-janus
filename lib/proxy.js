'use strict';

var fs = require('fs');
var url = require('url');
var util = require('util');
var net = require('net');
var http = require('http');
var spdy = require('spdy');
var crypto = require('crypto');

var pac = require('./pac');
var plugins = require('./plugins');
var cache = require('./cache');
var log = require('./log');
var ut = require('./util');

var NAME = exports.name = 'proxy';
var RESPONSE_TIMEOUT = 10000;

var metrics = require('./metrics').session(NAME);

// Don't artificially limit the number of outgoing connections.
// This is the default in Node 0.12
http.globalAgent.maxSockets = Infinity;

var SpdyProxy = function(options, cryptoSettings) {
  cryptoSettings = cryptoSettings || {};

  function handleListen() {
    cache.init(options);
    log.info('%s listens on port %d', options.name, options.proxy.port);
  }

  function parseRequestOptions(request) {
    var options = { enabled: [], disabled: [] };
    var header = request.headers['x-janus-options'];
    if (!header) {
      return options;
    }

    var split = header.trim().split(' ');
    split.forEach(function(token) {
      if (token[0] === '+') {
        options.enabled.push(token.substring(1));
      } else if (token[0] === '-') {
        options.disabled.push(token.substring(1));
      }
    });

    return options;
  }

  function write502(response) {
    response.writeHead(502, 'Proxy fetch failed');
    response.end();
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
        report.bugReport.server = options;
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

  function handleContent(request, response) {
    // Right now we just serve the PAC for any url other than /bugreport
    // You can request /pac-tunnel to specifically ask for a PAC which
    // has HTTPS CONNECT enabled, or request /pac-no-tunnel for one
    // which has it disabled. Otherwise you get whatever default
    // the proxy has configured.

    if (request.url === '/bugreport') {
      return handleClientReport(request, function(err, handled) {
        if (!err && handled) {
          response.end();
        } else {
          handlePacRequest(request, response);
        }
      });
    } else {
      handlePacRequest(request, response);
    }
  }

  function handlePacRequest(request, response) {
    if (request.httpVersion !== '2.0') {
      // This is a HTTPS/1.1 request trying to get the PAC configuration.
      // We do not want to proxy via 1.1, so just return 500 here.
      // response.writeHead(500);
      // return response.end('HTTP/1.1 not allowed\n');
    }

    var wantTunnel = options.proxy.tunnelSsl;
    if (request.url === '/pac-tunnel') {
      wantTunnel = true;
    } else if (request.url === '/pac-no-tunnel') {
      wantTunnel = false;
    }

    var pacContent = pac.generate(request.headers.host, wantTunnel);

    response.writeHead(200, {
      'content-type': 'application/javascript',
      'content-length': pacContent.length
    });
    response.end(pacContent);
  }

  // Handles GET and POST request.
  function handleRequest(request, response) {
    if (options.metrics.request.locale) {
      var locale = ut.locale(request.headers['accept-language']);
      metrics.count('language.' + locale[0]);
      metrics.count('location.' + locale[1]);
    }

    if (options.metrics.request.ipHash && cryptoSettings.salt) {
      var ipHash = crypto.createHash('sha256')
                   .update(request.connection.remoteAddress)
                   .update(cryptoSettings.salt)
                   .digest('hex');
      metrics.set('iphash', ipHash);
    }

    var parsedUrl = url.parse(request.url);

    if (!parsedUrl.protocol) {
      // This is not a proxy request.
      return handleContent(request, response);
    }

    if (parsedUrl.protocol !== 'http:') {
      log.warn('Cannot handle scheme: ' + parsedUrl.scheme);
      return write502(response);
    }

    metrics.count('request');
    metrics.streamTimer(response, 'response', RESPONSE_TIMEOUT);

    // Normalize request path.
    request.path = request.headers.path || url.parse(request.url).path;

    request.originalUrl = url.format({
      protocol: request.headers.scheme || 'http',
      host: request.headers.host,
      pathname: request.path
    });

    // Don't output the url in logs on production
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      log.logify(request, request.originalUrl.toString());
    } else {
      log.logify(request);
    }

    request.info('HTTP/' + request.httpVersion + ' ' + request.method);

    var requestOpts = parseRequestOptions(request);
    request.debug('request options', requestOpts);

    response.on('close', function() {
      request.warn('unexpected close in ' + NAME);
    });

    response.on('error', function(e) {
      request.error(NAME + ' response error: ' + e.message);
    });

    var pluginRequestTimer = metrics.timer('plugin.request');

    plugins.handleRequest(request, response, requestOpts, function(e, handled) {
      pluginRequestTimer.stop();

      if (handled) {
        // Request was serviced by a plugin.
        return;
      }

      var fwdOpts = {
        host: request.headers.host.split(':')[0],
        port: request.headers.host.split(':')[1] || 80,
        path: request.path,
        method: request.method,
        headers: request.headers
      };

      var forwardRequest = http.request(fwdOpts, function(forwardResponse) {
        // Pass non-2XX responses straight through.
        if (forwardResponse.statusCode < 200 ||
            forwardResponse.statusCode >= 300)
        {
          metrics.count('response.pass-through');

          response.writeHead(forwardResponse.statusCode,
                             forwardResponse.headers);
          forwardResponse.pipe(response);
          return;
        }

        metrics.streamTimer(response, 'plugin.response');

        forwardResponse.headers.via = options.title;
        plugins.handleResponse(request, forwardResponse, response, requestOpts);
      });

      metrics.streamTimer(forwardRequest, 'forward.request', RESPONSE_TIMEOUT);

      forwardRequest.on('error', function(e) {
        request.error(NAME + ' forward request error: ' + e.message);
        response.writeHead(502, 'Proxy fetch failed');
        response.end();
      });

      forwardRequest.on('close', function() {
        request.warn('unexpected close in ' + NAME);
      });

      response.on('close', function() {
        forwardRequest.abort();
      });

      response.on('error', function() {
        forwardRequest.abort();
      });

      // Pipe POST data.
      request.pipe(forwardRequest);
    });
  }

  // Handles CONNECT request.
  function handleConnect(request, socket) {
    metrics.count('connect');

    var tunnelOpts = {
      host: request.url.split(':')[0],
      port: request.url.split(':')[1] || 443,
    };

    log.info('%s\tHTTPS/%s\t%s\t%s',
        new Date().toISOString(),
        request.httpVersion,
        request.method,
        tunnelOpts.host
    );

    var tunnel = net.createConnection(tunnelOpts, function() {
      synReply(socket, 200, 'Connection established',
        {
          Connection: 'keep-alive',
          'via': options.title
        },
        function() {
          tunnel.pipe(socket);
          socket.pipe(tunnel);
        }
      );
    });

    tunnel.setNoDelay(true);

    tunnel.on('error', function(e) {
      log.error('Tunnel error: %s', e);
      synReply(socket, 502, 'Tunnel Error', {}, function() {
        socket.end();
      });
    });
  }

  function synReply(socket, code, reason, headers, callback) {
    try {
      if (!socket._lock) {
        // Websocket detected, fallback to HTTPS tunneling.
        metrics.count('websocket');

        var replyHeader = util.format('HTTP/1.1 %d %s\r\n', code, reason);
        ut.forEach(headers, function(value, key) {
          replyHeader += util.format('%s: %s\r\n', key, value);
        });
        replyHeader += '\r\n';

        socket.write(replyHeader, 'UTF-8', callback);
        return;
      }

      socket._lock(function() {
        var socket = this;
        this._spdyState.framer.replyFrame(
          this._spdyState.id, code, reason, headers,
          function(e, frame) {
            socket.connection.write(frame);
            socket._unlock();
            callback.call();
          }
        );
      });
    } catch (error) {
      log.error('synReply error: ' + error.message);
      callback.call();
    }
  }

  spdy.server.Server.call(this, {
    key: fs.readFileSync(options.proxy.sslKeyPath),
    cert: fs.readFileSync(options.proxy.sslCertPath)
  });

  this.on('connect', handleConnect);
  this.on('request', handleRequest);
  this.on('listening', handleListen);
};
util.inherits(SpdyProxy, spdy.server.Server);

module.exports = SpdyProxy;

module.exports.log = log;
