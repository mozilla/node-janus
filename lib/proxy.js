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
var metrics = require('./metrics');
var emit = require('./emit');

var NAME = exports.name = 'proxy';
var emitter = emit.get(NAME);
// Track all metric events for all components.
metrics.trackAll();

// Shortens the given URL to given maxLen by inserting '...'.
function shortenUrl(url, maxLen) {
  var len = Math.max(5, (maxLen || 33));

  if (url.length <= len) {
    return url;
  }

  var hLen = (len - 3) / 2;
  var shortUrl = url.substr(0, hLen) + '...' + url.substr(url.length - hLen);
  return shortUrl;
}

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
    emitter.signal('count', 'request');
    emitter.signal('start', 'request');

    // Normalize request path.
    request.path = request.headers.path || url.parse(request.url).path;

    request.originalUrl = url.format({
      protocol: request.headers.scheme || 'http',
      host: request.headers.host,
      pathname: request.path
    });
    log.logify(request, shortenUrl(request.originalUrl.toString()));

    request.info('HTTP/' + request.httpVersion + ' ' + request.method);
    emitter.signal('start', 'request.plugin.request');

    var requestOptions = parseRequestOptions(request);
    request.debug('request options', requestOptions);

    var requestTimeout = setInterval(function() {
      emitter.signal('count', 'overdue');
      // Do we want to terminate the request somehow?
      request.warn('overdue');
    }, 10000);

    response.on('finish', function() {
      clearInterval(requestTimeout);
    });

    plugins.handleRequest(request, response, requestOptions,
      function(err, handled) {
        emitter.signal('end', 'request.plugin.request');

        if (handled) {
          // Request was serviced by a plugin.
          emitter.signal('end', 'request');
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
          // Pass non-2XX responses straight through
          if (forwardResponse.statusCode < 200 ||
              forwardResponse.statusCode >= 300)
          {
            response.writeHead(forwardResponse.statusCode,
                               forwardResponse.headers);
            forwardResponse.pipe(response);
            return;
          }

          forwardResponse.headers['via'] = options.title;

          emitter.signal('start', 'request.plugin.response');

          plugins.handleResponse(request, forwardResponse, response,
            requestOptions);

          response.on('finish', function() {
            emitter.signal('end', 'request');
            emitter.signal('end', 'request.plugin.response');
          });
        });

        forwardRequest.on('error', function(e) {
          console.error('Client error: '.error + e.message);
          response.writeHead(502, 'Proxy fetch failed');
          response.end();
        });

        // Pipe POST data.
        request.pipe(forwardRequest);

        response.on('close', function() {
          forwardRequest.abort();
        });
      });
  }

  // Handles CONNECT request.
  function handleConnect(request, socket) {
    emitter.signal('start', 'connect');

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

    emitter.signal('start', 'connect.tunnel');

    var tunnel = net.createConnection(tunnelOpts, function() {
      synReply(socket, 200, 'Connection established',
        {
          Connection: 'keep-alive',
          'via': options.title
        },
        function() {
          tunnel.pipe(socket);
          socket.pipe(tunnel);
          emitter.signal('end', 'connect.tunnel');
          emitter.signal('end', 'connect');
        }
      );
    });

    tunnel.setNoDelay(true);

    tunnel.on('error', function(e) {
      console.error('Tunnel error: %s', e);
      synReply(socket, 502, 'Tunnel Error', {}, function() {
        socket.end();
      });
    });
  }

  function synReply(socket, code, reason, headers, callback) {
    try {
      if (!socket._lock) {
        // Not a SPDY socket.
        console.error('Not a SPDY socket');
        return;
      }

      socket._lock(function() {
        var socket = this;
        this._spdyState.framer.replyFrame(
          this._spdyState.id, code, reason, headers,
          function(err, frame) {
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

  if (options.proxy.followRedirects) {
    // Resolve redirects before responding.
    http = require('follow-redirects').http;
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
