'use strict';

exports.byteToKb = function(b) {
  return b / 1024;
};

exports.byteToMb = function(b) {
  return b / 1048576;
};

exports.byteToMb = function(b) {
  return b / 1048576;
};

exports.kbToByte = function(kb) {
  return kb * 1024;
};

exports.mbToByte = function(mb) {
  return mb * 1048576;
};

exports.forEach = function(obj, callback) {
  for (var id in obj) {
    if (obj.hasOwnProperty(id)) {
      callback(obj[id], id);
    }
  }
};

// Returns the primary language-location tuple for the given Accept-Language
// header. Example: locale('en-US,en;q=0.8;...') == ['en', 'us']
exports.locale = function(header) {
  var NA = 'unknown';
  var locale = [NA, NA];

  if (!header) {
    return locale;
  }

  var tuple = header.toLowerCase().split(',')[0].split(';')[0].split('-');

  if (tuple.length > 1) {
    var lastIndex = tuple.length - 1;
    locale[0] = tuple.slice(0, lastIndex).join('-') || NA;
    locale[1] = tuple[lastIndex] || NA;
  } else if (tuple.length > 0) {
    locale[0] = tuple[0] || NA;
  }

  return locale;
};
