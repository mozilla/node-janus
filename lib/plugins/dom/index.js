'use strict';

var CONFIG = require('config');
var util = require('../util');
var cheerio = require('cheerio');

var plugins = util.loadPluginsSync(__dirname, CONFIG);

exports.name = 'dom';

// Runs DOM manipulations
exports.handleResponse = function(request, source, dest, options) {
  if (util.matchHeaders(source.headers, { 'content-type': /html/ })) {
    request.log('intercepting for DOM manipulation: ' +
      source.headers['content-type']);

    var docdata = '';
    source.on('data', function(buf) {
      docdata += buf.toString();
    });

    source.on('end', function() {
      var $ = cheerio.load(docdata);

      var i = 0;
      function nextPlugin() {
        if (i < plugins.dom.length) {
          plugins.dom[i++].handleDOMResponse(request, source, $,
                                             nextPlugin, options);
        } else {
          // No more DOM plugins, write out the new (presumably changed) DOM
          dest.write(new Buffer($.html()), function() {
            dest.end();
          });
        }
      }

      nextPlugin();
    });

    dest.contentLengthChange = true;
    dest.accumulate = true;
  } else {
    source.pipe(dest);
  }

  source.resume();
};
