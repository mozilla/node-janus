var fs = require('fs');
var path = require('path');
var url = require('url');
var util = require('util');
var net = require('net');
var http = require('http');
var spdy = require('spdy');
var cache = require('memory-cache');
var png = require('png').Png;
var colors = require('colors');

var plugins = require('./plugins');
var pkg = require('../package.json');

// Console output colors.
colors.setTheme({
  time: 'grey',
  version: 'grey',
  requestMethod: 'magenta',
  connectMethod: 'red',
  host: 'cyan',
  url: 'white',
  port: 'red',
  connect: 'green',
  error: 'red'
});

// Parse command-line arguments.
var options = require('optimist')
              .options({
                help: {
                  alias: 'h',
                  default: false
                },
                port: {
                  alias: 'p',
                  description: 'Proxy port',
                  default: 55055
                },
                keyPath: {
                  alias: 'k',
                  description: 'SSL key path',
                  default: __dirname + '/../keys/key.pem',
                },
                certPath: {
                  alias: 'c',
                  description: 'SSL certificate path',
                  default: __dirname + '/../keys/crt.pem',
                },
                pacPort: {
                  alias: 'a',
                  description: 'PAC server port',
                  default: 55555
                }
              })
              .options(plugins.options);
var parsedOptions = options.argv;

if (parsedOptions.help) {
  options.showHelp();
  process.exit(1);
}

parsedOptions.key = fs.readFileSync(parsedOptions.keyPath);
parsedOptions.cert = fs.readFileSync(parsedOptions.certPath);

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

var Proxy = function(options) {

  function handleListen() {
    console.log('Gonzales %s ' + 'listens on port '.connect + '%d'.port,
        pkg.version,
        options.port
    );
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
        new Date().toISOString().time,
        request.httpVersion.version,
        httpOpts.method.requestMethod,
        httpOpts.host.host,
        shortenUrl(httpOpts.path)
    );

    var forwardRequest = http.request(httpOpts, function(forwardResponse) {
      forwardResponse.headers['proxy-agent'] = 'Gonzales ' + pkg.version;

      plugins.handleResponse(request, forwardResponse, response, parsedOptions);
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
  }

  // Handles CONNECT request.
  function handleConnect(request, socket) {
    var tunnelOpts = {
      host: request.url.split(':')[0],
      port: request.url.split(':')[1] || 443,
    };

    console.log('%s\tHTTPS/%s\t%s\t%s',
        new Date().toISOString().time,
        request.httpVersion.version,
        request.method.connectMethod,
        tunnelOpts.host.host
    );

    var tunnel = net.createConnection(tunnelOpts, function() {
      synReply(socket, 200, 'Connection established',
        {
          'Connection': 'keep-alive',
          'Proxy-Agent': 'Gonzales ' + pkg.version
        },
        function() {
          tunnel.pipe(socket);
          socket.pipe(tunnel);
        }
      );
    });

    tunnel.setNoDelay(true);

    tunnel.on('error', function(e) {
      console.error('Tunnel error: '.error + e);
      synReply(socket, 502, 'Tunnel Error', {}, function() {
        socket.end();
      });
    });
  }

  function synReply(socket, code, reason, headers, callback) {
    try {
      if (!socket._lock) {
        // Not a SPDY socket.
        console.error('Not a SPDY socket'.error);
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

  spdy.server.Server.call(this, options);

  this.on('connect', handleConnect);
  this.on('request', handleRequest);
  this.on('listening', handleListen);
};

util.inherits(Proxy, spdy.server.Server);

// Default PAC server.
var PacServer = function(options) {

  function handleListen() {
    console.log('PAC Server ' + 'listens on port '.connect + '%d'.port,
        options.pacPort
    );
  }

  // Handle PAC file request.
  function handleRequest(request, response) {

    function createPacFile(host, port) {
      var pac = 'function FindProxyForURL(url, host) {\n' +
                '  return "HTTPS ' + host + ':' + port + '";\n}';
      return pac;
    }

    var httpOpts = {
      host: request.headers.host.split(':')[0],
      port: request.headers.host.split(':')[1] || 80,
      path: request.headers.path || url.parse(request.url).path,
      method: request.method,
      headers: request.headers
    };

    console.log('%s\tHTTP/%s\t%s\t%s\t%s',
        new Date().toISOString().time,
        request.httpVersion.version,
        httpOpts.method.requestMethod,
        httpOpts.host.host,
        shortenUrl(httpOpts.path)
    );

    var pac = createPacFile(httpOpts.host, options.port)
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

var proxy = new Proxy(parsedOptions);
proxy.listen(parsedOptions.port);

var pacServer = new PacServer(parsedOptions);
pacServer.listen(parsedOptions.pacPort);
