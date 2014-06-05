var url = require('url');
var util = require('util');
var http = require('http');

// Default PAC server.
var PacServer = function(options) {

  function handleListen() {
    console.log('PAC Server listens on port %d', options.pac.port);
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
