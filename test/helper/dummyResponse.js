'use strict';

var stream = require('stream');
var util = require('util');

// The purpose of this class is to have a class with the same atttibutes and
// behaviors as the HTTP response class
var DummyResponse = function() {
  this.writable = true;
  this.headers = [];
  stream.Writable.call(this);
};

util.inherits(DummyResponse, stream);

DummyResponse.prototype.write = function(chunk) {
  this.emit('data', chunk);
};

DummyResponse.prototype.end = function() {
  this.emit('end');
};

DummyResponse.prototype.writeHead = function() {
};

DummyResponse.writecb = DummyResponse._write;

module.exports = DummyResponse;
