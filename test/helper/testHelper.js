'use strict';

var spawn = require('child_process').spawn;
var http = require('http');
var url = require('url');
var spdy = require('spdy');
var fs = require('fs');
var config = require('config');

var localServer = null;
var proxy = null;
var SpdyProxy = null;

// Recursively delete modules from the 'require' cache
function unloadModule(module) {
  var modPath = require.resolve(module);

  require.cache[modPath].children.forEach(function(child) {
    unloadModule(child.id);
  });

  delete require.cache[modPath];
}

exports.loadProxy = function() {
  SpdyProxy = require('../../lib/proxy');
  proxy = new SpdyProxy(config);
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
  var agent = spdy.createAgent({
    host: config.test.proxy.host,
    port: config.test.proxy.port,
    rejectUnauthorized: false,
    spdy: {
      ssl: true,
      decompress: false
    },
  });

  var u = url.parse(requestedUrl);

  return {
    host: u.host,
    path: u.href,
    port: u.port,
    headers: {
      host: u.host,
      path: u.href,
      port: u.port,
      'x-janus-options': options
    },
    agent: agent,
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
  var req = http.get(options, function(res) {
    var content = '';
    res.on('data', function(data) {
      content += data.toString();
    });

    res.on('end', function() {
      cb(content, res.statusCode, res.headers);
    });
  });

  req.on('error', function(e) {
    console.log('Error with request:', e.message);
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
