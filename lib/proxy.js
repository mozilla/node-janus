var fs = require('fs');
var url = require('url');
var util = require('util');
var net = require('net');
var http = require('http');
var spdy = require('spdy');
var plugins = require('./plugins');

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
    console.log('%s listens on port %d', options.name, options.proxy.port);
  }

  // Handles GET and POST request.
  function handleRequest(request, response) {
    var httpOpts = {
      host: request.headers.host.split(':')[0],
      port: request.headers.host.split(':')[1] || 80,
      path: request.headers.path || url.parse(request.url).path,
      method: request.method,
      headers: request.headers
    };

    console.log('%s\tHTTP/%s\t%s\t%s\t%s',
        new Date().toISOString(),
        request.httpVersion,
        httpOpts.method,
        httpOpts.host,
        shortenUrl(httpOpts.path)
    );

    var forwardRequest = http.request(httpOpts, function(forwardResponse) {
      forwardResponse.headers['proxy-agent'] = options.title;

      request.log = function() {
        console.log('%s\t%s\t%s',
                    new Date().toISOString(),
                    shortenUrl(request.url),
                    util.format.apply(null,
                      Array.prototype.slice.call(arguments, 0)));
      };

      plugins.handleResponse(request, forwardResponse, response, options);
    });

    forwardRequest.on('error', function(e) {
      console.error('Client error: %s', e.message);
      response.writeHead(502, 'Proxy fetch failed');
      response.end();
    });

    // Pipe POST data.
    request.pipe(forwardRequest);

    response.on('close', function() {
      forwardRequest.abort();
    });
  }

  // Handles CONNECT request.
  function handleConnect(request, socket) {
    var tunnelOpts = {
      host: request.url.split(':')[0],
      port: request.url.split(':')[1] || 443,
    };

    console.log('%s\tHTTPS/%s\t%s\t%s',
        new Date().toISOString(),
        request.httpVersion,
        request.method,
        tunnelOpts.host
    );

    var tunnel = net.createConnection(tunnelOpts, function() {
      synReply(socket, 200, 'Connection established',
        {
          Connection: 'keep-alive',
          'Proxy-Agent': options.title
        },
        function() {
          tunnel.pipe(socket);
          socket.pipe(tunnel);
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
