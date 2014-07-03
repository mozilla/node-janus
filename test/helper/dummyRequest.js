'use strict';

var DummyRequest = function(url) {
  this.headers = { path: url };
  this.url = url;
};

DummyRequest.prototype.log = function() {};
DummyRequest.prototype.debug = function() {};
DummyRequest.prototype.info = function() {};
DummyRequest.prototype.warn = function() {};
DummyRequest.prototype.error = function() {};

module.exports = DummyRequest;
