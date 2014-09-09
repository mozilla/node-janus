'use strict';

var fs = require('fs');
var url = require('url');
var util = require('util');
var net = require('net');
var http = require('http');
var spdy = require('spdy');

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

var SpdyProxy = function(options) {

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

  // Handles GET and POST request.
  function handleRequest(request, response) {
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
