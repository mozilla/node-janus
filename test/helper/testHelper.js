'use strict';

var spawn = require('child_process').spawn;
var http2 = require('http2');
var url = require('url');
var fs = require('fs');
var config = require('config');

var localServer = null;
var proxy = null;
var Http2Proxy = null;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Recursively delete modules from the 'require' cache
function unloadModule(module) {
  var modPath = require.resolve(module);

  require.cache[modPath].children.forEach(function(child) {
    unloadModule(child.id);
  });

  delete require.cache[modPath];
}

exports.loadProxy = function() {
  Http2Proxy = require('../../lib/proxy');
  proxy = new Http2Proxy(config);
  proxy.listen(config.test.proxy.port);
};

exports.localAddress = 'http://127.0.0.1:' + config.test.localServer.port + '/';

exports.getLocalUrl = function(path) {
  return url.resolve(exports.localAddress, path);
};

// Launch a local webserver
exports.setupLocalServer = function(path, cb) {
  localServer = spawn('./node_modules/http-server/bin/http-server',
                       ['-c1', '-p', config.test.localServer.port, path]);
  localServer.stdout.on('data', function(data) {
    if (cb && data.toString().indexOf('stop') !== -1) {
      cb();
      cb = null;
    }
  });
  localServer.stderr.on('data', function() {});
};

exports.cleanAll = function() {
  // unload the proxy
  if (proxy) {
    proxy.close();
    proxy = null;
    unloadModule('../../lib/proxy');
  }

  // kill the local webserver
  if (localServer !== null) {
    localServer.kill('SIGINT');
    localServer = null;
  }
};

// Create the approriate request to go through the proxy
exports.makeRequest = function(requestedUrl, options) {
  return {
    protocol: 'https:',
    host: config.test.proxy.host,
    port: config.test.proxy.port,
    path: requestedUrl,
    agent: new http2.Agent(),
    headers: {
      'x-janus-options': options
    },
  };
};

// Synchronously write 'content' into a file
exports.writeToFile = function(path, content) {
  var fd = fs.openSync(path, 'w');
  fs.writeSync(fd, content);
  fs.close(fd);
};

// Get the content of a request
exports.getContent = function(options, cb) {
  var req = http2.get(options, function(res) {
    var content = '';
    res.on('data', function(data) {
      content += data.toString();
    });

    res.on('end', function() {
      cb(content, res.statusCode, res.headers);
    });
  });

  req.on('error', function(e) {
    console.error('Error with request:', e);
    cb(null);
  });
};

// Read an entire response into a Buffer
exports.readResponse = function(response, cb) {
  var bufs = [];

  response.on('data', function(b) {
    bufs.push(b);
  });

  response.on('end', function() {
    cb(null, Buffer.concat(bufs));
  });

  response.on('error', function(err) {
    cb(err);
  });
};

exports.getFileContent = function(path) {
  var BUF_SIZE = 2048;
  var buf = new Buffer(BUF_SIZE);
  var res = '';

  var fd = fs.openSync(path, 'r');
  var length = 0;
  while ((length = fs.readSync(fd, buf, 0, BUF_SIZE, null)) > 0) {
    res += buf.toString('utf8', 0, length);
  }

  fs.close(fd);

  return res;
};
