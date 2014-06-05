var CONFIG = require('config');

var util = require('./util');

var plugins = util.loadPluginsSync(__dirname, CONFIG);

exports.handleRequest = function(request, response, options) {
  return plugins.request.some(function(plugin) {
    return plugin.handleRequest(request, response, options);
  });
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
