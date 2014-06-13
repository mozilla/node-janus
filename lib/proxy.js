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
    log.debug('%s listens on port %d', options.name, options.proxy.port);
  }

  // Handles GET and POST request.
  function handleRequest(request, response) {
    emitter.signal('start', 'request');

    // Normalize request path.
    request.path = request.headers.path || url.parse(request.url).path;

    request.originalUrl = url.format({
      protocol: request.headers.scheme || 'http',
      host: request.headers.host,
      pathname: request.path
    });
    log.logify(request, shortenUrl(request.originalUrl.toString()));

    var httpOpts = {
      host: request.headers.host.split(':')[0],
      port: request.headers.host.split(':')[1] || 80,
      path: request.path,
      method: request.method,
      headers: request.headers
    };

    request.debug('HTTP/' + request.httpVersion + ' ' + request.method);
    emitter.signal('start', 'request.plugin.request');

    plugins.handleRequest(request, response, options, function(err, handled) {
      emitter.signal('end', 'request.plugin.request');

      if (handled) {
        // Request was serviced by a plugin.
        emitter.signal('end', 'request');
        return;
      }

      var forwardRequest = http.request(httpOpts, function(forwardResponse) {
        // Pass 300 responses straight through
        //
        // This is kind of terrible, and really just a hack to work around
        // the fact that our plugins all expect a succesful response right now.
        if (forwardResponse.statusCode >= 300 &&
            forwardResponse.statusCode < 400) {
          response.writeHead(forwardResponse.statusCode,
                             forwardResponse.headers);
          forwardResponse.pipe(response);
          return;
        }

        forwardResponse.headers['proxy-agent'] = options.title;

        emitter.signal('start', 'request.plugin.response');

        plugins.handleResponse(request, forwardResponse, response, options);

        emitter.signal('end', 'request.plugin.response');
        emitter.signal('end', 'request');
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

    log.debug('%s\tHTTPS/%s\t%s\t%s',
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
          'Proxy-Agent': options.title
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
