'use strict';

var spawn = require('child_process').spawn;
var http = require('http');
var url = require('url');
var spdy = require('spdy');
var fs = require('fs');
var config = require('config');
var PacServer = require('../../lib/pac');
var profile = require('mozilla-profile-builder');
var sleep = require('sleep');
var colors = require('colors');

var localServer = null;
var proxy = null;
var SpdyProxy = null;
var firefox = null;
var spdyAgent = null;

var pacServer = new PacServer(config);

exports.launchFirefox = function() {
  var path = config.test.firefoxPath;
  if (!path) {
    console.log("ERROR".red, "Path to firefox binary not set.");
    console.log("Please set firefoxPath in config/test/test.yml (must be"
                + " compiled with Marionette enabled).\n");

    process.exit(2);
  }

  var options = {
    profile: ['baseProfile', 'test/helper/profile/'],
    prefs: {
      'network.proxy.autoconfig_url': 'http://localhost:' +
                                      config.pac.port + '/',
      'network.proxy.type': 2,
      'browser.cache.disk.enable': false,
      'extensions.certvalidator.port': config.proxy.port,
      'extensions.certvalidator.host': 'localhost',
    },
  };

  profile.create(options, function(err, instance) {
    firefox = spawn(path,
          ['--marionette', '-profile', instance.path]);

    firefox.on('error', function(err) {
      console.log("Unable to launch firefox.");
      process.exit(2);
    });
  });
}

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
  proxy.listen(config.proxy.port);
  pacServer.listen(config.pac.port);
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

exports.cleanAll = function(done) {
  // unload the proxy
  if (proxy) {
    proxy.close();
    proxy = null;
    unloadModule('../../lib/proxy');
  }

  // kill the local webserver
  if (localServer !== null) {
    if (done) {
      localServer.on('exit', function() {
        done();
      });
    }
    localServer.kill('SIGINT');
    localServer = null;
  } else if (done) {
    done();
  }

  if (spdyAgent) {
    spdyAgent.close();
    spdyAgent = null;
  }

  if (firefox !== null) {
    firefox.kill('SIGINT');
    firefox = null;
  }
};

// Create the approriate request to go through the proxy
exports.makeRequest = function(requestedUrl, options) {
  if (!spdyAgent) {
    spdyAgent = spdy.createAgent({
      host: 'localhost',
      port: config.proxy.port,
      rejectUnauthorized: false,
      spdy: {
        ssl: true,
        decompress: false
      },
    });
  }
  var u = url.parse(requestedUrl);

  return {
    hostname: u.hostname,
    path: u.href,
    port: u.port,
    headers: {
      host: u.host,
      path: u.href,
      port: u.port,
      'x-janus-options': options
    },
    agent: spdyAgent,
  };
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

  req.end();
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

exports.getPercentage = function(first, second) {
  return (100 - (second * 100) / first).toFixed(2);
};

// Convert byte size to size string with appropriate unit.
exports.getPrettySize = function(size) {
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0;

  while (size > 1024 && i + 1 < units.length) {
    size /= 1024;
    i++;
  }

  return size.toFixed(2) + units[i];
};
