'use strict';

var CONFIG = require('config');

var util = require('./util');

var plugins = util.loadPluginsSync(__dirname, CONFIG);

exports.handleRequest = function(request, response, options, callback) {
  // Handles request with given plugin (per id) and recursively calls the next
  // plugin handler if unsuccessful.
  function handleRequest(pluginIndex) {
    if (pluginIndex >= plugins.request.length) {
      // No plugin could successfully handle the request.
      callback(null, false);
      return;
    }

    var plugin = plugins.request[pluginIndex];
    plugin.handleRequest(request, response, options, function(err, handled) {
      if (!err && handled) {
        // The plugin successfully handled the request, abort the series.
        callback(null, true);
      } else {
        // The plugin failed handling the request, try the next plugin.
        handleRequest(pluginIndex + 1);
      }
    });
  }

  // Initiate the request handling series with the first plugin.
  handleRequest(0);
};

exports.handleResponse = function(request, source, dest, options) {
  var currentSource = source;
  var currentDest = null;
  plugins.response.forEach(function(plugin, i) {
    currentDest = i === plugins.response.length - 1 ?
                  dest :
                  new util.PipedResponse(currentSource);
    plugin.handleResponse(request, currentSource, currentDest, options);
    currentSource = currentDest;
  });
};
