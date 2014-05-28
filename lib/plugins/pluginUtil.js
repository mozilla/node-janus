

exports.matchHeaders = function(headers, query) {
  var headerNames = Object.keys(query);
	for (var i = 0; i < headerNames.length; i++) {
    var headerName = headerNames[i];
    var queryVal = query[headerName];
    var headerVal = headers[headerName] || '';

    if (typeof queryVal == 'boolean' &&
        !!headerVal != queryVal) {
      //console.log("failed to match '%s' and boolean '%s' for '%s'", headerVal, queryVal, headerName);
      return false;
    }

    if (queryVal instanceof RegExp &&
        !headerVal.match(queryVal)) {
      //console.log("failed to match '%s' and RegExp '%s' for '%s'", headerVal, queryVal, headerName);
      return false;
    }

    if (typeof queryVal == 'string' &&
        headerVal !== queryVal) {
      //console.log("failed to match '%s' and '%s' exact for '%s'", headerVal, queryVal, headerName);
      return false;
    }
  }

  return true;
}