'use strict';

var fs = require('fs');
var url = require('url');
var util = require('util');
var http = require('http');
var http2 = require('http2');

var plugins = require('./plugins');
var cache = require('./cache');
var log = require('./log');

var NAME = exports.name = 'proxy';
var RESPONSE_TIMEOUT = 10000;

var metrics = require('./metrics').session(NAME);

// Don't artificially limit the number of outgoing connections.
// This is the default in Node 0.12
http.globalAgent.maxSockets = Infinity;

var Http2Proxy = function(options) {

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

  function stripDeprecatedHeaders(headers) {
    if (!headers) {
      return;
    }

    var DEPRECATED_HEADERS = [
      'connection',
      'host',
      'keep-alive',
      'proxy-connection',
      'te',
      'transfer-encoding',
      'upgrade'
    ];

    Object.keys(headers).forEach(function(header) {
      if (DEPRECATED_HEADERS.indexOf(header) >= 0) {
        delete headers[header];
      }
    });
  }

  function write502(response) {
    response.writeHead(502, 'Proxy fetch failed');
    response.end();
  }

  // Handles GET and POST request.
  function handleRequest(request, response) {
    var parsedUrl = url.parse(request.url);
    if (parsedUrl.protocol !== 'http:') {
      log.warn('Cannot handle scheme: ' + parsedUrl.scheme);
      return write502(response);
    }

    metrics.count('request');
    metrics.streamTimer(response, 'response', RESPONSE_TIMEOUT);

    // Don't output the url in logs on production
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      log.logify(request, request.url);
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
      request.error(NAME + ' response error: ', e);
    });

    var pluginRequestTimer = metrics.timer('plugin.request');

    plugins.handleRequest(request, response, requestOpts, function(e, handled) {
      pluginRequestTimer.stop();

      if (handled) {
        // Request was serviced by a plugin.
        return;
      }

      // A request plugin may have rewritten the request url, so
      // parse it again.
      parsedUrl = url.parse(request.url);

      var splitHost = parsedUrl.host.split(':');

      var fwdOpts = {
        host: splitHost[0],
        port: splitHost[1] || 80,
        path: parsedUrl.path,
        method: request.method,
        headers: request.headers
      };

      // FIXME(snorp): I am not sure if the incoming value here should be
      // for the destination url or the proxy itself, but node-http2 has
      // it set for the proxy. It definitely needs to be set for the
      // destination in the forwarded request, though, so do that here.
      fwdOpts.headers.host = parsedUrl.host;

      var forwardRequest = http.request(fwdOpts, function(forwardResponse) {
        stripDeprecatedHeaders(forwardResponse.headers);

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
        write502(response);
      });

      forwardRequest.on('close', function() {
        request.warn('unexpected close in ' + NAME);
      });

      response.on('close', function() {
        forwardRequest.abort();
      });

      response.once('error', function() {
        forwardRequest.abort();
      });

      request.once('error', function(err) {
        request.error('aborting forward request due to request error', err);
        forwardRequest.abort();
      });

      // Pipe POST data.
      request.pipe(forwardRequest);
    });
  }

  // Handles CONNECT request.
  /*
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
        // Not a SPDY socket.
        log.error('Not a SPDY socket');
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
      callback.call();
    }
  }
  */

  if (options.proxy.followRedirects) {
    // Resolve redirects before responding.
    http = require('follow-redirects').http;
  }

  var serverOptions = {
    key: fs.readFileSync(options.proxy.sslKeyPath),
    cert: fs.readFileSync(options.proxy.sslCertPath),
    ALPNProtocols: [http2.ImplementedVersion],
    NPNProtocols: [http2.ImplementedVersion]
  };

  if (options.logging.http2) {
    serverOptions.log = {
      fatal: log.error,
      error: log.error,
      warn: log.warn,
      info: log.info,
      debug: log.debug,
      trace: log.debug,
      child: function() { return this; }
    };
  }

  http2.Server.call(this, serverOptions);

  this.on('request', handleRequest);
  this.on('listening', handleListen);
};
util.inherits(Http2Proxy, http2.Server);

module.exports = Http2Proxy;

module.exports.log = log;
