var util = require('util');
var Duplex = require('stream').Duplex;

var PassthroughPlugin = require('./passthrough');
var GzipPlugin = require('./gzip');
var DeliverPlugin = require('./deliver');

var plugins = {
  options: [GzipPlugin],
  response: [PassthroughPlugin, GzipPlugin, DeliverPlugin]
};

function PipedResponse(response, options) {
  this.statusCode = response.statusCode;
  this.headers = util._extend(response.headers, {});

  this._read = function(size) {
    // Chunks are immediately written to the read buffer in _write, no work to do here
  };

  this.on('finish', function() {
    this.push(null);
  })

  this._write = function(chunk, encoding, callback) {
    this.push(chunk);
    callback();
  };

  Duplex.call(this, options);

  // Start off paused. Readers need to explicitly resume to begin receiving events.
  this.pause();
}
util.inherits(PipedResponse, Duplex);

exports.handleResponse = function(request, source, dest, options) {
  var currentSource = source;
  var currentDest = null;
  plugins.response.forEach(function(plugin, i) {
    currentDest = i == plugins.response.length - 1 ? dest : new PipedResponse(currentSource);
    plugin.handleResponse(request, currentSource, currentDest, options);    
    currentSource = currentDest;
  });
};

var pluginOpts = {};
plugins.options.forEach(function(plugin) {
  pluginOpts = util._extend(plugin.options, pluginOpts);
});

exports.options = pluginOpts;