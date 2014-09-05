'use strict';

var rewire = require('rewire');
var http = require('http');
var url = require('url');

var helper = require('../helper/testHelper');
var DummyRequest = require('../helper/dummyRequest');
var DummyResponse = require('../helper/dummyResponse');
var urlExpander = rewire('../../lib/plugins/urlexpander.js');
var config = require('config').test;

require('chai').should();

var server = null;

function requestHandler(request, response) {
  var requestedUrl = url.parse(request.url);

  if (requestedUrl.pathname === 'destination') {
    response.writeHead(200);
    response.write('Hello!');
  } else if (requestedUrl.pathname === '/simpleredirect') {
    response.writeHead(302, { location: helper.getLocalUrl('destination') });
  } else if (requestedUrl.pathname === '/multipleredirect1') {
    response.writeHead(302,
                       { location: helper.getLocalUrl('multipleredirect2') });
  } else if (requestedUrl.pathname === '/multipleredirect2') {
    response.writeHead(302, { location: helper.getLocalUrl('destination') });
  } else if (requestedUrl.pathname === '/loopredirect1') {
    response.writeHead(302, { location: helper.getLocalUrl('loopredirect2') });
  } else if (requestedUrl.pathname === '/loopredirect2') {
    response.writeHead(302, { location: helper.getLocalUrl('loopredirect1') });
  } else if (requestedUrl.pathname === '/external') {
    response.writeHead(302, { location: 'http://example.com/' });
  } else {
    response.writeHead(404);
  }

  response.end();
}

module.exports = {
  'url expander': {
    before: function() {
      urlExpander.__get__('hosts')['127.0.0.1'] = true;
      server = http.createServer(requestHandler);
      server.listen(config.localServer.port);
    },

    after: function() {
      server.close();
    },

    'follow simple redirect': function(done) {
      var req = new DummyRequest(helper.getLocalUrl('simpleredirect'));
      var res = new DummyResponse();

      urlExpander.handleRequest(req, res, null, function(err, handled) {
        handled.should.equal(true);
        done();
      });
    },

    'circular redirects': function(done) {
      var req = new DummyRequest(helper.getLocalUrl('loopredirect1'));
      var res = new DummyResponse();

      urlExpander.handleRequest(req, res, null, function() {
        // it just has to stop
        done();
      });
    },

    'external redirect': function(done) {
      var req = new DummyRequest(helper.getLocalUrl('external'));
      var res = new DummyResponse();

      urlExpander.handleRequest(req, res, null, function(err, handled) {
        handled.should.equal(true);
        done();
      });
    },

    'unlisted domain': function(done) {
      var reqUrl = 'http://localhost:' + config.localServer.port +
                   '/simpleredirect';
      var req = new DummyRequest(reqUrl);
      var res = new DummyResponse();

      urlExpander.handleRequest(req, res, null, function(err, handled) {
        handled.should.equal(false);
        done();
      });
    },
  },
};
