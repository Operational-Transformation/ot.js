var webpage = require('webpage');
var page = webpage.create();

page.onError = function (msg, trace) {
  console.log(msg);
  phantom.exit(1);
};

page.open('http://localhost:3000/codemirror/test.html', function (status) {
  //console.log(status);
  phantom.exit(0);
});